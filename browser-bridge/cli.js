#!/usr/bin/env node
// Antigravity Browser Bridge CLI
const net = require("net");
const fs = require("fs");

const SOCKET_PATH = "/tmp/antigravity-browser-bridge.sock";

function callDaemon(method, params = {}, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SOCKET_PATH)) {
      return reject(new Error("Bridge daemon is not running (socket not found)."));
    }

    const client = net.createConnection(SOCKET_PATH);
    const reqId = `cli_${Math.random().toString(36).substring(2, 9)}`;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        reject(new Error(`Command '${method}' timed out after ${timeoutMs}ms.`));
      }
    }, timeoutMs);

    client.on("connect", () => {
      client.write(JSON.stringify({ id: reqId, method, params }) + "\n");
    });

    let buffer = "";
    client.on("data", (chunk) => {
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
                client.end();
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

    client.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error(`Daemon connection failed: ${err.message}`));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(`Antigravity Browser Bridge CLI
Usage:
  node cli.js status
  node cli.js list-tabs
  node cli.js new-tab [--profile <email|hint>] [--foreground] <url>
  node cli.js activate <tabId> [--bring-to-front]
  node cli.js snapshot <tabId>
  node cli.js click <tabId> <uid>
  node cli.js type <tabId> <text> [--uid <uid>] [--clear] [--enter]
  node cli.js paste <tabId> <text>
  node cli.js batch <tabId> '<actionsJson>'
  node cli.js close <tabId>
  node cli.js cleanup (close all agent-created tabs)
  node cli.js reload-extension
`);
    process.exit(0);
  }

  try {
    if (cmd === "status") {
      const res = await callDaemon("status");
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "list-tabs" || cmd === "tabs") {
      const res = await callDaemon("list_tabs");
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "new-tab" || cmd === "new") {
      let profile = null;
      let url = "about:blank";
      let foreground = false;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--profile" && args[i + 1]) {
          profile = args[i + 1];
          i++;
        } else if (args[i] === "--foreground" || args[i] === "-f") {
          foreground = true;
        } else if (args[i] === "--background" || args[i] === "-b") {
          foreground = false;
        } else if (!args[i].startsWith("--")) {
          url = args[i];
        }
      }
      const res = await callDaemon("new_tab", { url, profile, foreground, active: foreground });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "cleanup" || cmd === "close-agent-tabs") {
      const res = await callDaemon("close_agent_tabs");
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "activate") {
      const tabId = parseInt(args[1], 10);
      const res = await callDaemon("activate_tab", { tabId });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "snapshot" || cmd === "snap") {
      const tabId = parseInt(args[1], 10);
      const res = await callDaemon("snapshot", { tabId });
      console.log(res.tree || JSON.stringify(res, null, 2));
    } else if (cmd === "click") {
      const tabId = parseInt(args[1], 10);
      let uid = null;
      let x = undefined;
      let y = undefined;
      let dblClick = false;
      let button = "left";
      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--x" && args[i + 1] !== undefined) {
          x = parseFloat(args[i + 1]);
          i++;
        } else if (args[i] === "--y" && args[i + 1] !== undefined) {
          y = parseFloat(args[i + 1]);
          i++;
        } else if (args[i] === "--dblclick" || args[i] === "--double-click") {
          dblClick = true;
        } else if (args[i] === "--right" || args[i] === "--right-click") {
          button = "right";
        } else if (args[i] === "--button" && args[i + 1]) {
          button = args[i + 1];
          i++;
        } else if (!args[i].startsWith("--") && !uid) {
          uid = args[i];
        }
      }
      const res = await callDaemon("click", { tabId, uid, x, y, dblClick, button });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "hover") {
      const tabId = parseInt(args[1], 10);
      let uid = null;
      let x = undefined;
      let y = undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--x" && args[i + 1] !== undefined) {
          x = parseFloat(args[i + 1]);
          i++;
        } else if (args[i] === "--y" && args[i + 1] !== undefined) {
          y = parseFloat(args[i + 1]);
          i++;
        } else if (!args[i].startsWith("--") && !uid) {
          uid = args[i];
        }
      }
      const res = await callDaemon("hover", { tabId, uid, x, y });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "press-key" || cmd === "key") {
      const tabId = parseInt(args[1], 10);
      const key = args[2] || "Enter";
      let ctrl = false, alt = false, shift = false, meta = false;
      for (let i = 3; i < args.length; i++) {
        if (args[i] === "--ctrl") ctrl = true;
        if (args[i] === "--alt") alt = true;
        if (args[i] === "--shift") shift = true;
        if (args[i] === "--meta") meta = true;
      }
      const res = await callDaemon("press_key", { tabId, key, ctrl, alt, shift, meta });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "screenshot") {
      const tabId = parseInt(args[1], 10);
      const res = await callDaemon("screenshot", { tabId });
      console.log(`Captured screenshot (${res.format}, ${res.dataBase64?.length || 0} bytes base64)`);
    } else if (cmd === "evaluate" || cmd === "eval") {
      const tabId = parseInt(args[1], 10);
      const expression = args.slice(2).join(" ");
      const res = await callDaemon("evaluate", { tabId, expression });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "type") {
      const tabId = parseInt(args[1], 10);
      const text = args[2];
      let uid = null;
      let clear = false;
      let pressEnter = false;
      for (let i = 3; i < args.length; i++) {
        if (args[i] === "--uid" && args[i + 1]) {
          uid = args[i + 1];
          i++;
        }
        if (args[i] === "--clear") clear = true;
        if (args[i] === "--enter") pressEnter = true;
      }
      const res = await callDaemon("type", { tabId, text, uid, clear, pressEnter });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "find-and-click" || cmd === "fc") {
      const tabId = parseInt(args[1], 10);
      const selector = args[2];
      const res = await callDaemon("find_and_click", { tabId, selector });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "paste") {
      const tabId = parseInt(args[1], 10);
      const text = args.slice(2).join(" ");
      const res = await callDaemon("paste", { tabId, text });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "run-actions" || cmd === "batch") {
      const tabId = parseInt(args[1], 10);
      const actionsJson = args.slice(2).join(" ");
      const actions = JSON.parse(actionsJson);
      const res = await callDaemon("run_actions", { tabId, actions });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "close") {
      const tabId = parseInt(args[1], 10);
      const res = await callDaemon("close_tab", { tabId });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "reload-extension" || cmd === "reload") {
      const res = await callDaemon("reload_extension");
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
