// Antigravity Browser Bridge - Production Background Service Worker (v1.3.0)
const NATIVE_HOST = "com.google.antigravity.browser";

let nativePort = null;
let reconnectTimer = null;
let profileIdentity = { email: "unknown", name: "default" };

const attachedTabs = new Set();
const agentOwnedTabs = new Set();
const tabSnapshots = new Map(); // tabId -> { elementMap, time }
const cursorStates = new Map(); // tabId -> { cursor, isVisible, sessionId, turnId }
const cursorTimers = new Map(); // tabId -> setTimeout timer

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
      const stored = await chrome.storage.local.get("profileEmail");
      if (stored && stored.profileEmail) {
        email = stored.profileEmail;
      }
    } catch (e) {}
  }

  // Strategy 3: Google account cookies
  if (email === "unknown") {
    try {
      const cookies = await chrome.cookies.getAll({ domain: "google.com" });
      const authCookie = cookies.find(c => c.name === "ACCOUNT_CHOOSER" || c.name === "OSID");
      if (authCookie && authCookie.value) {
        const decoded = decodeURIComponent(authCookie.value);
        const match = decoded.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (match) email = match[1];
      }
    } catch (e) {}
  }

  // Strategy 4: Active tab URLs & titles
  if (email === "unknown") {
    try {
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        if (t.title && t.title.includes("@qtloads.com")) {
          email = "devops@qtloads.com";
          break;
        }
        if (t.title && t.title.includes("jayantdahiya1204@gmail.com")) {
          email = "jayantdahiya1204@gmail.com";
          break;
        }
        if (t.url && t.url.includes("mail.google.com/mail/u/")) {
          const match = t.title.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (match) {
            email = match[1];
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (email.includes("@")) {
    domain = email.split("@")[1];
  }

  return { email, domain, id: chrome.runtime.id };
}

// 3. Cursor Overlay Management
async function ensureCursorScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "CONTENT_PING" });
    if (ping && ping.ok) return true;
  } catch (e) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/cursor.js"]
    });
    return true;
  } catch (e) {
    return false;
  }
}

function getOrCreateCursorState(tabId, overrides = {}) {
  let existing = cursorStates.get(tabId);
  const x = overrides.x !== undefined ? Math.round(overrides.x) : (existing?.cursor?.x ?? 250);
  const y = overrides.y !== undefined ? Math.round(overrides.y) : (existing?.cursor?.y ?? 250);
  const turnId = overrides.turnId || existing?.turnId || `turn_${Date.now()}`;
  const state = {
    isVisible: true,
    sessionId: "antigravity",
    turnId,
    cursor: {
      visible: true,
      x,
      y,
      animateMovement: overrides.animate !== false
    }
  };
  cursorStates.set(tabId, state);
  return state;
}

async function publishCursorState(tabId, overrides = {}) {
  const state = getOrCreateCursorState(tabId, overrides);
  await ensureCursorScript(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "AGENT_CURSOR_STATE",
      state
    });
  } catch (e) {}
  return state;
}

async function updateCursor(tabId, x, y, options = {}) {
  return await publishCursorState(tabId, { x, y, ...options });
}

// Ensure cursor is always visible on active tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabId = activeInfo.tabId;
  await publishCursorState(tabId, { animate: false });
});

// Ensure cursor is republished whenever a page finishes loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && !tab.url.startsWith("chrome://")) {
    await publishCursorState(tabId, { animate: false });
  }
});

// Handle content script messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_AGENT_CURSOR_STATE") {
    const tabId = sender.tab?.id;
    const state = getOrCreateCursorState(tabId);
    sendResponse({ ok: true, state });
    return true;
  }

  if (message?.type === "AGENT_CURSOR_ARRIVED") {
    sendResponse({ ok: true });
    return true;
  }
});

// 4. RPC Request Dispatcher
async function handleRequest(msg) {
  const { id, method, params = {} } = msg;
  if (!id) return;

  try {
    let result = null;
    switch (method) {
      case "ping":
        result = { pong: true, timestamp: Date.now(), profile: profileIdentity };
        break;
      case "get_profile":
        profileIdentity = await detectProfile();
        result = profileIdentity;
        break;
      case "reload_extension":
        console.log("[Antigravity Bridge] Self-reload requested by bridge host.");
        sendToHost({ id, result: { reloading: true } });
        setTimeout(() => {
          chrome.runtime.reload();
        }, 50);
        return;
      case "close_agent_tabs":
        result = await closeAgentTabs();
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
        result = await closeTab(params);
        break;
      case "navigate":
        result = await navigateTab(params);
        break;
      case "reload_tab":
        result = await reloadTab(params);
        break;
      case "go_back":
        result = await goBack(params);
        break;
      case "go_forward":
        result = await goForward(params);
        break;
      case "snapshot":
        result = await takeSnapshot(params);
        break;
      case "click":
        checkTabSafety(params);
        result = await clickElement(params);
        break;
      case "hover":
        checkTabSafety(params);
        result = await hoverElement(params);
        break;
      case "drag":
        checkTabSafety(params);
        result = await dragElement(params);
        break;
      case "type":
        checkTabSafety(params);
        result = await typeText(params);
        break;
      case "press_key":
        checkTabSafety(params);
        result = await pressKey(params);
        break;
      case "scroll":
        result = await scrollTab(params);
        break;
      case "screenshot":
        result = await captureScreenshot(params);
        break;
      case "evaluate":
        result = await evaluateScript(params);
        break;
      case "find_and_click":
        checkTabSafety(params);
        result = await findAndClick(params);
        break;
      case "paste":
        checkTabSafety(params);
        result = await pasteClipboard(params);
        break;
      case "run_actions":
        checkTabSafety(params);
        result = await runActions(params);
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
function checkTabSafety(params = {}) {
  if (!params.tabId) return;
  const tabId = parseInt(params.tabId, 10);
  if (agentOwnedTabs.has(tabId)) return;
  if (params.allowExistingTab === true || params.force === true) {
    agentOwnedTabs.add(tabId); // Explicitly claimed
    return;
  }
  throw new Error(`Safety Protection: Tab ${tabId} is an existing user tab. To interact with it without hijacking the user's workspace, pass { allowExistingTab: true }, or create a dedicated background tab via new_tab.`);
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
    agentOwned: agentOwnedTabs.has(t.id)
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
  if (params.waitForLoad !== false) {
    await waitForTabComplete(tab.id, params.timeout || 25000);
  }
  const loaded = await chrome.tabs.get(tab.id);
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
  }
  return { success: true, tabId, title: tab.title, url: tab.url, active: tab.active };
}

async function closeTab(params) {
  const tabId = parseInt(params.tabId, 10);
  await chrome.tabs.remove(tabId);
  attachedTabs.delete(tabId);
  tabSnapshots.delete(tabId);
  cursorStates.delete(tabId);
  agentOwnedTabs.delete(tabId);
  return { success: true, tabId };
}

async function closeAgentTabs() {
  const closed = [];
  for (const tabId of Array.from(agentOwnedTabs)) {
    try {
      await chrome.tabs.remove(tabId);
      attachedTabs.delete(tabId);
      tabSnapshots.delete(tabId);
      cursorStates.delete(tabId);
      agentOwnedTabs.delete(tabId);
      closed.push(tabId);
    } catch (e) {}
  }
  return { success: true, closedTabs: closed };
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
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, timeoutMs);

    function listener(updatedId, info) {
      if (updatedId === tabId && info.status === "complete") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// 6. CDP Debugger Engine
async function ensureDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;

  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      attachedTabs.add(tabId);
      chrome.action.setBadgeBackgroundColor({ color: "#2563eb", tabId });
      chrome.action.setBadgeText({ text: "AI", tabId });
      resolve();
    });
  });

  // Enable core CDP domains
  await cdpSend(tabId, "Page.enable");
  await cdpSend(tabId, "DOM.enable");
  await cdpSend(tabId, "Accessibility.enable").catch(() => {});
  await cdpSend(tabId, "Runtime.enable").catch(() => {});
  // Bypass background tab throttling so WebSockets, timers, and React hydration run at full speed
  await cdpSend(tabId, "Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});

  // Automatically dismiss or accept modal dialogs to prevent deadlocks
  chrome.debugger.onEvent.addListener((source, method, eventParams) => {
    if (source.tabId === tabId && method === "Page.javascriptDialogOpening") {
      cdpSend(tabId, "Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    }
  });
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

  let uidCounter = 1;
  const elementMap = new Map();
  const lines = [`## Page Snapshot [tabId=${tabId}] "${tab.title}" (${tab.url})`];

  for (const node of axNodes) {
    if (node.ignored) continue;
    const role = node.role?.value || "generic";
    const name = node.name?.value?.trim() || "";
    const value = node.value?.value?.trim() || "";
    const description = node.description?.value?.trim() || "";

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

    const uid = `${tabId}_${uidCounter++}`;
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

    const box = await cdpSend(tabId, "DOM.getBoxModel", { backendNodeId: elem.backendDOMNodeId });
    if (box?.model?.content) {
      const c = box.model.content;
      return {
        x: Math.round((c[0] + c[2] + c[4] + c[6]) / 4),
        y: Math.round((c[1] + c[3] + c[5] + c[7]) / 4)
      };
    }
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
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    button,
    clickCount,
    x,
    y
  });
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button,
    clickCount,
    x,
    y
  });

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
  const steps = params.steps || 5;

  updateCursor(tabId, from.x, from.y, { animate: false }).catch(() => {});
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x: from.x, y: from.y });

  for (let i = 1; i <= steps; i++) {
    const curX = Math.round(from.x + ((to.x - from.x) * (i / steps)));
    const curY = Math.round(from.y + ((to.y - from.y) * (i / steps)));
    updateCursor(tabId, curX, curY, { animate: false }).catch(() => {});
    await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: curX, y: curY });
  }

  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x: to.x, y: to.y });
  return { success: true, tabId, from, to };
}

// 9. Hardware Keyboard Interactions with DOM Focus
async function typeText(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  if (params.uid) {
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

  const text = params.text || "";

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

  if (params.pressEnter) {
    await pressKey({ tabId, key: "Enter" });
  }

  return { success: true, tabId, typedLength: text.length };
}

async function pressKey(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const key = params.key || "Enter";
  const keyMap = {
    "Enter": { vk: 13, text: "\r" },
    "Tab": { vk: 9, text: "" },
    "Escape": { vk: 27, text: "" },
    "Backspace": { vk: 8, text: "" },
    "Delete": { vk: 46, text: "" },
    "ArrowDown": { vk: 40, text: "" },
    "ArrowUp": { vk: 38, text: "" },
    "ArrowLeft": { vk: 37, text: "" },
    "ArrowRight": { vk: 39, text: "" },
    "PageDown": { vk: 34, text: "" },
    "PageUp": { vk: 33, text: "" },
    "Home": { vk: 36, text: "" },
    "End": { vk: 35, text: "" },
    "Space": { vk: 32, text: " " }
  };

  const vkCode = (keyMap[key] && keyMap[key].vk) || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  const info = keyMap[key] || { vk: vkCode, text: key };
  let modifiers = 0;
  if (params.ctrl) modifiers |= 2;
  if (params.alt) modifiers |= 1;
  if (params.shift) modifiers |= 8;
  if (params.meta) modifiers |= 4;

  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    windowsVirtualKeyCode: info.vk,
    text: info.text,
    unmodifiedText: info.text,
    key,
    modifiers
  });

  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    windowsVirtualKeyCode: info.vk,
    text: info.text,
    unmodifiedText: info.text,
    key,
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
    x: params.x || 500,
    y: params.y || 500,
    deltaX,
    deltaY
  });

  return { success: true, tabId, deltaX, deltaY };
}

async function captureScreenshot(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const format = params.format || "jpeg";
  const quality = params.quality || 80;

  const res = await cdpSend(tabId, "Page.captureScreenshot", {
    format,
    quality,
    captureBeyondViewport: Boolean(params.fullPage)
  });

  return {
    tabId,
    format,
    dataBase64: res.data
  };
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

  const expression = `
    (() => {
      let target = null;
      ${selector ? `target = document.querySelector(${JSON.stringify(selector)});` : ''}
      if (!target && ${JSON.stringify(text || '')}) {
        const searchText = ${JSON.stringify(text || '')}.toLowerCase();
        const all = Array.from(document.querySelectorAll('button, a, div[role="button"], span, input, div, [aria-label]'));
        target = all.find(el => {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const t = (el.innerText || el.textContent || '').toLowerCase();
          return aria.includes(searchText) || t.includes(searchText);
        });
      }
      if (!target && ${JSON.stringify(role || '')}) {
        target = document.querySelector(\`[role="${role}"]\`);
      }
      if (!target) return { found: false };
      target.scrollIntoView({ behavior: 'instant', block: 'center' });
      const rect = target.getBoundingClientRect();
      return {
        found: true,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        tagName: target.tagName,
        ariaLabel: target.getAttribute('aria-label')
      };
    })()
  `;

  const evalRes = await cdpSend(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });

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

  const text = params.text || "";

  // Insert into page clipboard context and trigger paste
  const pasteExpression = `
    (async () => {
      try {
        await navigator.clipboard.writeText(${JSON.stringify(text)});
        return { ok: true, method: "clipboard_api" };
      } catch (e) {
        try {
          const dt = new DataTransfer();
          dt.setData('text/plain', ${JSON.stringify(text)});
          const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          (document.activeElement || document.body).dispatchEvent(evt);
          return { ok: true, method: "synthetic_event" };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }
    })()
  `;

  await cdpSend(tabId, "Runtime.evaluate", {
    expression: pasteExpression,
    returnByValue: true,
    awaitPromise: true
  });

  // Also dispatch hardware Ctrl+V to ensure sheet canvas listeners catch it
  await pressKey({ tabId, key: "v", ctrl: true });

  return { success: true, tabId, pastedLength: text.length };
}

async function runActions(params) {
  const tabId = parseInt(params.tabId, 10);
  await ensureDebugger(tabId);

  const actions = Array.isArray(params.actions) ? params.actions : [];
  const results = [];

  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    const actTabId = act.tabId ? parseInt(act.tabId, 10) : tabId;
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
        await new Promise(r => setTimeout(r, act.ms || 100));
        res = { waitedMs: act.ms || 100 };
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

  return { success: true, tabId, count: actions.length, results };
}
