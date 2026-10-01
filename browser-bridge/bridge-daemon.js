#!/usr/bin/env node
// Antigravity Browser Bridge Daemon (Multi-Profile Hub & Auto-Reloader)
const net = require("net");
const fs = require("fs");
const path = require("path");

const { execFileSync } = require("child_process");

const SOCKET_PATH = process.env.ANTIGRAVITY_SOCKET_PATH || "/tmp/antigravity-browser-bridge.sock";
const LOG_FILE = process.env.ANTIGRAVITY_DAEMON_LOG || "/tmp/antigravity-daemon.log";
const EXT_DIR_RAW = process.env.ANTIGRAVITY_EXTENSION_DIR || path.join(__dirname, "../browser-extension");
const EXT_DIR = fs.existsSync(EXT_DIR_RAW) ? fs.realpathSync(EXT_DIR_RAW) : EXT_DIR_RAW;

function log(str) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${str}\n`);
  } catch (e) {}
}

const hosts = new Map();         // hostId -> { id, socket, profile, pid }
let hostSeq = 1;

// Serialize startup, including stale socket recovery, across concurrent MCP clients.
const LOCK_PATH = `${SOCKET_PATH}.lock`;
let lockInode = null;
try {
  let lockFd;
  try { lockFd = fs.openSync(LOCK_PATH, "wx", 0o600); }
  catch (err) {
    if (err.code !== "EEXIST") throw err;
    const owner = Number(fs.readFileSync(LOCK_PATH, "utf8"));
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("Daemon startup lock is incomplete; inspect the lock before removing it");
    try { process.kill(owner, 0); process.exit(0); }
    catch (probeErr) { if (probeErr.code !== "ESRCH") throw probeErr; }
    fs.unlinkSync(LOCK_PATH);
    lockFd = fs.openSync(LOCK_PATH, "wx", 0o600);
  }
  fs.writeFileSync(lockFd, String(process.pid));
  lockInode = fs.fstatSync(lockFd).ino;
  fs.closeSync(lockFd);
} catch (err) { log(`Startup lock failed: ${err.message}`); process.exit(1); }

let socketInode = null;
function cleanup() {
  try {
    if (socketInode !== null && fs.existsSync(SOCKET_PATH) && fs.lstatSync(SOCKET_PATH).ino === socketInode) {
      fs.unlinkSync(SOCKET_PATH);
    }
  } catch (e) {}
  try { if (lockInode !== null && fs.lstatSync(LOCK_PATH).ino === lockInode) fs.unlinkSync(LOCK_PATH); } catch (_) {}
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// Create Central Unix Domain Socket Server
const server = net.createServer((socket) => {
  let isHost = false;
  let hostId = null;
  const pendingRequests = new Map();

  socket.setEncoding("utf8");
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          const msg = JSON.parse(line);
          handleMessage(socket, msg);
        } catch (e) {
          log(`Invalid JSON: ${e.message}`);
        }
      }
    }
  });

  function handleMessage(sock, msg) {
    // 1. Host registration
    if (msg.type === "register") {
      isHost = true;
      hostId = `host_${msg.pid || hostSeq++}`;
      // Clean up previous socket for same PID if reconnecting
      if (hosts.has(hostId)) {
        const old = hosts.get(hostId);
        if (old.socket !== sock && !old.socket.destroyed) {
          try { old.socket.destroy(); } catch (_) {}
        }
      }
      hosts.set(hostId, {
        id: hostId,
        socket: sock,
        profile: msg.profile || { email: "unknown" },
        pid: msg.pid || null,
        pendingRequests
      });
      log(`Host registered: ${hostId} (PID: ${msg.pid}, Email: ${msg.profile?.email})`);
      return;
    }

    // 2. Response from Chrome host
    if (isHost && msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject, timer } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg.result);
      }
      return;
    }

    // 3. Client request (CLI, MCP, or agent script)
    if (!isHost && msg.method) {
      handleClientRequest(sock, msg);
      return;
    }
  }

  socket.on("error", (err) => {
    log(`Socket error (${hostId || "client"}): ${err.message}`);
  });

  socket.on("close", () => {
    if (isHost && hostId) {
      log(`Host disconnected: ${hostId}`);
      if (hosts.get(hostId)?.socket === socket) hosts.delete(hostId);
      for (const { reject, timer } of pendingRequests.values()) {
        clearTimeout(timer);
        reject(new Error("Chrome host disconnected before responding."));
      }
      pendingRequests.clear();

    }
  });
});

// Helper: Call specific host via RPC
function callHost(hostRecord, method, params = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!hostRecord || !hostRecord.socket || hostRecord.socket.destroyed) {
      return reject(new Error("Host connection is not active."));
    }

    const reqId = `daemon_${Math.random().toString(36).substring(2, 11)}`;
    const timer = setTimeout(() => {
      hostRecord.pendingRequests.delete(reqId);
      reject(new Error(`Request ${method} timed out after ${timeoutMs}ms on profile ${hostRecord.profile.email}.`));
    }, timeoutMs);

    hostRecord.pendingRequests.set(reqId, { resolve, reject, timer });

    try {
      hostRecord.socket.write(JSON.stringify({ id: reqId, method, params }) + "\n");
    } catch (e) {
      hostRecord.pendingRequests.delete(reqId);
      clearTimeout(timer);
      reject(new Error(`Failed to write to host: ${e.message}`));
    }
  });
}

// Client request router
async function handleClientRequest(clientSocket, msg) {
  const { id, method, params = {} } = msg;
  const hostTimeout = method === "stop_recording" || method === "run_actions" ? 90000 : 30000;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    clientSocket.write(JSON.stringify({ id, error: "params must be an object" }) + "\n");
    return;
  }

  try {
    let result;

    if (method === "status") {
      result = {
        connectedProfiles: Array.from(hosts.values()).map(h => ({
          hostId: h.id,
          pid: h.pid,
          email: h.profile.email,
          domain: h.profile.domain
        }))
      };
    } else if (method === "reload_extension") {
      const activeHosts = Array.from(hosts.values());
      log(`Triggering reload_extension on ${activeHosts.length} active hosts.`);
      const outcomes = await Promise.allSettled(
        activeHosts.map(h => callHost(h, "reload_extension", {}, 5000))
      );
      const failedProfiles = outcomes.flatMap((r, i) => r.status === "rejected" ? [{ profile: activeHosts[i].profile.email, error: r.reason.message }] : []);
      result = { success: activeHosts.length > 0 && failedProfiles.length === 0,
        reloadedProfiles: activeHosts.filter((_, i) => outcomes[i].status === "fulfilled").map(h => h.profile.email), failedProfiles };
    } else if (method === "close_agent_tabs") {
      const activeHosts = Array.from(hosts.values());
      const queryResults = await Promise.allSettled(
        activeHosts.map(h => callHost(h, "close_agent_tabs", {}))
      );
      const allClosed = [];
      queryResults.forEach(r => {
        if (r.status === "fulfilled" && r.value?.closedTabs) {
          allClosed.push(...r.value.closedTabs);
        }
      });
      const failedProfiles = queryResults.flatMap((r, i) => r.status === "rejected" || r.value?.success === false ? [{ profile: activeHosts[i].profile.email, error: r.reason?.message || "Some tabs could not be closed" }] : []);
      result = { success: activeHosts.length > 0 && failedProfiles.length === 0, closedTabs: allClosed, failedProfiles };
    } else if (method === "list_tabs") {
      const activeHosts = Array.from(hosts.values());
      if (activeHosts.length === 0) {
        result = [];
      } else {
        const queryResults = await Promise.allSettled(
          activeHosts.map(h => callHost(h, "list_tabs", {}))
        );
        const failures = queryResults.filter(r => r.status === "rejected");
        if (failures.length) throw new Error(`Could not list all profiles: ${failures.map(r => r.reason.message).join("; ")}`);
        const allTabs = [];
        queryResults.forEach((res, idx) => {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            const h = activeHosts[idx];
            res.value.forEach(tab => {
              allTabs.push({
                ...tab,
                profileEmail: h.profile.email || tab.profileEmail || "default"
              });
            });
          }
        });
        result = allTabs;
      }
    } else if (method === "new_tab") {
      const targetHost = resolveHostForProfile(params.profile);
      result = await callHost(targetHost, "new_tab", params);
      if (result && result.tabId) {
        result.profileEmail = targetHost.profile.email;
      }
    } else {
      const targetHost = await resolveHostForTab(params.tabId);
      result = await callHost(targetHost, method, params, hostTimeout);
    }

    clientSocket.write(JSON.stringify({ id, result }) + "\n");
  } catch (err) {
    clientSocket.write(JSON.stringify({ id, error: err.message || String(err) }) + "\n");
  }
}

function resolveHostForProfile(profileHint) {
  const activeHosts = Array.from(hosts.values()).filter(h => h.socket && !h.socket.destroyed);
  if (activeHosts.length === 0) {
    throw new Error("No Chrome profiles are currently connected to Antigravity Browser Bridge.");
  }
  if (!profileHint) {
    if (activeHosts.length !== 1) throw new Error("Multiple Chrome profiles connected. Specify profile explicitly.");
    return activeHosts[0];
  }

  if (typeof profileHint !== "string" || !profileHint.trim()) throw new Error("Invalid profile hint.");
  const query = profileHint.toLowerCase().trim();
  const exact = activeHosts.filter(h => [h.profile.email, h.profile.name, h.profile.profileDir, h.id].some(v => typeof v === "string" && v.toLowerCase() === query));
  const matches = exact.length ? exact : activeHosts.filter(h => [h.profile.email, h.profile.name, h.profile.profileDir].some(v => typeof v === "string" && v.toLowerCase().includes(query)));
  if (matches.length !== 1) throw new Error(matches.length ? `Ambiguous Chrome profile '${profileHint}'. Use an exact email or host ID.` : `Chrome profile '${profileHint}' is not connected.`);
  return matches[0];
}

async function resolveHostForTab(tabId) {
  if (!Number.isSafeInteger(tabId) || tabId <= 0) throw new Error("tabId must be a positive integer.");
  const activeHosts = Array.from(hosts.values()).filter(h => h.socket && !h.socket.destroyed);
  if (!activeHosts.length) throw new Error("No Chrome profiles connected.");
  // Profile-scoped Chrome IDs may collide. Never route from a lossy tab-ID cache.
  const results = await Promise.all(activeHosts.map(async h => ({ host: h, tabs: await callHost(h, "list_tabs", {}, 3000) })));
  const matches = results.filter(r => Array.isArray(r.tabs) && r.tabs.some(t => t.id === tabId));
  if (matches.length !== 1) throw new Error(matches.length ? `Tab ${tabId} is ambiguous across profiles.` : `Tab ${tabId} was not found in any connected profile.`);
  return matches[0].host;
}

// 4. Hot-Reload Watcher on Extension Directory
let reloadDebounce = null;
function checkExtensionSyntax(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) checkExtensionSyntax(file);
    else if (entry.name.endsWith(".js")) execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    else if (entry.name === "manifest.json") JSON.parse(fs.readFileSync(file, "utf8"));
  }
}
try {
  if (fs.existsSync(EXT_DIR)) {
    fs.watch(EXT_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.startsWith(".") || filename.endsWith("~")) return;
      if (reloadDebounce) clearTimeout(reloadDebounce);
      reloadDebounce = setTimeout(async () => {
        log(`Extension source file modified (${filename}). Checking syntax before reload.`);
        try { checkExtensionSyntax(EXT_DIR); }
        catch (err) { log(`Extension validation failed: ${err.message}. Aborting hot reload.`); return; }
        log(`Syntax check passed. Triggering hot reload on active hosts.`);
        const activeHosts = Array.from(hosts.values());
        for (const h of activeHosts) {
          try {
            await callHost(h, "reload_extension", {}, 3000);
          } catch (e) {}
        }
      }, 500);
    });
    log(`Hot-reload watcher active on ${EXT_DIR}`);
  }
} catch (e) {
  log(`Watcher setup error: ${e.message}`);
}

server.on("error", (err) => {
  if (err.code !== "EADDRINUSE") { log(`Listen failed: ${err.message}`); process.exit(1); }
  const probe = net.createConnection(SOCKET_PATH);
  probe.on("connect", () => { probe.destroy(); process.exit(0); });
  probe.on("error", (probeErr) => {
    if (!["ECONNREFUSED", "ENOENT"].includes(probeErr.code)) { log(`Socket probe failed: ${probeErr.message}`); process.exit(1); }
    try { if (fs.lstatSync(SOCKET_PATH).isSocket()) fs.unlinkSync(SOCKET_PATH); else throw new Error("Existing path is not a socket"); }
    catch (e) { if (e.code !== "ENOENT") { log(e.message); process.exit(1); } }
    server.listen(SOCKET_PATH);
  });
});
server.on("listening", () => {
  socketInode = fs.lstatSync(SOCKET_PATH).ino;
  try { fs.chmodSync(SOCKET_PATH, 0o600); } catch (e) {}
  log(`Bridge Daemon listening on ${SOCKET_PATH}`);
});

server.listen(SOCKET_PATH);
