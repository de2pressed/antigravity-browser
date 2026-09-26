// Antigravity Browser Bridge - Minimalist Modern Studio Cursor (v1.6.0)
// High-precision vector cursor with Figma/macOS aesthetics, dynamic velocity banking,
// interactive click ripples, state-aware aura (breathing/thinking), and typing beam mode.

(function () {
  const OVERLAY_ID = "codex-agent-overlay-root"; // Retain id for backward compatibility
  if (window.__antigravityCursorInitialized) return;
  window.__antigravityCursorInitialized = true;

  let rootElement = null;
  let shadowRoot = null;
  let tracker = null;
  let pointerWrapper = null;
  let cursorAura = null;
  let thinkingSpinner = null;
  let typingBeam = null;
  let badgeText = null;
  let ripplesLayer = null;

  // State
  let currentX = 350;
  let currentY = 250;
  let targetX = 350;
  let targetY = 250;
  let isVisible = true;
  let currentMode = "idle"; // "idle" | "thinking" | "typing"
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
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Ambient Breathing Aura */
    .cursor-aura {
      position: absolute;
      top: -24px;
      left: -24px;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(99, 102, 241, 0.08) 55%, transparent 72%);
      pointer-events: none;
      animation: aura-breathe 2.8s ease-in-out infinite alternate;
      transition: opacity 0.3s ease;
    }
    @keyframes aura-breathe {
      0% { transform: scale(0.85); opacity: 0.45; }
      100% { transform: scale(1.22); opacity: 0.9; }
    }

    /* Thinking / Executing Orbit Spinner */
    .thinking-spinner {
      position: absolute;
      top: -14px;
      left: -14px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: #38bdf8;
      border-right-color: #818cf8;
      pointer-events: none;
      opacity: 0;
      transform: scale(0.7);
      transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .thinking-spinner.active {
      opacity: 1;
      transform: scale(1);
      animation: spin-orbit 0.85s linear infinite;
    }
    @keyframes spin-orbit {
      to { transform: rotate(360deg); }
    }

    /* Typing Beam Indicator */
    .typing-beam {
      position: absolute;
      top: -2px;
      left: -1px;
      width: 2.5px;
      height: 22px;
      border-radius: 2px;
      background: linear-gradient(180deg, #38bdf8 0%, #818cf8 100%);
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.85);
      opacity: 0;
      transform: scaleY(0.5);
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .typing-beam.active {
      opacity: 1;
      animation: typing-pulse 0.75s ease-in-out infinite alternate;
    }
    @keyframes typing-pulse {
      0% { opacity: 0.35; transform: scaleY(0.7); }
      100% { opacity: 1; transform: scaleY(1.15); }
    }

    /* Pointer Wrapper (Tilts & Stretches during Velocity Glide) */
    .pointer-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      will-change: transform;
      transition: transform 0.08s ease-out;
    }
    .pointer-wrapper.pressed {
      transform: scale(0.85) !important;
      transition: transform 0.06s ease-in !important;
    }

    /* Minimalist Studio Vector Pointer */
    .pointer-svg {
      display: block;
      overflow: visible;
      transform: translate3d(0, 0, 0);
    }

    /* Minimalist Studio Pill Badge */
    .agent-badge {
      position: absolute;
      left: 18px;
      top: 16px;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px 3px 6px;
      border-radius: 9999px;
      background: rgba(24, 24, 27, 0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35), 0 0 1px rgba(255, 255, 255, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10px;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: 0.02em;
      white-space: nowrap;
      pointer-events: none;
      transition: all 0.2s ease;
    }
    .badge-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 6px #38bdf8;
      animation: dot-pulse 1.8s ease-in-out infinite alternate;
    }
    @keyframes dot-pulse {
      0% { opacity: 0.5; transform: scale(0.8); }
      100% { opacity: 1; transform: scale(1.2); }
    }

    /* Concentric Click Ripple */
    .cursor-ripple {
      position: absolute;
      width: 32px;
      height: 32px;
      margin-left: -16px;
      margin-top: -16px;
      border-radius: 50%;
      border: 2px solid rgba(56, 189, 248, 0.95);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
      pointer-events: none;
      animation: ripple-wave 0.55s cubic-bezier(0.1, 0.85, 0.25, 1) forwards;
    }
    @keyframes ripple-wave {
      0% {
        transform: scale(0.2);
        opacity: 0.95;
      }
      100% {
        transform: scale(2.8);
        opacity: 0;
      }
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

    ripplesLayer = document.createElement("div");
    ripplesLayer.className = "ripples-layer";
    viewport.appendChild(ripplesLayer);

    tracker = document.createElement("div");
    tracker.className = "cursor-tracker";
    tracker.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

    // Aura
    cursorAura = document.createElement("div");
    cursorAura.className = "cursor-aura";
    tracker.appendChild(cursorAura);

    // Thinking spinner
    thinkingSpinner = document.createElement("div");
    thinkingSpinner.className = "thinking-spinner";
    tracker.appendChild(thinkingSpinner);

    // Typing beam
    typingBeam = document.createElement("div");
    typingBeam.className = "typing-beam";
    tracker.appendChild(typingBeam);

    // Pointer wrapper
    pointerWrapper = document.createElement("div");
    pointerWrapper.className = "pointer-wrapper";

    // Crisp Studio Vector Pointer SVG (Figma / macOS minimalist style)
    pointerWrapper.innerHTML = `
      <svg class="pointer-svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <defs>
          <filter id="studio-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-color="rgba(0, 0, 0, 0.45)" />
            <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="rgba(0, 0, 0, 0.3)" />
          </filter>
        </defs>
        <path d="M0 0 L0 18 L5 13.5 L9 21.5 L12 20 L8 12.5 L15 12.5 Z" 
              fill="#18181b" 
              stroke="#ffffff" 
              stroke-width="1.6" 
              stroke-linejoin="round"
              filter="url(#studio-shadow)" />
      </svg>
      <div class="agent-badge">
        <span class="badge-dot"></span>
        <span class="badge-text">Antigravity</span>
      </div>
    `;

    badgeText = pointerWrapper.querySelector(".badge-text");
    tracker.appendChild(pointerWrapper);
    viewport.appendChild(tracker);
    shadowRoot.appendChild(viewport);

    const docEl = document.documentElement || document.body;
    if (docEl) {
      docEl.appendChild(rootElement);
    }
  }

  // Animation Loop (Spring interpolation + Dynamic velocity banking)
  function startAnimationLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function tick() {
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.5) {
        currentX = targetX;
        currentY = targetY;
        currentTilt += (0 - currentTilt) * 0.2;
        currentStretch += (1 - currentStretch) * 0.2;
        currentSqueeze += (1 - currentSqueeze) * 0.2;
      } else {
        // Smooth responsive spring movement
        const factor = Math.min(0.28, Math.max(0.18, dist / 800));
        currentX += dx * factor;
        currentY += dy * factor;

        // Dynamic velocity banking (tilts slightly in motion angle)
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const desiredTilt = Math.max(-24, Math.min(24, (angle - 45) * 0.32));
        currentTilt += (desiredTilt - currentTilt) * 0.25;

        // Velocity stretch along motion vector
        const desiredStretch = 1 + Math.min(0.18, dist / 700);
        const desiredSqueeze = 1 - Math.min(0.08, dist / 1400);
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

  // Interactive Click Ripple Effect
  function spawnClickRipple(x, y, dblClick = false) {
    if (!ripplesLayer) return;

    // Pointer squish effect
    if (pointerWrapper) {
      pointerWrapper.classList.add("pressed");
      setTimeout(() => {
        if (pointerWrapper) pointerWrapper.classList.remove("pressed");
      }, 90);
    }

    const ripple = document.createElement("div");
    ripple.className = "cursor-ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripplesLayer.appendChild(ripple);

    ripple.addEventListener("animationend", () => {
      ripple.remove();
    });

    if (dblClick) {
      setTimeout(() => {
        if (!ripplesLayer) return;
        const ripple2 = document.createElement("div");
        ripple2.className = "cursor-ripple";
        ripple2.style.left = `${x}px`;
        ripple2.style.top = `${y}px`;
        ripple2.style.borderColor = "rgba(129, 140, 248, 0.95)";
        ripplesLayer.appendChild(ripple2);
        ripple2.addEventListener("animationend", () => {
          ripple2.remove();
        });
      }, 110);
    }
  }

  // State Updates
  function setCursorMode(mode, customBadge = "") {
    currentMode = mode;

    if (thinkingSpinner) {
      if (mode === "thinking") {
        thinkingSpinner.classList.add("active");
      } else {
        thinkingSpinner.classList.remove("active");
      }
    }

    if (typingBeam) {
      if (mode === "typing") {
        typingBeam.classList.add("active");
      } else {
        typingBeam.classList.remove("active");
      }
    }

    if (badgeText) {
      if (customBadge) {
        badgeText.textContent = customBadge;
      } else if (mode === "thinking") {
        badgeText.textContent = "Thinking...";
      } else if (mode === "typing") {
        badgeText.textContent = "Typing...";
      } else {
        badgeText.textContent = "Antigravity";
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
    } else if (state.actionType) {
      if (state.actionType === "click") {
        spawnClickRipple(targetX, targetY, state.dblClick);
      } else if (state.actionType === "type") {
        setCursorMode("typing");
        setTimeout(() => setCursorMode("idle"), 1200);
      } else if (state.actionType === "thinking") {
        setCursorMode("thinking");
      }
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

    if (message?.type === "CURSOR_CLICK") {
      spawnClickRipple(message.x || targetX, message.y || targetY, Boolean(message.dblClick));
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