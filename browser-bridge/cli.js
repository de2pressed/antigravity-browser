#!/usr/bin/env node
// Antigravity Browser Bridge CLI
const net = require("net");
const fs = require("fs");

const SOCKET_PATH = "/tmp/antigravity-browser-bridge.sock";

function callDaemon(method, params = {}, timeoutMs = 25000) {
  if (process.argv.includes("--force") || process.argv.includes("--allow-existing") || process.argv.includes("--allow-existing-tab")) {
    params.allowExistingTab = true;
  }
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
  agy-browser status
  agy-browser tabs [--profile <email|hint>] [--search <query>]
  agy-browser claim <tabId>
  agy-browser new [--profile <email|hint>] [--foreground] <url>
  agy-browser activate <tabId> [--bring-to-front]
  agy-browser snapshot <tabId>
  agy-browser click <tabId> <uid> [--x <x> --y <y>] [--dblclick] [--right]
  agy-browser fc <tabId> <selector>
  agy-browser type <tabId> <text> [--uid <uid>] [--clear] [--enter]
  agy-browser press-key <tabId> <key> [--ctrl] [--alt] [--shift] [--meta]
  agy-browser paste <tabId> <text> [--html <htmlString>]
  agy-browser scroll <tabId> [--direction up|down] [--distance <pixels>]
  agy-browser screenshot <tabId> [-o <filePath>]
  agy-browser eval <tabId> <expression>
  agy-browser batch <tabId> '<actionsJson>'
  agy-browser record-start <tabId> [-o <filePath>]
  agy-browser record-stop <tabId> [-o <filePath>]
  agy-browser record <tabId> '<actionsJson>' [-o <filePath>]
  agy-browser close <tabId>
  agy-browser cleanup (close all agent-created tabs)
  agy-browser reload-extension
`);
    process.exit(0);
  }

  try {
    if (cmd === "status") {
      const res = await callDaemon("status");
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "list-tabs" || cmd === "tabs") {
      let profileFilter = null;
      let searchQuery = null;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--profile" && args[i + 1]) {
          profileFilter = args[i + 1].toLowerCase();
          i++;
        } else if (args[i] === "--search" && args[i + 1]) {
          searchQuery = args[i + 1].toLowerCase();
          i++;
        }
      }
      let res = await callDaemon("list_tabs");
      if (Array.isArray(res)) {
        if (profileFilter) {
          res = res.filter(t => (t.profileEmail || "").toLowerCase().includes(profileFilter));
        }
        if (searchQuery) {
          res = res.filter(t => (t.title || "").toLowerCase().includes(searchQuery) || (t.url || "").toLowerCase().includes(searchQuery));
        }
      }
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "claim") {
      const tabId = parseInt(args[1], 10);
      const res = await callDaemon("claim_tab", { tabId, allowExistingTab: true });
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
    } else if (cmd === "screenshot" || cmd === "shot") {
      const tabId = parseInt(args[1], 10);
      let outputPath = null;
      for (let i = 2; i < args.length; i++) {
        if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
          outputPath = args[i + 1];
          i++;
        }
      }
      const res = await callDaemon("screenshot", { tabId });
      if (outputPath && res.dataBase64) {
        fs.writeFileSync(outputPath, Buffer.from(res.dataBase64, "base64"));
        console.log(`Saved screenshot to ${outputPath} (${res.format}, ${res.dataBase64.length} bytes base64)`);
      } else {
        console.log(`Captured screenshot (${res.format}, ${res.dataBase64?.length || 0} bytes base64)`);
      }
    } else if (cmd === "scroll") {
      const tabId = parseInt(args[1], 10);
      let deltaY = 400;
      let deltaX = 0;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--direction" && args[i + 1] === "up") {
          deltaY = -400;
          i++;
        } else if (args[i] === "--distance" && args[i + 1]) {
          deltaY = parseFloat(args[i + 1]) * (deltaY < 0 ? -1 : 1);
          i++;
        } else if (args[i] === "--up") {
          deltaY = -Math.abs(deltaY);
        } else if (args[i] === "--down") {
          deltaY = Math.abs(deltaY);
        }
      }
      const res = await callDaemon("scroll", { tabId, deltaY, deltaX });
      console.log(JSON.stringify(res, null, 2));
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
      let text = "";
      let html = "";
      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--html" && args[i + 1]) {
          html = args[i + 1];
          i++;
        } else if (args[i].startsWith("--")) {
          continue;
        } else if (!text) {
          text = args[i];
        } else {
          text += " " + args[i];
        }
      }
      const res = await callDaemon("paste", { tabId, text, html });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "run-actions" || cmd === "batch") {
      const tabId = parseInt(args[1], 10);
      const actionsJson = args.slice(2).join(" ");
      const actions = JSON.parse(actionsJson);
      const res = await callDaemon("run_actions", { tabId, actions });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "record-start") {
      const tabId = parseInt(args[1], 10);
      let outputPath = null;
      for (let i = 2; i < args.length; i++) {
        if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
          outputPath = args[i + 1];
          i++;
        }
      }
      const res = await callDaemon("start_recording", { tabId, outputPath });
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "record-stop") {
      const tabId = parseInt(args[1], 10);
      let outputPath = null;
      for (let i = 2; i < args.length; i++) {
        if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
          outputPath = args[i + 1];
          i++;
        }
      }
      const res = await callDaemon("stop_recording", { tabId, outputPath }, 60000);
      console.log(JSON.stringify(res, null, 2));
    } else if (cmd === "record") {
      const tabId = parseInt(args[1], 10);
      let outputPath = null;
      let actionsJson = null;
      for (let i = 2; i < args.length; i++) {
        if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
          outputPath = args[i + 1];
          i++;
        } else if (!args[i].startsWith("--") && !actionsJson) {
          actionsJson = args[i];
        }
      }
      const actions = actionsJson ? JSON.parse(actionsJson) : [];
      const res = await callDaemon("run_actions", { tabId, actions, record: true, outputPath }, 90000);
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
