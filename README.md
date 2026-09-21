# 🚀 Antigravity Browser Bridge

[![CI](https://github.com/de2pressed/antigravity-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/de2pressed/antigravity-browser/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension: Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-green.svg)](browser-extension/manifest.json)
[![Antigravity MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](mcp-schemas/)

**Antigravity Browser Bridge** is a high-speed, production-grade Chrome browser automation system engineered specifically for AI coding agents (Google Antigravity, Claude, Codex, and Cursor). It enables agents to interact with web pages, complex SPAs, and canvas-heavy productivity applications with **sub-second throughput, non-disruptive background execution, and 24/7 visual cursor guidance**.

---

## 🌟 Key Highlights

- **⚡ Sub-Second TPS via Compound Batching**: Eliminates multi-turn LLM latency. Dispatch complex multi-step sequences (`click`, `type`, `paste`, `press_key`, `wait`, `scroll`) in a single network turn (<400ms).
- **🛡️ Non-Disruptive Background Execution**: New tabs open silently in the background (`active: false`). Agents inspect, click, and evaluate web pages **without ever stealing your active screen or keyboard focus**.
- **🚀 Anti-Throttling Engine**: Uses Chrome DevTools Protocol (`Emulation.setFocusEmulationEnabled`) so background tabs execute JavaScript, timers, and React hydration at **100% full foreground speed**.
- **📊 Google Sheets Mastery**: Solves the canvas grid limitation. Navigates deterministically via the Name Box (`#t-name-box` / `Ctrl+J`) and ingests data/formulas via bulk TSV clipboard injection at **1,000+ cells per second**.
- **🎯 24/7 Glowing Cursor Feedback**: Renders an accelerated cyan pointer on the tab so you can visually track agent actions live in real time.
- **🔄 Autonomous Hot-Reload Loop**: Extension can update and hot-reload in under 300ms without manual intervention or Chrome Web Store roundtrips.
- **🔒 Safe Tab Ownership**: Tracks agent-created tabs. Prevents rogue agents from modifying your active personal or work tabs (WhatsApp, Gmail, production dashboards).
- **📦 5-Skill Automation Suite**: Shipped with 5 complete production skills and 22 deep-dive reference guides covering accessibility, financial modeling, dev server testing, and Playwright visual QA.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       AI AGENT LAYER                        │
│   Antigravity IDE  /  Claude  /  Codex  /  Autonomous CLI   │
└──────────────┬───────────────────────────────┬──────────────┘
               │ JSON-RPC (MCP)                │ CLI Wrapper
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│  mcp-server.js / launcher    │ │  agy-browser (CLI)          │
└──────────────┬───────────────┘ └─────────────┬───────────────┘
               │ UNIX Domain Socket (/tmp/antigravity-browser-bridge.sock)
               ▼
┌─────────────────────────────────────────────────────────────┐
│   bridge-daemon.js (systemd user service: persistent 24/7)   │
└──────────────┬───────────────────────────────┬──────────────┘
               │ Native Messaging (stdio)      │
               ▼                               ▼
   ┌───────────────────────┐       ┌───────────────────────┐
   │ host.js (Profile A)   │       │ host.js (Profile B)   │
   └───────────┬───────────┘       └───────────┬───────────┘
               │ Chrome Port                   │ Chrome Port
               ▼                               ▼
   ┌───────────────────────┐       ┌───────────────────────┐
   │ Extension SW (v1.4.0) │       │ Extension SW (v1.4.0) │
   │ • 24/7 Cursor Engine  │       │ • Background Runner   │
   │ • CDP Debugger Client │       │ • Tab Ownership Map   │
   └───────────────────────┘       └───────────────────────┘
```

---

## ⚡ Quickstart & Installation

### Prerequisites
- Linux (Ubuntu / Debian / Fedora / Arch)
- Google Chrome
- Node.js >= 18

### One-Command Setup
```bash
git clone https://github.com/de2pressed/antigravity-browser.git
cd antigravity-browser
./install.sh
```

### Load the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `browser-extension` folder inside this repository.
4. Verify the extension ID is `fkklpoodihheinpcjpldofbdbmabofcl`.

---

## 💻 CLI Usage (`agy-browser`)

The global CLI wrapper is available from any directory:

```bash
# Check status of connected Chrome profiles & daemon
agy-browser status

# List all open tabs across profiles with ownership tags
agy-browser tabs

# Open a new tab in the background (default, zero focus stealing)
agy-browser new "https://github.com"

# Open in foreground if you want to watch directly
agy-browser new --foreground "https://x.com"

# Target a specific Chrome profile
agy-browser new --profile "jayantdahiya1204" "https://x.com"

# Take an accessibility snapshot
agy-browser snap <tabId>

# Click an element by ID or selector
agy-browser click <tabId> <uid>

# Paste bulk text or TSV data instantly
agy-browser paste <tabId> "Column1\tColumn2\nVal1\tVal2"

# Execute a compound batch of actions
agy-browser batch <tabId> '[
  {"type":"click","selector":"input[type=search]"},
  {"type":"type","text":"production telemetry"},
  {"type":"press_key","key":"Enter"}
]'

# Cleanly close all temporary tabs created by the agent
agy-browser cleanup
```

---

## 📊 Google Sheets Automation Mastery

Google Sheets renders cells onto an HTML5 `<canvas>`. Standard element selectors and pixel clicks fail. Antigravity Browser Bridge automates sheets deterministically:

### 1. Jump to Range via Name Box
```json
{
  "actions": [
    { "type": "click", "selector": "#t-name-box" },
    { "type": "type", "text": "A1:D10" },
    { "type": "press_key", "key": "Enter" }
  ]
}
```

### 2. Bulk TSV Ingestion (`browser_paste`)
Populates hundreds of cells, headers, and formulas in one atomic paste:
```tsv
Quarter	Revenue	Expenses	Net Margin
Q1 2026	150000	95000	=B2-C2
Q2 2026	185000	110000	=B3-C3
Total	=SUM(B2:B3)	=SUM(C2:C3)	=SUM(D2:D3)
```

---

## 📚 Included Skills Suite

All 5 production skills with their **22 deep-dive reference guides** are located in the `skills/` directory:

| Skill | Focus |
|---|---|
| [`browser-control`](skills/browser-control/SKILL.md) | Universal browser automation, compound batching, accessibility trees, and CDP fallbacks. |
| [`browser-google-sheets`](skills/browser-google-sheets/SKILL.md) | Canvas architecture, `#t-name-box` recipes, bulk TSV injection, and export verification. |
| [`spreadsheets-mastery`](skills/spreadsheets-mastery/SKILL.md) | Financial modeling standards (FAST), dynamic array formulas (`XLOOKUP`, `LET`), and visual design palettes. |
| [`agent-browser`](skills/agent-browser/SKILL.md) | High-velocity CLI operations, numerical ref indexing (`[e1]`, `[e2]`), and dev-server verification. |
| [`playwright-interactive`](skills/playwright-interactive/SKILL.md) | Deep headless/headed automation, persistent session state re-use, and 30-point QA checklists. |

---

## 🛠️ MCP Configuration

Add this entry to your `~/.gemini/config/mcp_config.json` or Antigravity MCP settings:

```json
{
  "mcpServers": {
    "antigravity_browser": {
      "command": "/home/jayant/projects/antigravity-browser/browser-bridge/mcp-launcher.sh",
      "args": []
    }
  }
}
```

---

## 📄 License

MIT License. Copyright (c) 2026 Jayant (@de2pressed). See [LICENSE](LICENSE) for details.
