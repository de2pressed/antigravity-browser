// Antigravity Browser Bridge - Production Background Service Worker (v1.5.1)
const NATIVE_HOST = "com.google.antigravity.browser";

let nativePort = null;
let reconnectTimer = null;
let profileIdentity = { email: "unknown", name: "default" };

const attachedTabs = new Set();
const agentOwnedTabs = new Set(); // Created + explicitly claimed: permission to interact.
const agentCreatedTabs = new Set(); // Only these may be removed by bulk cleanup.
const debuggerAttaching = new Map();
const requestQueues = new Map();
const snapshotSessionId = crypto.randomUUID();
let snapshotGeneration = 0;
const tabSnapshots = new Map(); // tabId -> { elementMap, time }
const cursorStates = new Map(); // tabId -> { cursor, isVisible, sessionId, turnId }
const cursorTimers = new Map(); // tabId -> setTimeout timer
const activeRecordings = new Map(); // tabId -> { recordingId, tabId, outputPath, frameCount, startTime }
const pendingRecordingFinalizations = new Map(); // recordingId -> { resolve, timer }

// Persistent Tab Ownership across Service Worker Lifecycles
async function loadAgentOwnedTabs() {
  try {
    if (chrome.storage && chrome.storage.session) {
      const data = await chrome.storage.session.get(["agentOwnedTabs", "agentCreatedTabs"]);
      if (Array.isArray(data.agentOwnedTabs)) {
        const liveIds = new Set((await chrome.tabs.query({})).map(t => t.id));
        data.agentOwnedTabs.filter(id => liveIds.has(id)).forEach(id => agentOwnedTabs.add(id));
        // Legacy ownership cannot prove a tab was created; preserve it on cleanup.
        (data.agentCreatedTabs || []).filter(id => liveIds.has(id)).forEach(id => agentCreatedTabs.add(id));
      }
    }
  } catch (e) {
    console.warn("[Antigravity Bridge] Could not load agentOwnedTabs from session storage:", e);
  }
}

async function saveAgentOwnedTabs() {
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ agentOwnedTabs: Array.from(agentOwnedTabs), agentCreatedTabs: Array.from(agentCreatedTabs) });
    }
  } catch (e) {
    console.warn("[Antigravity Bridge] Could not save agentOwnedTabs to session storage:", e);
  }
}

// Startup Passive Sweep: Remove rogue overlays from any non-agent tabs
async function cleanupNonAgentOverlays() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!agentOwnedTabs.has(tab.id) && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const el = document.getElementById("codex-agent-overlay-root");
            if (el) el.remove();
          }
        }).catch(() => {});
      }
    }
  } catch (e) {}
}

const ownershipReady = loadAgentOwnedTabs();
ownershipReady.then(() => cleanupNonAgentOverlays());

chrome.runtime.onInstalled.addListener(() => {
  ownershipReady.then(() => cleanupNonAgentOverlays());
});

// 1. Native Messaging Lifecycle
function connectNative() {
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);
    console.log("[Antigravity Bridge] Connected to native host.");

    // Initial profile discovery & handshake
    detectProfile().then((identity) => {
      profileIdentity = identity;
      sendToHost({
        type: "handshake",
        profile: profileIdentity
      });
    }).catch(() => {});

    nativePort.onMessage.addListener((message) => {
      if (message?.type === "recording_complete" && message.recordingId) {
        const pending = pendingRecordingFinalizations.get(message.recordingId);
        if (pending) {
          pendingRecordingFinalizations.delete(message.recordingId);
          clearTimeout(pending.timer);
          pending.resolve(message.result);
        }
        return;
      }
      handleRequest(message);
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.warn("[Antigravity Bridge] Native host disconnected:", err ? err.message : "closed");
      nativePort = null;
      scheduleReconnect();
    });
  } catch (e) {
    console.error("[Antigravity Bridge] Error connecting to native host:", e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNative();
  }, 1000);
}

connectNative();

function sendToHost(msg) {
  if (nativePort) {
    try {
      nativePort.postMessage(msg);
    } catch (e) {
      console.error("[Antigravity Bridge] Failed to send message to host:", e);
    }
  }
}

// 2. Profile Identification (Deterministic Multi-Method)
async function detectProfile() {
  let email = "unknown";
  let domain = "";

  // Strategy 1: chrome.identity API
  try {
    if (chrome.identity && chrome.identity.getProfileUserInfo) {
      const info = await new Promise((resolve) => {
        chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, resolve);
      });
      if (info && info.email) {
        email = info.email;
      }
    }
  } catch (e) {}

  // Strategy 2: Persistent profile storage
  if (email === "unknown") {
    try {
      const stored = await chrome.storage.local.get(["profileEmail", "profileIdentitySource"]);
      if (stored && stored.profileEmail && ["chrome-identity", "native-preferences"].includes(stored.profileIdentitySource)) {
        email = stored.profileEmail;
      }
    } catch (e) {}
  }

  // Page titles and Google cookies identify page accounts, not the Chrome profile.
  // The native host may provide profile Preferences identity via set_profile.

  if (email !== "unknown") {
    try {
      await chrome.storage.local.set({ profileEmail: email, profileIdentitySource: "chrome-identity" });
    } catch (e) {}
  }

  if (email.includes("@")) {
    domain = email.split("@")[1];
  }

  return { email, domain, id: chrome.runtime.id };
}

// 3. Cursor Overlay Management
async function ensureCursorScript(tabId) {
  if (!agentOwnedTabs.has(tabId)) {
    return false;
  }
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "CONTENT_PING" });
    if (ping && ping.ok) return true;
  } catch (e) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/cursor.js"],
      injectImmediately: true
    });
    return true;
  } catch (e) {
    return false;
  }
}

function getOrCreateCursorState(tabId, overrides = {}) {
  let existing = cursorStates.get(tabId);
  const x = overrides.x !== undefined ? Math.round(overrides.x) : (existing?.cursor?.x ?? 350);
  const y = overrides.y !== undefined ? Math.round(overrides.y) : (existing?.cursor?.y ?? 250);
  const turnId = overrides.turnId || existing?.turnId || `turn_${Date.now()}`;
  const isVisible = overrides.isVisible !== undefined ? overrides.isVisible : true;
  const state = {
    isVisible,
    sessionId: "antigravity",
    turnId,
    cursor: {
      visible: isVisible,
      x,
      y,
      animateMovement: overrides.animate !== false
    }
  };
  cursorStates.set(tabId, state);
  return state;
}

async function hideCursor(tabId) {
  const state = {
    isVisible: false,
    sessionId: "antigravity",
    turnId: `turn_${Date.now()}`,
    cursor: null
  };
  cursorStates.set(tabId, state);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "AGENT_CURSOR_STATE",
      state
    });
  } catch (e) {}
}

async function publishCursorState(tabId, overrides = {}) {
  if (!agentOwnedTabs.has(tabId)) return null;
  const state = getOrCreateCursorState(tabId, overrides);
  const injected = await ensureCursorScript(tabId);
  if (!injected) return null;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "AGENT_CURSOR_STATE",
      state
    });
  } catch (e) {}
  return state;
}

// Persistent visual cursor: always active on agent-owned tabs with zero auto-hide
async function updateCursor(tabId, x, y, options = {}) {
  if (!agentOwnedTabs.has(tabId)) return null;
  return await publishCursorState(tabId, { x, y, isVisible: true, ...options });
}

// Automatically restore persistent cursor on agent-owned tabs upon navigation or reload
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url) tabSnapshots.delete(tabId);
  await ownershipReady;
  if (changeInfo.status === "complete" && agentOwnedTabs.has(tabId)) {
    if (tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
      await publishCursorState(tabId, { isVisible: true });
    }
  }
});

// Clean up state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  agentCreatedTabs.delete(tabId);
  tabSnapshots.delete(tabId);
  cursorStates.delete(tabId);
  if (cursorTimers.has(tabId)) {
    clearTimeout(cursorTimers.get(tabId));
    cursorTimers.delete(tabId);
  }
  if (agentOwnedTabs.has(tabId)) {
    agentOwnedTabs.delete(tabId);
    saveAgentOwnedTabs();
  }
});

// Handle content script messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_BRIDGE_STATUS" && !sender.tab && sender.id === chrome.runtime.id) {
    sendResponse({ nativeConnected: !!nativePort, attachedTabCount: attachedTabs.size, profileEmail: profileIdentity.email });
    return false;
  }
  if (message?.type === "GET_AGENT_CURSOR_STATE") {
    const tabId = sender.tab?.id;
    if (!tabId || !agentOwnedTabs.has(tabId)) {
      sendResponse({ ok: true, state: { isVisible: false, cursor: null } });
      return true;
    }
    const state = cursorStates.get(tabId) || { isVisible: false, cursor: null };
    sendResponse({ ok: true, state });
    return true;
  }

  if (message?.type === "AGENT_CURSOR_ARRIVED") {
    sendResponse({ ok: true });
    return true;
  }
});

// 4. RPC Request Dispatcher
function handleRequest(msg) {
  if (!msg || typeof msg !== "object") return;
  const tabId = msg.params?.tabId;
  if (tabId === undefined) return dispatchRequest(msg);
  const previous = requestQueues.get(tabId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => dispatchRequest(msg));
  requestQueues.set(tabId, next);
  next.finally(() => { if (requestQueues.get(tabId) === next) requestQueues.delete(tabId); });
  return next;
}

async function dispatchRequest(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return;

  try {
    await ownershipReady;
    if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("params must be an object");
    const withoutTab = new Set(["ping", "get_profile", "set_profile", "reload_extension", "close_agent_tabs", "list_tabs", "new_tab"]);
    if (!withoutTab.has(method) && (!Number.isSafeInteger(params.tabId) || params.tabId <= 0)) throw new Error("tabId must be a positive integer");
    let result = null;
    switch (method) {
      case "ping":
        result = { pong: true, timestamp: Date.now(), profile: profileIdentity };
        break;
      case "get_profile":
        profileIdentity = await detectProfile();
        result = profileIdentity;
        break;
      case "set_profile":
        if (params.profile && params.profile.email && params.profile.email !== "unknown") {
          profileIdentity = { ...profileIdentity, ...params.profile };
          try {
            await chrome.storage.local.set({ profileEmail: profileIdentity.email, profileIdentitySource: "native-preferences" });
          } catch (e) {}
        }
        result = profileIdentity;
        break;
      case "reload_extension":
        if (activeRecordings.size || pendingRecordingFinalizations.size) throw new Error("Cannot reload extension while a recording is active or finalizing.");
        console.log("[Antigravity Bridge] Self-reload requested by bridge host.");
        sendToHost({ id, result: { reloading: true } });
        setTimeout(() => {
          chrome.runtime.reload();
        }, 50);
        return;
      case "close_agent_tabs":
        result = await closeAgentTabs();
        break;
      case "claim_tab":
        result = await claimTab(params);
        break;
      case "list_tabs":
        result = await listTabs();
        break;
      case "new_tab":
        result = await newTab(params);
        break;
      case "activate_tab":
        result = await activateTab(params);
        break;
      case "close_tab":
        await checkTabSafety(params);
        result = await closeTab(params);
        break;
      case "navigate":
        await checkTabSafety(params);
        result = await navigateTab(params);
        break;
      case "reload_tab":
        await checkTabSafety(params);
        result = await reloadTab(params);
        break;
      case "go_back":
        await checkTabSafety(params);
        result = await goBack(params);
        break;
      case "go_forward":
        await checkTabSafety(params);
        result = await goForward(params);
        break;
      case "snapshot":
        result = await takeSnapshot(params);
        break;
      case "click":
        await checkTabSafety(params);
        result = await clickElement(params);
        break;
      case "hover":
        await checkTabSafety(params);
        result = await hoverElement(params);
        break;
      case "drag":
        await checkTabSafety(params);
        result = await dragElement(params);
        break;
      case "type":
        await checkTabSafety(params);
        result = await typeText(params);
        break;
      case "press_key":
        await checkTabSafety(params);
        result = await pressKey(params);
        break;
      case "scroll":
        await checkTabSafety(params);
        result = await scrollTab(params);
        break;
      case "screenshot":
        result = await captureScreenshot(params);
        break;
      case "evaluate":
        await checkTabSafety(params);
        result = await evaluateScript(params);
        break;
      case "find_and_click":
        await checkTabSafety(params);
        result = await findAndClick(params);
        break;
      case "paste":
        await checkTabSafety(params);
        result = await pasteClipboard(params);
        break;
      case "run_actions":
        await checkTabSafety(params);
        result = await runActions(params);
        break;
      case "start_recording":
        await checkTabSafety(params);
        result = await startRecording(params);
        break;
      case "stop_recording":
        await checkTabSafety(params);
        result = await stopRecording(params);
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
    sendToHost({ id, result });
  } catch (err) {
    console.error(`[Antigravity Bridge] Error in ${method}:`, err);
    sendToHost({ id, error: err.message || String(err) });
  }
}

// Safety: Prevent hijacking existing user tabs without explicit instruction
async function checkTabSafety(params = {}) {
  await ownershipReady;
  const tabId = params.tabId;
  if (!Number.isSafeInteger(tabId) || tabId <= 0) throw new Error("tabId must be a positive integer");
  if (agentOwnedTabs.has(tabId)) return;
  if (params.allowExistingTab === true || params.force === true) {
    await chrome.tabs.get(tabId);
    agentOwnedTabs.add(tabId); // Explicitly claimed
    await saveAgentOwnedTabs();
    return;
  }
  throw new Error(`Safety Protection: Tab ${tabId} is an existing user tab. To interact with it without hijacking the user's workspace, run 'agy-browser claim ${tabId}', pass { allowExistingTab: true }, or create a dedicated background tab via new_tab.`);
}

async function claimTab(params = {}) {
  const tabId = parseInt(params.tabId, 10);
  if (isNaN(tabId)) throw new Error("Invalid tabId provided to claimTab");
  const tab = await chrome.tabs.get(tabId);
  agentOwnedTabs.add(tab.id);
  await saveAgentOwnedTabs();
  await ensureDebugger(tab.id);
  // Immediately initialize and show persistent visual cursor on claimed tab
  await publishCursorState(tab.id, { x: 350, y: 250, isVisible: true });
  return {
    success: true,
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
    profileEmail: profileIdentity.email,
    claimed: true
  };
}

// 5. Tab Management
async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map(t => ({
    id: t.id,
    windowId: t.windowId,
    index: t.index,
    title: t.title || "Untitled",
    url: t.url || "",
    active: t.active,
    status: t.status,
    favIconUrl: t.favIconUrl || "",
    profileEmail: profileIdentity.email,
    agentOwned: agentOwnedTabs.has(t.id),
    agentCreated: agentCreatedTabs.has(t.id)
  }));
}

async function newTab(params = {}) {
  const url = params.url || "about:blank";
  // Default to background tab (active: false) so user screen/tab is NEVER hijacked
  const shouldBeActive = params.active === true || params.foreground === true;
  const tab = await chrome.tabs.create({
    url,
    active: shouldBeActive
  });
  agentOwnedTabs.add(tab.id);
  agentCreatedTabs.add(tab.id);
  await saveAgentOwnedTabs();
  if (params.waitForLoad !== false) {
    await waitForTabComplete(tab.id, params.timeout || 25000);
  }
  const loaded = await chrome.tabs.get(tab.id);
  // Establish persistent visual cursor state on new agent tab
  if (loaded.url && !loaded.url.startsWith("chrome://") && !loaded.url.startsWith("chrome-extension://")) {
    publishCursorState(loaded.id, { x: 350, y: 250, isVisible: true }).catch(() => {});
  }
  return {
    tabId: loaded.id,
    windowId: loaded.windowId,
    url: loaded.url,
    title: loaded.title,
    profileEmail: profileIdentity.email,
    agentOwned: true,
    active: loaded.active
  };
}

async function activateTab(params) {
  const tabId = parseInt(params.tabId, 10);
  let tab = await chrome.tabs.get(tabId);
  if (params.bringToFront === true || params.active === true || params.foreground === true) {
    tab = await chrome.tabs.update(tabId, { active: true });
    if (tab && tab.windowId && params.focusWindow === true) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  }
  if (params.claimAsAgentOwned === true) {
    agentOwnedTabs.add(tabId);
    await saveAgentOwnedTabs();
  }
  return { success: true, tabId, title: tab.title, url: tab.url, active: tab.active };
}

async function closeTab(params) {
  const tabId = parseInt(params.tabId, 10);
  await chrome.tabs.remove(tabId);
  attachedTabs.delete(tabId);
  agentCreatedTabs.delete(tabId);
  tabSnapshots.delete(tabId);
  cursorStates.delete(tabId);
  if (cursorTimers.has(tabId)) {
    clearTimeout(cursorTimers.get(tabId));
    cursorTimers.delete(tabId);
  }
  agentOwnedTabs.delete(tabId);
  await saveAgentOwnedTabs();
  return { success: true, tabId };
}

async function closeAgentTabs() {
  await ownershipReady;
  const closed = [];
  const failedTabs = [];
  for (const tabId of Array.from(agentCreatedTabs)) {
    try {
      await chrome.tabs.remove(tabId);
      attachedTabs.delete(tabId);
      tabSnapshots.delete(tabId);
      cursorStates.delete(tabId);
      if (cursorTimers.has(tabId)) {
        clearTimeout(cursorTimers.get(tabId));
        cursorTimers.delete(tabId);
      }
      agentOwnedTabs.delete(tabId);
      agentCreatedTabs.delete(tabId);
      closed.push(tabId);
    } catch (e) { failedTabs.push({ tabId, error: e.message }); }
  }
  await saveAgentOwnedTabs();
  return { success: failedTabs.length === 0, closedTabs: closed, failedTabs };
}

async function navigateTab(params) {
  const tabId = parseInt(params.tabId, 10);
  await chrome.tabs.update(tabId, { url: params.url });
  if (params.waitForLoad !== false) {
    await waitForTabComplete(tabId, params.timeout || 25000);
  }
  const updated = await chrome.tabs.get(tabId);
  return { tabId: updated.id, url: updated.url, title: updated.title };
}

async function reloadTab(params) {
  const tabId = parseInt(params.tabId, 10);
  await chrome.tabs.reload(tabId, { bypassCache: Boolean(params.ignoreCache) });
  if (params.waitForLoad !== false) {
    await waitForTabComplete(tabId, params.timeout || 25000);
  }
  const reloaded = await chrome.tabs.get(tabId);
  return { success: true, tabId: reloaded.id, url: reloaded.url, title: reloaded.title };
}

async function goBack(params) {
  const tabId = parseInt(params.tabId, 10);
  await chrome.tabs.goBack(tabId);
  if (params.waitForLoad !== false) {
    await waitForTabComplete(tabId, params.timeout || 15000);
  }
  const tab = await chrome.tabs.get(tabId);
  return { success: true, tabId, url: tab.url, title: tab.title };
}

async function goForward(params) {
  const tabId = parseInt(params.tabId, 10);
  await chrome.tabs.goForward(tabId);
  if (params.waitForLoad !== false) {
    await waitForTabComplete(tabId, params.timeout || 15000);
  }
  const tab = await chrome.tabs.get(tabId);
  return { success: true, tabId, url: tab.url, title: tab.title };
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(removed);
      if (err) reject(err); else resolve();
    };
    function listener(id, info) { if (id === tabId && info.status === "complete") finish(); }
    function removed(id) { if (id === tabId) finish(new Error(`Tab ${tabId} closed during navigation`)); }
    const timer = setTimeout(() => finish(new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`)), timeoutMs);
    // Subscribe before the asynchronous state check, so completion cannot be missed.
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removed);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === "complete") finish(); }, finish);
  });
}

// 6. CDP Debugger Engine
// Single global listener for modal dialogs to prevent deadlocks and avoid listener leaks
chrome.debugger.onEvent.addListener((source, method, eventParams) => {
  if (method === "Page.javascriptDialogOpening" && source?.tabId) {
    cdpSend(source.tabId, "Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
  }
  if (method === "Page.screencastFrame" && source?.tabId) {
    const rec = activeRecordings.get(source.tabId);
    if (rec) {
      rec.frameCount++;
      sendToHost({
        type: "screencast_frame",
        recordingId: rec.recordingId,
        tabId: source.tabId,
        frameIndex: rec.frameCount,
        timestamp: eventParams.metadata?.timestamp || (Date.now() / 1000),
        data: eventParams.data
      });
    }
    cdpSend(source.tabId, "Page.screencastFrameAck", { sessionId: eventParams.sessionId }).catch(() => {});
  }
});

async function ensureDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;
  if (debuggerAttaching.has(tabId)) return debuggerAttaching.get(tabId);
  const attaching = attachDebugger(tabId);
  debuggerAttaching.set(tabId, attaching);
  try { await attaching; } finally { debuggerAttaching.delete(tabId); }
}

async function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;

  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      chrome.action.setBadgeBackgroundColor({ color: "#2563eb", tabId });
      chrome.action.setBadgeText({ text: "AI", tabId });
      resolve();
    });
  });

  // Enable core CDP domains
  try {
    await cdpSend(tabId, "Page.enable");
    await cdpSend(tabId, "DOM.enable");
  } catch (err) {
    await chrome.debugger.detach({ tabId }).catch(() => {});
    throw err;
  }
  await cdpSend(tabId, "Accessibility.enable").catch(() => {});
  await cdpSend(tabId, "Runtime.enable").catch(() => {});
  // Bypass background tab throttling so WebSockets, timers, and React hydration run at full speed
  await cdpSend(tabId, "Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  attachedTabs.add(tabId);
}

function cdpSend(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (res) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(res);
    });
  });
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    tabSnapshots.delete(source.tabId);
    cursorStates.delete(source.tabId);
    if (cursorTimers.has(source.tabId)) {
      clearTimeout(cursorTimers.get(source.tabId));
      cursorTimers.delete(source.tabId);
    }
    chrome.action.setBadgeText({ text: "", tabId: source.tabId });
  }
});

// 7. Semantic Accessibility DOM Snapshots (Enriched Context)
async function takeSnapshot(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const axData = await cdpSend(tabId, "Accessibility.getFullAXTree");
  const axNodes = axData.nodes || [];
  const tab = await chrome.tabs.get(tabId);

  const generation = `${snapshotSessionId}-${++snapshotGeneration}`;
  let uidCounter = 1;
  const elementMap = new Map();
  const lines = [`## Page Snapshot [tabId=${tabId}] "${tab.title}" (${tab.url})`];

  for (const node of axNodes) {
    if (node.ignored) continue;
    const role = node.role?.value || "generic";
    const name = node.name?.value?.trim() || "";
    const value = String(node.value?.value ?? "").trim();
    const description = node.description?.value?.trim() || "";

    // Exclude agent cursor overlay labels from page snapshot
    if (name === "Antigravity" || name === "Thinking..." || name === "Typing...") continue;

    const isInteractive = [
      "button", "link", "combobox", "textbox", "searchbox", "checkbox",
      "radio", "menuitem", "tab", "row", "gridcell", "menuitemcheckbox",
      "treeitem", "slider", "switch"
    ].includes(role);

    const isInformational = [
      "heading", "banner", "navigation", "main", "article", "alert",
      "dialog", "status", "timer", "cell", "columnheader", "rowheader"
    ].includes(role);

    if (!isInteractive && !isInformational && !name && !value) continue;

    const uid = `${tabId}_${generation}_${uidCounter++}`;
    elementMap.set(uid, {
      backendDOMNodeId: node.backendDOMNodeId,
      role,
      name,
      value
    });

    let line = `uid=${uid} ${role}`;
    if (name) line += ` "${name.replace(/\n+/g, ' ').substring(0, 100)}"`;
    if (value) line += ` value="${value.replace(/\n+/g, ' ').substring(0, 60)}"`;
    if (description && description !== name) line += ` desc="${description.substring(0, 50)}"`;

    lines.push(`  ${line}`);
  }

  tabSnapshots.set(tabId, { elementMap, time: Date.now() });

  return {
    tabId,
    title: tab.title,
    url: tab.url,
    totalElements: elementMap.size,
    tree: lines.join("\n")
  };
}

// 8. Hardware Mouse Interactions with Auto-Scroll & Visual Cursor
async function resolveElementCoords(tabId, uid, explicitX, explicitY) {
  if (explicitX !== undefined && explicitY !== undefined) {
    if (!Number.isFinite(explicitX) || !Number.isFinite(explicitY)) throw new Error("Coordinates must be finite numbers");
    return { x: Math.round(explicitX), y: Math.round(explicitY) };
  }

  if (!uid) {
    throw new Error("Either uid or explicit coordinates (x, y) must be specified.");
  }

  const snap = tabSnapshots.get(tabId);
  const elem = snap?.elementMap.get(uid);
  if (!elem) {
    throw new Error(`Element UID '${uid}' not found. Please take a fresh browser_snapshot.`);
  }

  if (elem.backendDOMNodeId) {
    // Automatically scroll into view if scrolled off screen
    try {
      await cdpSend(tabId, "DOM.scrollIntoViewIfNeeded", { backendNodeId: elem.backendDOMNodeId });
    } catch (e) {}

    try {
      const box = await cdpSend(tabId, "DOM.getBoxModel", { backendNodeId: elem.backendDOMNodeId });
      if (box?.model?.content) {
        const c = box.model.content;
        return {
          x: Math.round((c[0] + c[2] + c[4] + c[6]) / 4),
          y: Math.round((c[1] + c[3] + c[5] + c[7]) / 4)
        };
      }
    } catch (e) {}

    // Fallback: Resolve node to JS object and evaluate getBoundingClientRect
    try {
      const { object } = await cdpSend(tabId, "DOM.resolveNode", { backendNodeId: elem.backendDOMNodeId });
      if (object?.objectId) {
        const evalRes = await cdpSend(tabId, "Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration: `function() {
            const r = this.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height };
          }`,
          returnByValue: true
        });
        await cdpSend(tabId, "Runtime.releaseObject", { objectId: object.objectId }).catch(() => {});
        const val = evalRes?.result?.value;
        if (val && (val.x > 0 || val.y > 0 || val.w > 0)) {
          return { x: val.x, y: val.y };
        }
      }
    } catch (e) {}
  }

  throw new Error(`Unable to calculate screen coordinates for UID '${uid}'.`);
}

async function clickElement(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const { x, y } = await resolveElementCoords(tabId, params.uid, params.x, params.y);
  const button = params.button || "left";
  const clickCount = params.dblClick ? 2 : 1;

  // Visual animated cursor glide to target without blocking CDP execution
  updateCursor(tabId, x, y, { animate: true }).catch(() => {});

  // Hardware mouse click via CDP
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (let count = 1; count <= clickCount; count++) {
    await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", button, clickCount: count, x, y });
    await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", button, clickCount: count, x, y });
  }

  return {
    success: true,
    tabId,
    clickedCoords: { x, y }
  };
}

async function hoverElement(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const { x, y } = await resolveElementCoords(tabId, params.uid, params.x, params.y);

  // Visual animated cursor glide to target
  updateCursor(tabId, x, y, { animate: true }).catch(() => {});
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });

  return { success: true, tabId, hoverCoords: { x, y } };
}

async function dragElement(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const from = await resolveElementCoords(tabId, params.fromUid, params.fromX, params.fromY);
  const to = await resolveElementCoords(tabId, params.toUid, params.toX, params.toY);
  const steps = params.steps ?? 10;
  if (!Number.isInteger(steps) || steps < 1 || steps > 1000) throw new Error("Drag steps must be an integer from 1 to 1000");

  updateCursor(tabId, from.x, from.y, { animate: false }).catch(() => {});
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x: from.x, y: from.y });

  for (let i = 1; i <= steps; i++) {
    const curX = Math.round(from.x + ((to.x - from.x) * (i / steps)));
    const curY = Math.round(from.y + ((to.y - from.y) * (i / steps)));
    updateCursor(tabId, curX, curY, { animate: false }).catch(() => {});
    await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1, x: curX, y: curY });
  }

  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x: to.x, y: to.y });
  return { success: true, tabId, from, to };
}

// 9. Hardware Keyboard Interactions with DOM Focus
async function typeText(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  if (params.selector) {
    await findAndClick({ tabId, selector: params.selector });
  } else if (params.uid) {
    const snap = tabSnapshots.get(tabId);
    const elem = snap?.elementMap.get(params.uid);
    if (elem?.backendDOMNodeId) {
      try {
        await cdpSend(tabId, "DOM.focus", { backendNodeId: elem.backendDOMNodeId });
      } catch (e) {}
    }
    await clickElement(params);
  } else if (params.x !== undefined && params.y !== undefined) {
    await clickElement(params);
  }

  if (typeof params.text !== "string") throw new Error("text must be a string");
  const text = params.text;

  if (params.clear) {
    // Ctrl+A / Cmd+A
    await cdpSend(tabId, "Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdpSend(tabId, "Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 });
    // Backspace
    await cdpSend(tabId, "Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 8 });
    await cdpSend(tabId, "Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 8 });
  }

  // Fast atomic insertion via CDP Input.insertText
  if (text) {
    await cdpSend(tabId, "Input.insertText", { text });
  }

  if (params.pressEnter || params.enter) {
    await pressKey({ tabId, key: "Enter" });
  }

  return { success: true, tabId, typedLength: text.length };
}

async function pressKey(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const key = params.key || "Enter";
  const keyMap = {
    "Enter": { vk: 13, text: "\r", code: "Enter" },
    "Tab": { vk: 9, text: "", code: "Tab" },
    "Escape": { vk: 27, text: "", code: "Escape" },
    "Backspace": { vk: 8, text: "", code: "Backspace" },
    "Delete": { vk: 46, text: "", code: "Delete" },
    "ArrowDown": { vk: 40, text: "", code: "ArrowDown" },
    "ArrowUp": { vk: 38, text: "", code: "ArrowUp" },
    "ArrowLeft": { vk: 37, text: "", code: "ArrowLeft" },
    "ArrowRight": { vk: 39, text: "", code: "ArrowRight" },
    "PageDown": { vk: 34, text: "", code: "PageDown" },
    "PageUp": { vk: 33, text: "", code: "PageUp" },
    "Home": { vk: 36, text: "", code: "Home" },
    "End": { vk: 35, text: "", code: "End" },
    "Space": { vk: 32, text: " ", code: "Space" }
  };

  let code = (keyMap[key] && keyMap[key].code) || "";
  if (!code) {
    if (key.length === 1 && /[a-zA-Z]/.test(key)) {
      code = `Key${key.toUpperCase()}`;
    } else if (key.length === 1 && /[0-9]/.test(key)) {
      code = `Digit${key}`;
    } else {
      code = key;
    }
  }

  const vkCode = (keyMap[key] && keyMap[key].vk) || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  const info = keyMap[key] || { vk: vkCode, text: key, code };
  let modifiers = 0;
  if (params.ctrl) modifiers |= 2;
  if (params.alt) modifiers |= 1;
  if (params.shift) modifiers |= 8;
  if (params.meta) modifiers |= 4;

  const commands = [];
  if (params.ctrl || params.meta) {
    const k = key.toLowerCase();
    if (k === "v") commands.push("paste");
    else if (k === "c") commands.push("copy");
    else if (k === "x") commands.push("cut");
    else if (k === "a") commands.push("selectAll");
    else if (k === "z") commands.push("undo");
    else if (k === "y") commands.push("redo");
  }

  const keyDownPayload = {
    type: "keyDown",
    windowsVirtualKeyCode: info.vk,
    text: info.text,
    unmodifiedText: info.text,
    key: key === "Space" ? " " : key,
    code,
    modifiers
  };
  if (params.ctrl || params.alt || params.meta) {
    delete keyDownPayload.text;
    delete keyDownPayload.unmodifiedText;
  }
  if (commands.length > 0) {
    keyDownPayload.commands = commands;
  }

  await cdpSend(tabId, "Input.dispatchKeyEvent", keyDownPayload);

  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    windowsVirtualKeyCode: info.vk,
    key: key === "Space" ? " " : key,
    code,
    modifiers
  });

  return { success: true, tabId, key };
}

async function scrollTab(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const deltaY = params.deltaY !== undefined ? params.deltaY : 400;
  const deltaX = params.deltaX || 0;

  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: params.x ?? 500,
    y: params.y ?? 500,
    deltaX,
    deltaY
  });

  return { success: true, tabId, deltaX, deltaY };
}

async function captureScreenshot(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const format = params.format || "jpeg";
  const quality = params.quality ?? 80;

  const capture = { format, captureBeyondViewport: Boolean(params.fullPage) };
  if (format === "jpeg" || format === "webp") capture.quality = quality;
  if (params.fullPage) {
    const metrics = await cdpSend(tabId, "Page.getLayoutMetrics");
    const size = metrics.cssContentSize || metrics.contentSize;
    capture.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
  }
  const res = await cdpSend(tabId, "Page.captureScreenshot", capture);

  return {
    tabId,
    format,
    dataBase64: res.data
  };
}

async function startRecording(params) {
  const tabId = parseInt(params.tabId, 10);
  await checkTabSafety(params);
  await ensureDebugger(tabId);

  if (activeRecordings.has(tabId)) {
    await stopRecording({ tabId });
  }

  const recordingId = params.recordingId || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const defaultDir = "/tmp/antigravity-recordings";
  const outputPath = params.outputPath || `${defaultDir}/recording_tab_${tabId}_${Date.now()}.mp4`;

  const rec = {
    recordingId,
    tabId,
    outputPath,
    frameCount: 0,
    startTime: Date.now()
  };
  activeRecordings.set(tabId, rec);

  sendToHost({
    type: "recording_init",
    recordingId,
    tabId,
    outputPath
  });

  try {
  await cdpSend(tabId, "Page.startScreencast", {
    format: "jpeg",
    quality: params.quality || 85,
    maxWidth: params.maxWidth || 1920,
    maxHeight: params.maxHeight || 1080,
    everyNthFrame: 1
  });
  } catch (err) {
    activeRecordings.delete(tabId);
    sendToHost({ type: "recording_cancel", recordingId });
    throw err;
  }

  return { success: true, tabId, recordingId, outputPath, recording: true };
}

async function stopRecording(params) {
  const tabId = parseInt(params.tabId, 10);
  await checkTabSafety(params);

  const rec = activeRecordings.get(tabId);
  if (!rec) {
    return { success: false, error: `No active recording found for tab ${tabId}.` };
  }

  activeRecordings.delete(tabId);
  await cdpSend(tabId, "Page.stopScreencast").catch(() => {});

  const stopTimestamp = Date.now() / 1000;
  const durationSec = Math.max(0.1, (Date.now() - rec.startTime) / 1000);
  const outPath = params.outputPath || rec.outputPath;

  const finalResult = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRecordingFinalizations.delete(rec.recordingId);
      resolve({
        success: false,
        tabId,
        recordingId: rec.recordingId,
        outputPath: outPath,
        frameCount: rec.frameCount,
        duration: durationSec,
        warning: "Finalization timed out before host confirmation"
      });
    }, 45000);

    pendingRecordingFinalizations.set(rec.recordingId, { resolve, timer });

    sendToHost({
      type: "recording_finalize",
      recordingId: rec.recordingId,
      tabId,
      outputPath: outPath,
      stopTimestamp,
      frameCount: rec.frameCount
    });
  });

  return finalResult;
}

async function evaluateScript(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const res = await cdpSend(tabId, "Runtime.evaluate", {
    expression: params.expression,
    returnByValue: true,
    awaitPromise: true
  });

  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || "Script evaluation error");
  }

  return {
    tabId,
    value: res.result ? res.result.value : undefined
  };
}

// 10. Semantic Locators, Bulk Paste, and Compound Batch Execution
async function findAndClick(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const selector = params.selector;
  const text = params.text;
  const role = params.role;

  if (!selector && !text && !role && !params.name) throw new Error("Provide selector, text or role");
  const expression = `(${function locate({ selector, text, role }) {
    const visible = el => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && !el.disabled && el.getAttribute("aria-disabled") !== "true";
    };
    const impliedRoles = { BUTTON: "button", A: "link", TEXTAREA: "textbox", SELECT: "combobox" };
    const candidates = Array.from(document.querySelectorAll(selector || 'button, a, input, textarea, select, [role], [aria-label], span, div'));
    const query = (text || "").toLowerCase();
    const matches = candidates.filter(el => visible(el) && (!role || (el.getAttribute("role") || impliedRoles[el.tagName]) === role) && (!query || (el.getAttribute("aria-label") || el.innerText || el.textContent || "").toLowerCase().includes(query)));
    const target = matches.find(el => (el.getAttribute("aria-label") || el.innerText || el.textContent || "").toLowerCase().trim() === query) || matches.find(el => !matches.some(child => child !== el && el.contains(child))) || matches[0];
    if (!target) return { found: false };
    target.scrollIntoView({ behavior: "instant", block: "center" });
    const rect = target.getBoundingClientRect();
    return { found: true, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  }.toString()})(${JSON.stringify({ selector, text: text || params.name, role })})`;

  const evalRes = await cdpSend(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });

  if (evalRes.exceptionDetails) throw new Error(evalRes.exceptionDetails.text || "Invalid locator");
  const loc = evalRes?.result?.value;
  if (!loc || !loc.found) {
    throw new Error(`Element not found for selector='${selector || ''}', text='${text || ''}', role='${role || ''}'.`);
  }

  return await clickElement({
    tabId,
    x: loc.x,
    y: loc.y,
    button: params.button,
    dblClick: params.dblClick
  });
}

async function pasteClipboard(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  if (typeof params.text !== "string") throw new Error("text must be a string");
  const text = params.text;
  const html = params.html || "";

  const pasteExpression = `
    (() => {
      const target = document.activeElement || document.body;
      const isStandardInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (!isStandardInput && !target.isContentEditable && target === document.body && !document.getElementById('waffle-rich-text-editor')) {
        return { ok: false, error: 'Focus an editable element before pasting' };
      }
      const dt = new DataTransfer();
      dt.setData('text/plain', ${JSON.stringify(text)});
      if (${JSON.stringify(html)}) dt.setData('text/html', ${JSON.stringify(html)});
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
      const consumed = !target.dispatchEvent(event);
      return { ok: true, consumed, isStandardInput, editable: isStandardInput || target.isContentEditable };
    })()
  `;
  const evaluated = await cdpSend(tabId, "Runtime.evaluate", { expression: pasteExpression, returnByValue: true, awaitPromise: true });
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text || "Paste event failed");
  const value = evaluated.result?.value;
  if (!value?.ok) throw new Error(value?.error || "Paste failed");
  if (!value.consumed) {
    if (!value.editable) throw new Error("Editor did not handle the paste event. Verify its focus and paste support.");
    await cdpSend(tabId, "Input.insertText", { text });
  }
  return { success: true, tabId, pastedLength: text.length, hasHtml: !!html, method: value.consumed ? "paste-event" : "insert-text", appliedHtml: !!html && value.consumed };
}

async function runActions(params) {
  const tabId = parseInt(params.tabId, 10);
  if (!Array.isArray(params.actions)) throw new Error("actions must be an array");
  const supported = new Set(["click", "find_and_click", "type", "press_key", "key", "paste", "hover", "scroll", "wait", "sleep", "evaluate", "eval"]);
  for (const act of params.actions) {
    if (!act || typeof act !== "object" || !supported.has(act.action || act.type)) throw new Error("Invalid or unsupported batch action");
    if (act.tabId !== undefined && act.tabId !== tabId) throw new Error("A batch must target one tab; send a separate request for another tab");
    for (const field of ["ms", "delay"]) if (act[field] !== undefined && (!Number.isFinite(act[field]) || act[field] < 0 || act[field] > 60000)) throw new Error(`Invalid action ${field}`);
  }
  await ensureDebugger(tabId);

  let recordingActive = false;
  const outPath = params.recordOutputPath || params.outputPath;
  if (params.record === true || params.recordVideo === true) {
    await startRecording({ tabId, outputPath: outPath });
    recordingActive = true;
  }

  const actions = Array.isArray(params.actions) ? params.actions : [];
  const results = [];
  let video = null;
  try {
    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      const actTabId = act.tabId ? parseInt(act.tabId, 10) : tabId;
      await checkTabSafety({ tabId: actTabId, allowExistingTab: params.allowExistingTab });
      let res = null;

      switch (act.action || act.type) {
        case "click":
          if (act.selector || act.name || act.text) {
            res = await findAndClick({ tabId: actTabId, ...act });
          } else {
            res = await clickElement({ tabId: actTabId, ...act });
          }
          break;
        case "find_and_click":
          res = await findAndClick({ tabId: actTabId, ...act });
          break;
        case "type":
          res = await typeText({ tabId: actTabId, ...act });
          break;
        case "press_key":
        case "key":
          res = await pressKey({ tabId: actTabId, ...act });
          break;
        case "paste":
          res = await pasteClipboard({ tabId: actTabId, ...act });
          break;
        case "hover":
          res = await hoverElement({ tabId: actTabId, ...act });
          break;
        case "scroll":
          res = await scrollTab({ tabId: actTabId, ...act });
          break;
        case "wait":
        case "sleep":
          await new Promise(r => setTimeout(r, act.ms ?? 100));
          res = { waitedMs: act.ms ?? 100 };
          break;
        case "evaluate":
        case "eval":
          res = await evaluateScript({ tabId: actTabId, expression: act.expression });
          break;
        default:
          throw new Error(`Unknown batch action type: ${act.action || act.type}`);
      }
      results.push(res);
      // Micro delay between actions for UI settling
      if (act.delay !== undefined) {
        await new Promise(r => setTimeout(r, act.delay));
      } else {
        await new Promise(r => setTimeout(r, 40));
      }
    }
  } catch (err) {
    err.message = `Batch failed after ${results.length}/${actions.length} actions: ${err.message}`;
    throw err;
  } finally {
    if (recordingActive) {
      await new Promise(r => setTimeout(r, 300));
      video = await stopRecording({ tabId, outputPath: outPath });
    }
  }

  return { success: !video || video.success !== false, tabId, count: actions.length, results, video };
}
