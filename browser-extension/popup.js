async function refreshStatus() {
  const host = document.getElementById("hostStatus");
  const dot = document.getElementById("statusDot");
  const cdp = document.getElementById("cdpStatus");
  try {
    const state = await chrome.runtime.sendMessage({ type: "GET_BRIDGE_STATUS" });
    if (!state) throw new Error("No status response");
    host.textContent = state.nativeConnected ? "Connected" : "Disconnected";
    dot.style.background = state.nativeConnected ? "#10b981" : "#737373";
    cdp.textContent = `${state.attachedTabCount} attached tab${state.attachedTabCount === 1 ? "" : "s"}`;
  } catch (err) {
    host.textContent = "Unavailable";
    dot.style.background = "#737373";
    cdp.textContent = "Unavailable";
  }
}
refreshStatus();
setInterval(refreshStatus, 1000);
