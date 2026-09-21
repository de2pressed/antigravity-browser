#!/usr/bin/env node
// Antigravity Native Messaging Host - Unix Domain Socket Bridge with Auto-Reload Watcher
const net = require("net");
const fs = require("fs");
const path = require("path");

const LOG_FILE = "/tmp/antigravity-native-host.log";
const SOCKET_PATH = "/tmp/antigravity-browser-bridge.sock";
const EXT_DIR = "/home/jayant/.gemini/antigravity/browser-extension";

function log(str) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [PID ${process.pid}] ${str}\n`);
  } catch (e) {}
}

log(`Native host starting up. Args: ${JSON.stringify(process.argv)}`);

let mcpSocket = null;
let reconnectTimer = null;
let profileInfo = { email: "unknown", name: "default" };

// 1. Chrome Native Messaging on stdin / stdout (4-byte uint32-LE framing)
let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length >= 4 + msgLen) {
      const msgBytes = inputBuffer.slice(4, 4 + msgLen);
      inputBuffer = inputBuffer.slice(4 + msgLen);
      try {
        const msg = JSON.parse(msgBytes.toString("utf8"));
        onChromeMessage(msg);
      } catch (err) {
        log(`Error parsing message from Chrome: ${err.message}`);
      }
    } else {
      break;
    }
  }
});

process.stdin.on("end", () => {
  log("Chrome closed stdin pipe. Terminating native host.");
  if (mcpSocket && !mcpSocket.destroyed) {
    mcpSocket.destroy();
  }
  process.exit(0);
});

function sendToChrome(msg) {
  try {
    const json = JSON.stringify(msg);
    const len = Buffer.byteLength(json, "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(len, 0);
    process.stdout.write(header);
    process.stdout.write(json, "utf8");
  } catch (e) {
    log(`Failed to write to Chrome stdout: ${e.message}`);
  }
}

function onChromeMessage(msg) {
  // Check if this is a profile detection response
  if (msg.id && typeof msg.id === "string" && msg.id.startsWith("reg_profile_")) {
    if (msg.result) {
      profileInfo = msg.result;
      log(`Detected Chrome profile: ${JSON.stringify(profileInfo)}`);
      sendRegistration();
    }
    return;
  }

  // Check if this is a handshake from extension
  if (msg.type === "handshake" && msg.profile) {
    profileInfo = msg.profile;
    log(`Received handshake from Chrome extension: ${JSON.stringify(profileInfo)}`);
    sendRegistration();
    return;
  }

  // Forward response or event to MCP Server
  if (mcpSocket && !mcpSocket.destroyed) {
    try {
      mcpSocket.write(JSON.stringify(msg) + "\n");
    } catch (e) {
      log(`Failed to forward message to MCP socket: ${e.message}`);
    }
  }
}

// 2. Connect to MCP Server via Unix Domain Socket
function connectToMcpServer() {
  if (mcpSocket && !mcpSocket.destroyed) return;

  log(`Attempting connection to Unix socket: ${SOCKET_PATH}`);
  const socket = net.createConnection(SOCKET_PATH);

  socket.on("connect", () => {
    log("Successfully connected to MCP Server Unix domain socket.");
    mcpSocket = socket;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Immediately register with MCP server
    sendRegistration();

    // Query Chrome extension for fresh profile identity
    sendToChrome({ id: `reg_profile_${Date.now()}`, method: "get_profile" });
  });

  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          const req = JSON.parse(line);
          sendToChrome(req);
        } catch (e) {
          log(`Invalid JSON received from MCP server: ${e.message}`);
        }
      }
    }
  });

  let lastErrLog = 0;
  socket.on("error", (err) => {
    const now = Date.now();
    if (now - lastErrLog > 10000) {
      log(`Socket error (${err.code}): ${err.message}`);
      lastErrLog = now;
    }
  });

  socket.on("close", () => {
    mcpSocket = null;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToMcpServer();
  }, 1000);
}

function sendRegistration() {
  if (mcpSocket && !mcpSocket.destroyed) {
    try {
      mcpSocket.write(JSON.stringify({
        type: "register",
        pid: process.pid,
        profile: profileInfo
      }) + "\n");
    } catch (e) {}
  }
}

// File watching is handled centrally by the daemon.

// Start connection attempt
connectToMcpServer();

// Keepalive ping to Chrome extension
setInterval(() => {
  sendToChrome({ id: `ping_${Date.now()}`, method: "ping" });
}, 20000);
