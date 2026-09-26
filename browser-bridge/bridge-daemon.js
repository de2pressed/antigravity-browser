#!/usr/bin/env node
// Antigravity Browser Bridge Daemon (Multi-Profile Hub & Auto-Reloader)
const net = require("net");
const fs = require("fs");
const path = require("path");

const { execSync } = require("child_process");

const SOCKET_PATH = "/tmp/antigravity-browser-bridge.sock";
const LOG_FILE = "/tmp/antigravity-daemon.log";
const EXT_DIR_RAW = "/home/jayant/.gemini/antigravity/browser-extension";
const EXT_DIR = fs.existsSync(EXT_DIR_RAW) ? fs.realpathSync(EXT_DIR_RAW) : EXT_DIR_RAW;

function log(str) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${str}\n`);
  } catch (e) {}
}

const hosts = new Map();         // hostId -> { id, socket, profile, pid }
const tabToHostMap = new Map();  // tabId -> hostId
let hostSeq = 1;

function cleanup() {
  try {
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
  } catch (e) {}
}

cleanup();
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// Create Central Unix Domain Socket Server
const server = net.createServer((socket) => {
  let isHost = false;
  let hostId = null;
  const pendingRequests = new Map();

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
      hosts.delete(hostId);
      for (const [tabId, hId] of tabToHostMap.entries()) {
        if (hId === hostId) tabToHostMap.delete(tabId);
      }
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
      await Promise.allSettled(
        activeHosts.map(h => callHost(h, "reload_extension", {}, 5000))
      );
      result = { success: true, reloadedProfiles: activeHosts.map(h => h.profile.email) };
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
      allClosed.forEach(id => tabToHostMap.delete(id));
      result = { success: true, closedTabs: allClosed };
    } else if (method === "list_tabs") {
      const activeHosts = Array.from(hosts.values());
      if (activeHosts.length === 0) {
        result = [];
      } else {
        const queryResults = await Promise.allSettled(
          activeHosts.map(h => callHost(h, "list_tabs", {}))
        );
        const allTabs = [];
        queryResults.forEach((res, idx) => {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            const h = activeHosts[idx];
            res.value.forEach(tab => {
              tabToHostMap.set(tab.id, h.id);
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
        tabToHostMap.set(result.tabId, targetHost.id);
        result.profileEmail = targetHost.profile.email;
      }
    } else {
      const targetHost = await resolveHostForTab(params.tabId);
      result = await callHost(targetHost, method, params);
      if (method === "close_tab" && params.tabId) {
        tabToHostMap.delete(parseInt(params.tabId, 10));
      }
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
  if (!profileHint) return activeHosts[0];

  const query = profileHint.toLowerCase().trim();
  for (const h of activeHosts) {
    const email = (h.profile.email || "").toLowerCase();
    if (email === query) return h;
    if (query.includes("devops") || query.includes("qtloads") || query.includes("profile 6")) {
      if (email.includes("devops") || email.includes("qtloads")) return h;
    }
    if (query.includes("jayant") || query.includes("dahiya") || query.includes("1204") || query.includes("default")) {
      if (email.includes("jayant") || email.includes("gmail") || email === "unknown" || (!email.includes("qtloads") && !email.includes("devops"))) return h;
    }
    if (email.includes(query)) return h;
  }
  return activeHosts[0];
}

async function resolveHostForTab(tabId) {
  const numId = parseInt(tabId, 10);
  const hostId = tabToHostMap.get(numId);
  if (hostId && hosts.has(hostId)) {
    const candidate = hosts.get(hostId);
    if (candidate.socket && !candidate.socket.destroyed) {
      return candidate;
    }
  }

  // Not in map yet (e.g. after reconnect). Query all hosts to locate tab.
  const activeHosts = Array.from(hosts.values()).filter(h => h.socket && !h.socket.destroyed);
  if (activeHosts.length === 0) throw new Error("No Chrome profiles connected.");

  for (const h of activeHosts) {
    try {
      const tabs = await callHost(h, "list_tabs", {}, 3000);
      if (Array.isArray(tabs)) {
        for (const t of tabs) {
          tabToHostMap.set(t.id, h.id);
        }
        if (tabs.some(t => t.id === numId)) {
          return h;
        }
      }
    } catch (e) {}
  }

  return activeHosts[0];
}

// 4. Hot-Reload Watcher on Extension Directory
let reloadDebounce = null;
try {
  if (fs.existsSync(EXT_DIR)) {
    fs.watch(EXT_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.startsWith(".") || filename.endsWith("~")) return;
      if (reloadDebounce) clearTimeout(reloadDebounce);
      reloadDebounce = setTimeout(async () => {
        log(`Extension source file modified (${filename}). Checking syntax before reload.`);
        if (filename.endsWith(".js")) {
          const filePath = path.join(EXT_DIR, filename);
          try {
            execSync(`node --check "${filePath}"`, { stdio: "pipe" });
          } catch (err) {
            log(`Syntax check failed for ${filename}: ${err.message}. Aborting hot reload.`);
            return;
          }
        }
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

server.listen(SOCKET_PATH, () => {
  try { fs.chmodSync(SOCKET_PATH, 0o600); } catch (e) {}
  log(`Bridge Daemon listening on ${SOCKET_PATH}`);
});
