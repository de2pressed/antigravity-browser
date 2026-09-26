#!/usr/bin/env node
// Antigravity Browser Bridge MCP Server - Forwarding Client to Daemon
const net = require("net");
const fs = require("fs");
const readline = require("readline");

const SOCKET_PATH = "/tmp/antigravity-browser-bridge.sock";

const { spawn } = require("child_process");
const DAEMON_SCRIPT = "/home/jayant/.gemini/antigravity/browser-bridge/bridge-daemon.js";

let daemonStarting = null;

function ensureDaemonRunning() {
  if (daemonStarting) return daemonStarting;

  daemonStarting = new Promise((resolve) => {
    // Check if socket responds
    const testSock = net.createConnection(SOCKET_PATH);
    testSock.on("connect", () => {
      testSock.destroy();
      daemonStarting = null;
      resolve(true);
    });
    testSock.on("error", () => {
      try {
        if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
      } catch (e) {}

      // Spawn daemon in background detached
      const child = spawn(process.execPath, [DAEMON_SCRIPT], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();

      // Wait up to 2 seconds for socket creation
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (fs.existsSync(SOCKET_PATH)) {
          clearInterval(interval);
          daemonStarting = null;
          resolve(true);
        } else if (attempts > 20) {
          clearInterval(interval);
          daemonStarting = null;
          resolve(false);
        }
      }, 100);
    });
  });

  return daemonStarting;
}

async function callDaemon(method, params = {}, timeoutMs = 30000) {
  await ensureDaemonRunning();

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    const reqId = `mcp_${Math.random().toString(36).substring(2, 11)}`;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error(`MCP Tool '${method}' timed out after ${timeoutMs}ms.`));
      }
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(JSON.stringify({ id: reqId, method, params }) + "\n");
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
            const resp = JSON.parse(line);
            if (resp.id === reqId) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                socket.end();
                if (resp.error) {
                  reject(new Error(resp.error));
                } else {
                  resolve(resp.result);
                }
              }
            }
          } catch (e) {}
        }
      }
    });

    socket.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error(`Bridge connection error: ${err.message}`));
      }
    });
  });
}

const TOOLS = [
  {
    name: "browser_reload_extension",
    description: "Hot reload the Antigravity Browser Bridge extension across all open Chrome profiles immediately without opening chrome://extensions.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "browser_run_actions",
    description: "Execute a high-speed batch sequence of actions in one roundtrip (click, find_and_click, type, key/press_key, paste, wait, scroll, evaluate) inside the browser worker without multi-turn latency.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The target tab ID." },
        actions: {
          type: "array",
          description: "Array of action objects to execute sequentially (e.g. [{ action: 'find_and_click', selector: '#t-name-box' }, { action: 'type', text: 'A1:K72', enter: true }, { action: 'paste', text: '...' }]).",
          items: { type: "object" }
        }
      },
      required: ["tabId", "actions"]
    }
  },
  {
    name: "browser_claim_tab",
    description: "Explicitly claim an existing user tab for the current agent session, bypassing tab safety protection without needing allowExistingTab flags on subsequent calls.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The tab ID to claim as agent-owned." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_paste",
    description: "Paste text, TSV, or styled HTML directly into the active element/selection in the page via dual DataTransfer clipboard injection.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The target tab ID." },
        text: { type: "string", description: "The text or TSV table content to paste." },
        html: { type: "string", description: "Optional rich HTML table/markup to paste into formatted editors like Google Sheets with custom cell styles, colors, and borders." }
      },
      required: ["tabId", "text"]
    }
  },
  {
    name: "browser_find_and_click",
    description: "Locate an element by CSS selector, text content, or accessibility role and perform a hardware mouse click with visual cursor glide.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The target tab ID." },
        selector: { type: "string", description: "Optional CSS selector (e.g. '#t-name-box', 'button[aria-label*=\"Bold\"]')." },
        text: { type: "string", description: "Optional inner text or aria-label substring to match." },
        role: { type: "string", description: "Optional ARIA role." },
        button: { type: "string", enum: ["left", "right", "middle"], description: "Mouse button. Defaults to left." },
        dblClick: { type: "boolean", description: "Whether to double click." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_list_tabs",
    description: "List all open tabs across all Google Chrome windows and profiles (e.g. devops@qtloads.com, jayantdahiya1204@gmail.com) with tab IDs, titles, URLs, active status, and profile email.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "browser_new_tab",
    description: "Open a URL in a new tab in an existing Chrome profile window without launching CLI processes. Supports targeting 'devops@qtloads.com' (or 'devops') or 'jayantdahiya1204@gmail.com' (or 'default').",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The destination URL. Defaults to about:blank." },
        profile: { type: "string", description: "Profile to open tab in: 'devops@qtloads.com', 'devops', 'qtloads', 'jayantdahiya1204@gmail.com', or 'default'." },
        active: { type: "boolean", description: "Whether to activate the new tab. Defaults to true." }
      }
    }
  },
  {
    name: "browser_activate_tab",
    description: "Switch to and bring a specific tab and its Chrome window into focus.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab to activate." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_close_tab",
    description: "Close an open tab in Google Chrome by tab ID.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab to close." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_close_agent_tabs",
    description: "Cleanly close all temporary/scratch tabs created by the agent during this session, leaving user personal tabs untouched.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "browser_navigate",
    description: "Navigate an existing tab to a new URL and wait for page load to finish.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab to navigate." },
        url: { type: "string", description: "The destination URL." }
      },
      required: ["tabId", "url"]
    }
  },
  {
    name: "browser_reload_tab",
    description: "Reload an existing tab with optional cache bypass.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab to reload." },
        ignoreCache: { type: "boolean", description: "Whether to bypass browser cache." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_snapshot",
    description: "Capture an accessibility tree snapshot with interactive elements, headings, text, and unique UIDs for precision clicking and typing.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab to inspect." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_click",
    description: "Perform a hardware mouse click on an element by UID (auto-scrolled into view with smooth animated cursor) or by coordinates (x, y).",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        uid: { type: "string", description: "The UID of the element from browser_snapshot (e.g. '123_4')." },
        x: { type: "number", description: "Optional explicit X coordinate." },
        y: { type: "number", description: "Optional explicit Y coordinate." },
        button: { type: "string", enum: ["left", "right", "middle"], description: "Mouse button. Defaults to left." },
        dblClick: { type: "boolean", description: "Whether to double click." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_hover",
    description: "Hover mouse over an element by UID or coordinates with animated cursor movement.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        uid: { type: "string", description: "Element UID." },
        x: { type: "number", description: "Optional X coordinate." },
        y: { type: "number", description: "Optional Y coordinate." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_drag",
    description: "Drag from a source element/coordinates to a target element/coordinates with animated cursor.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        fromUid: { type: "string", description: "Source element UID." },
        fromX: { type: "number", description: "Source X coordinate." },
        fromY: { type: "number", description: "Source Y coordinate." },
        toUid: { type: "string", description: "Destination element UID." },
        toX: { type: "number", description: "Destination X coordinate." },
        toY: { type: "number", description: "Destination Y coordinate." },
        steps: { type: "number", description: "Number of intermediate drag steps. Defaults to 10." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_type",
    description: "Type text into an element by UID (auto-focused) or the currently focused element via hardware keyboard events.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        text: { type: "string", description: "The text to type." },
        uid: { type: "string", description: "Optional UID of element to focus and type into." },
        clear: { type: "boolean", description: "Whether to clear existing text first (Select All + Backspace)." },
        pressEnter: { type: "boolean", description: "Whether to press Enter after typing." }
      },
      required: ["tabId", "text"]
    }
  },
  {
    name: "browser_press_key",
    description: "Send physical keyboard key press (Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Space) with optional modifiers.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        key: { type: "string", description: "Key name." },
        ctrl: { type: "boolean", description: "Control modifier." },
        alt: { type: "boolean", description: "Alt modifier." },
        shift: { type: "boolean", description: "Shift modifier." },
        meta: { type: "boolean", description: "Meta/Cmd modifier." }
      },
      required: ["tabId", "key"]
    }
  },
  {
    name: "browser_scroll",
    description: "Scroll the page smoothly via mouse wheel events.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        deltaY: { type: "number", description: "Vertical scroll amount in pixels (positive down, negative up). Defaults to 400." },
        deltaX: { type: "number", description: "Horizontal scroll amount in pixels. Defaults to 0." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_screenshot",
    description: "Capture a viewport or full-page screenshot.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        quality: { type: "number", description: "JPEG quality (1-100). Defaults to 80." },
        fullPage: { type: "boolean", description: "Whether to capture beyond the visible viewport." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_evaluate",
    description: "Evaluate a JavaScript expression in the page context and return the result value.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        expression: { type: "string", description: "JavaScript code string to evaluate." }
      },
      required: ["tabId", "expression"]
    }
  },
  {
    name: "browser_record_start",
    description: "Start recording a high-fidelity video of a tab via CDP screencast, capturing all visual interactions, persistent cursor movements, and DOM changes.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        outputPath: { type: "string", description: "Optional destination path for the recorded video file (.mp4)." },
        quality: { type: "number", description: "JPEG frame quality (1-100). Defaults to 85." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_record_stop",
    description: "Stop recording video of a tab, compile the captured frames into an MP4 video using ffmpeg, and return the output video file path and metadata.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the target tab." },
        outputPath: { type: "string", description: "Optional destination path for the final MP4 video file." }
      },
      required: ["tabId"]
    }
  },
  {
    name: "browser_record_actions",
    description: "Execute a batch of browser actions while simultaneously recording video, compiling the final workflow into an MP4 file upon completion.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The target tab ID." },
        actions: {
          type: "array",
          description: "Array of action objects to execute sequentially while recording.",
          items: { type: "object" }
        },
        outputPath: { type: "string", description: "Optional destination path for the final MP4 video file." }
      },
      required: ["tabId", "actions"]
    }
  }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendJsonRpc(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (err) {
    return;
  }

  const { id, method, params } = request;

  if (method === "initialize") {
    return sendJsonRpc({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "antigravity_browser", version: "1.6.0" }
      }
    });
  }

  if (method === "notifications/initialized") return;

  if (method === "tools/list") {
    return sendJsonRpc({
      jsonrpc: "2.0",
      id,
      result: { tools: TOOLS }
    });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      let daemonMethod = toolName.replace(/^browser_/, "");
      let daemonArgs = { ...args };
      if (toolName === "browser_record_start") {
        daemonMethod = "start_recording";
      } else if (toolName === "browser_record_stop") {
        daemonMethod = "stop_recording";
      } else if (toolName === "browser_record_actions") {
        daemonMethod = "run_actions";
        daemonArgs.record = true;
      }
      const timeoutMs = (daemonMethod === "stop_recording" || daemonArgs.record) ? 90000 : 30000;
      const res = await callDaemon(daemonMethod, daemonArgs, timeoutMs);

      const content = [];
      if (toolName === "browser_snapshot") {
        content.push({ type: "text", text: res.tree || JSON.stringify(res, null, 2) });
      } else if (toolName === "browser_screenshot" && res.dataBase64) {
        content.push({
          type: "image",
          data: res.dataBase64,
          mimeType: res.format === "png" ? "image/png" : "image/jpeg"
        });
      } else {
        content.push({
          type: "text",
          text: typeof res === "string" ? res : JSON.stringify(res, null, 2)
        });
      }

      return sendJsonRpc({
        jsonrpc: "2.0",
        id,
        result: { content, isError: false }
      });
    } catch (err) {
      return sendJsonRpc({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `Error executing ${toolName}: ${err.message}` }],
          isError: true
        }
      });
    }
  }

  if (id !== undefined) {
    sendJsonRpc({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method ${method} not found` }
    });
  }
});
