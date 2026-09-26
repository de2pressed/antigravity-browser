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
const activeHostRecordings = new Map(); // recordingId -> { dir, outputPath, frames: [], startTime }

function detectLocalChromeProfile() {
  try {
    let profileDir = "Default";
    let ppid = process.ppid;
    for (let depth = 0; depth < 5 && ppid > 1; depth++) {
      const cmdlinePath = `/proc/${ppid}/cmdline`;
      if (fs.existsSync(cmdlinePath)) {
        const cmdline = fs.readFileSync(cmdlinePath, "utf8");
        const match = cmdline.match(/--profile-directory=([^\0]+)/);
        if (match) {
          profileDir = match[1];
          break;
        }
        if (cmdline.includes("chrome")) {
          profileDir = "Default";
        }
        const statusPath = `/proc/${ppid}/status`;
        if (fs.existsSync(statusPath)) {
          const status = fs.readFileSync(statusPath, "utf8");
          const pmatch = status.match(/PPid:\s+(\d+)/);
          ppid = pmatch ? parseInt(pmatch[1], 10) : 0;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const homeDir = process.env.HOME || "/home/jayant";
    const prefPath = path.join(homeDir, ".config/google-chrome", profileDir, "Preferences");
    if (fs.existsSync(prefPath)) {
      const data = JSON.parse(fs.readFileSync(prefPath, "utf8"));
      const accounts = data.account_info || [];
      const email = accounts[0]?.email || (data.profile?.name && data.profile.name.includes("@") ? data.profile.name : "unknown");
      const domain = email.includes("@") ? email.split("@")[1] : "";
      return { email, domain, profileDir, name: data.profile?.name || profileDir };
    }
  } catch (e) {
    log(`detectLocalChromeProfile error: ${e.message}`);
  }
  return { email: "unknown", domain: "", name: "default" };
}

let profileInfo = detectLocalChromeProfile();
log(`Initialized native host with profile: ${JSON.stringify(profileInfo)}`);

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
    if (msg.result && msg.result.email && msg.result.email !== "unknown") {
      profileInfo = { ...profileInfo, ...msg.result };
      log(`Updated Chrome profile from extension: ${JSON.stringify(profileInfo)}`);
      sendRegistration();
    }
    return;
  }

  // Check if this is a handshake from extension
  if (msg.type === "handshake" && msg.profile) {
    if (msg.profile.email && msg.profile.email !== "unknown") {
      profileInfo = { ...profileInfo, ...msg.profile };
      log(`Updated Chrome profile from handshake: ${JSON.stringify(profileInfo)}`);
    } else if (profileInfo.email && profileInfo.email !== "unknown") {
      // Feed our locally detected profile back to the extension
      sendToChrome({ method: "set_profile", params: { profile: profileInfo } });
    }
    sendRegistration();
    return;
  }

  // Handle Video Recording Lifecycle
  if (msg.type === "recording_init") {
    const dir = `/tmp/antigravity-recordings/${msg.recordingId}`;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
    activeHostRecordings.set(msg.recordingId, {
      dir,
      outputPath: msg.outputPath,
      frames: [],
      startTime: Date.now()
    });
    log(`Initialized recording session: ${msg.recordingId} at ${dir}`);
    return;
  }

  if (msg.type === "screencast_frame") {
    const rec = activeHostRecordings.get(msg.recordingId);
    if (rec) {
      const frameFile = path.join(rec.dir, `frame_${String(msg.frameIndex).padStart(6, "0")}.jpg`);
      try {
        fs.writeFileSync(frameFile, Buffer.from(msg.data, "base64"));
        rec.frames.push({
          file: frameFile,
          timestamp: typeof msg.timestamp === "number" ? msg.timestamp : (Date.now() / 1000)
        });
      } catch (err) {
        log(`Error writing screencast frame: ${err.message}`);
      }
    }
    return;
  }

  if (msg.type === "recording_finalize") {
    const rec = activeHostRecordings.get(msg.recordingId);
    if (!rec || rec.frames.length === 0) {
      log(`Finalizing recording ${msg.recordingId}: no frames recorded.`);
      sendToChrome({
        type: "recording_complete",
        recordingId: msg.recordingId,
        result: { success: false, error: "No frames captured during recording session." }
      });
      return;
    }

    const frames = rec.frames;
    log(`Compiling ${frames.length} frames for recording ${msg.recordingId}...`);

    let manifest = "ffconcat version 1.0\n";
    for (let i = 0; i < frames.length; i++) {
      let dur = 0.033;
      if (i < frames.length - 1) {
        dur = Math.max(0.01, frames[i + 1].timestamp - frames[i].timestamp);
        dur = Math.min(10.0, dur);
      } else {
        dur = Math.max(0.2, (msg.stopTimestamp || (Date.now() / 1000)) - frames[i].timestamp);
        dur = Math.min(3.0, dur);
      }
      manifest += `file '${frames[i].file}'\nduration ${dur.toFixed(4)}\n`;
    }
    manifest += `file '${frames[frames.length - 1].file}'\n`;

    const listPath = path.join(rec.dir, "list.txt");
    fs.writeFileSync(listPath, manifest, "utf8");

    const finalOutput = path.resolve(msg.outputPath || rec.outputPath);
    const outDir = path.dirname(finalOutput);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const { spawn } = require("child_process");
    const ffArgs = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-r", "30",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      finalOutput
    ];

    const ff = spawn("ffmpeg", ffArgs);
    ff.on("close", (code) => {
      activeHostRecordings.delete(msg.recordingId);
      try {
        fs.rmSync(rec.dir, { recursive: true, force: true });
      } catch (e) {}

      if (code === 0 && fs.existsSync(finalOutput)) {
        const stats = fs.statSync(finalOutput);
        log(`Recording successfully compiled: ${finalOutput} (${stats.size} bytes)`);
        sendToChrome({
          type: "recording_complete",
          recordingId: msg.recordingId,
          result: {
            success: true,
            tabId: msg.tabId,
            recordingId: msg.recordingId,
            outputPath: finalOutput,
            fileSizeBytes: stats.size,
            frameCount: frames.length,
            durationSeconds: Math.round(((Date.now() - rec.startTime) / 1000) * 10) / 10
          }
        });
      } else {
        log(`ffmpeg compilation failed with code ${code}`);
        sendToChrome({
          type: "recording_complete",
          recordingId: msg.recordingId,
          result: {
            success: false,
            error: `ffmpeg encoding failed with exit code ${code}`
          }
        });
      }
    });
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
