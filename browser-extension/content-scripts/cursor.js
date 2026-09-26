// Antigravity Browser Bridge - Minimalist Modern Studio Cursor (v1.6.0)
// High-precision vector cursor with Figma/macOS aesthetics, dynamic velocity banking,
// and inline loading circle next to Antigravity text during thinking mode.

(function () {
  const OVERLAY_ID = "codex-agent-overlay-root"; // Retain id for backward compatibility
  if (window.__antigravityCursorInitialized) return;
  window.__antigravityCursorInitialized = true;

  let rootElement = null;
  let shadowRoot = null;
  let tracker = null;
  let pointerWrapper = null;
  let badgeSpinner = null;
  let badgeText = null;

  // State
  let currentX = 350;
  let currentY = 250;
  let targetX = 350;
  let targetY = 250;
  let isVisible = true;
  let currentMode = "idle"; // "idle" | "thinking"
  let currentTilt = 0;
  let currentStretch = 1;
  let currentSqueeze = 1;
  let animFrameId = null;

  const CSS_STYLES = `
    :host {
      all: initial !important;
    }
    .overlay-viewport {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      overflow: hidden !important;
      user-select: none !important;
    }
    @media print {
      .overlay-viewport { display: none !important; }
    }

    /* Tracker Container */
    .cursor-tracker {
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      will-change: transform;
      pointer-events: none;
      transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Pointer Wrapper (Tilts & Stretches dynamically during movement) */
    .pointer-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      will-change: transform;
    }
    .pointer-wrapper.pressed {
      transform: scale(0.88) !important;
      transition: transform 0.05s ease-in !important;
    }

    /* Minimalist Studio Vector Pointer - 18.5px (+15% scale) */
    .pointer-svg {
      display: block;
      overflow: visible;
      transform: translate3d(0, 0, 0);
    }

    /* Minimalist Gemini Badge - Circular in idle, expands to pill when thinking */
    .agent-badge {
      position: absolute;
      left: 17px;
      top: 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 20px;
      height: 20px;
      padding: 0;
      border-radius: 50%;
      background: rgba(24, 24, 27, 0.90);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 2px 7px rgba(0, 0, 0, 0.36), 0 0 1px rgba(255, 255, 255, 0.2);
      pointer-events: none;
      transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.2s cubic-bezier(0.16, 1, 0.3, 1), padding 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .agent-badge.thinking {
      width: auto;
      height: 20px;
      padding: 0 6.5px;
      border-radius: 9999px;
    }

    .gemini-icon {
      display: block;
      width: 12.5px;
      height: 12.5px;
      flex-shrink: 0;
    }

    /* Loading Circle Next to Gemini Logo (Only visible during thinking mode) */
    .badge-spinner {
      display: none;
      width: 9.5px;
      height: 9.5px;
      animation: spin-orbit 0.75s linear infinite;
      margin-left: 2px;
      flex-shrink: 0;
    }
    .badge-spinner.active {
      display: inline-block;
    }
    .badge-text {
      display: none;
    }
    .badge-text.visible {
      display: inline;
    }
    @keyframes spin-orbit {
      to { transform: rotate(360deg); }
    }
  `;

  function initOverlay() {
    let existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      try { existing.remove(); } catch (e) {}
    }

    rootElement = document.createElement("div");
    rootElement.id = OVERLAY_ID;
    rootElement.dataset.antigravityCursor = "true";
    rootElement.setAttribute("aria-hidden", "true");
    rootElement.setAttribute("inert", "");

    shadowRoot = rootElement.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    styleEl.textContent = CSS_STYLES;
    shadowRoot.appendChild(styleEl);

    const viewport = document.createElement("div");
    viewport.className = "overlay-viewport";
    viewport.setAttribute("aria-hidden", "true");

    tracker = document.createElement("div");
    tracker.className = "cursor-tracker";
    tracker.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

    // Pointer wrapper
    pointerWrapper = document.createElement("div");
    pointerWrapper.className = "pointer-wrapper";

    // Crisp Vector Pointer SVG (18.5px size, +15% scale with Figma / macOS minimalist styling)
    pointerWrapper.innerHTML = `
      <svg class="pointer-svg" width="18.5" height="18.5" viewBox="0 0 24 24" fill="none">
        <defs>
          <filter id="studio-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.8" stdDeviation="1.8" flood-color="rgba(0, 0, 0, 0.45)" />
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" flood-color="rgba(0, 0, 0, 0.3)" />
          </filter>
        </defs>
        <path d="M0 0 L0 18 L5 13.5 L9 21.5 L12 20 L8 12.5 L15 12.5 Z" 
              fill="#18181b" 
              stroke="#ffffff" 
              stroke-width="1.8" 
              stroke-linejoin="round"
              filter="url(#studio-shadow)" />
      </svg>
    `;

    // Sibling Pill Badge with Gemini Logo
    const badgeEl = document.createElement("div");
    badgeEl.className = "agent-badge";
    badgeEl.innerHTML = `
      <svg class="gemini-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gemini-pill-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4E82EE" />
            <stop offset="50%" stop-color="#9B72CF" />
            <stop offset="100%" stop-color="#1BA1E3" />
          </linearGradient>
        </defs>
        <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#gemini-pill-grad)" />
      </svg>
      <span class="badge-text"></span>
      <svg class="badge-spinner" width="9.5" height="9.5" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="rgba(255, 255, 255, 0.22)" stroke-width="2.2" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    `;

    badgeText = badgeEl.querySelector(".badge-text");
    badgeSpinner = badgeEl.querySelector(".badge-spinner");

    tracker.appendChild(pointerWrapper);
    tracker.appendChild(badgeEl);
    viewport.appendChild(tracker);
    shadowRoot.appendChild(viewport);

    const docEl = document.documentElement || document.body;
    if (docEl) {
      docEl.appendChild(rootElement);
    }
  }

  // Animation Loop (Spring interpolation + Dynamic directional tilt)
  function startAnimationLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function tick() {
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1.0) {
        currentX = targetX;
        currentY = targetY;
        currentTilt += (0 - currentTilt) * 0.25;
        currentStretch += (1 - currentStretch) * 0.25;
        currentSqueeze += (1 - currentSqueeze) * 0.25;
      } else {
        // Smooth responsive spring motion
        const factor = Math.min(0.25, Math.max(0.15, dist / 800));
        currentX += dx * factor;
        currentY += dy * factor;

        // Dynamic directional tilt: leans noticeably towards travel direction (+/- 25 deg)
        const bankX = Math.max(-25, Math.min(25, dx / 8));
        const bankY = Math.max(-10, Math.min(10, dy / 20));
        const desiredTilt = bankX + (dx >= 0 ? bankY : -bankY);
        currentTilt += (desiredTilt - currentTilt) * 0.35;

        // Velocity stretch along motion vector
        const desiredStretch = 1 + Math.min(0.10, dist / 1200);
        const desiredSqueeze = 1 - Math.min(0.05, dist / 2400);
        currentStretch += (desiredStretch - currentStretch) * 0.25;
        currentSqueeze += (desiredSqueeze - currentSqueeze) * 0.25;
      }

      if (tracker) {
        tracker.style.transform = `translate3d(${Math.round(currentX)}px, ${Math.round(currentY)}px, 0)`;
        tracker.style.opacity = isVisible ? "1" : "0";
      }

      if (pointerWrapper) {
        pointerWrapper.style.transform = `rotate(${Math.round(currentTilt * 10) / 10}deg) scale(${Math.round(currentSqueeze * 1000) / 1000}, ${Math.round(currentStretch * 1000) / 1000})`;
      }

      animFrameId = requestAnimationFrame(tick);
    }

    animFrameId = requestAnimationFrame(tick);
  }

  // State Updates
  function setCursorMode(mode, customBadge = "") {
    currentMode = mode;
    const badgeEl = shadowRoot ? shadowRoot.querySelector(".agent-badge") : null;

    if (badgeSpinner) {
      if (mode === "thinking") {
        badgeSpinner.classList.add("active");
        if (badgeEl) badgeEl.classList.add("thinking");
      } else {
        badgeSpinner.classList.remove("active");
        if (badgeEl) badgeEl.classList.remove("thinking");
      }
    }

    if (badgeText) {
      if (customBadge) {
        badgeText.textContent = customBadge;
        badgeText.classList.add("visible");
      } else {
        badgeText.textContent = "";
        badgeText.classList.remove("visible");
      }
    }
  }

  function applyCursorState(state) {
    if (!state) return;

    isVisible = state.isVisible !== false && state.cursor?.visible !== false;

    if (state.cursor && typeof state.cursor.x === "number" && typeof state.cursor.y === "number") {
      targetX = state.cursor.x;
      targetY = state.cursor.y;

      if (state.cursor.animateMovement === false) {
        currentX = targetX;
        currentY = targetY;
      }
    }

    if (state.mode) {
      setCursorMode(state.mode, state.badge);
    } else if (state.actionType === "thinking") {
      setCursorMode("thinking");
    }
  }

  // Communication Handlers
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "CONTENT_PING") {
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "AGENT_CURSOR_STATE") {
      applyCursorState(message.state);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "CURSOR_MODE") {
      setCursorMode(message.mode || "idle", message.badge);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  // Startup: Initialize DOM and query background for active state
  initOverlay();
  startAnimationLoop();

  chrome.runtime.sendMessage({ type: "GET_AGENT_CURSOR_STATE" }).then((res) => {
    if (res?.ok && res.state) {
      applyCursorState(res.state);
    }
  }).catch(() => {});
})();