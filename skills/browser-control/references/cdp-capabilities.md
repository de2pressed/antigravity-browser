# Chrome DevTools Protocol (CDP) & Low-Level Capabilities

While high-level extension actions (`browser_click`, `browser_type`, `browser_run_actions`) cover 90% of user journeys, certain browser workflows require low-level Chrome DevTools Protocol (CDP) capabilities.

---

## 1. When to Use Low-Level CDP

Use low-level CDP via `browser_evaluate` or Chrome DevTools MCP tools when:
1. **Dialog Handling**: Intercepting `window.alert`, `window.confirm`, or `window.prompt` before they block the browser execution thread.
2. **Download Interception**: Setting download behavior to redirect files into a headless working folder.
3. **Network Emulation**: Throttling network latency, mocking offline state, or overriding headers (e.g. `Authorization` or custom cookies).
4. **Device & Viewport Emulation**: Simulating mobile screen dimensions, pixel ratios, and touch events.

---

## 2. JavaScript Evaluation Patterns (`browser_evaluate`)

The `browser_evaluate` tool executes arbitrary JavaScript inside the page execution context with direct access to `window`, `document`, and web APIs.

### A. Extracting Clean Structured Data
```javascript
() => {
  const rows = Array.from(document.querySelectorAll('table.data-table tbody tr'));
  return rows.map(r => ({
    name: r.querySelector('.col-name')?.innerText.trim(),
    status: r.querySelector('.col-status')?.innerText.trim(),
    value: parseFloat(r.querySelector('.col-val')?.innerText.replace(/[^0-9.]/g, '') || '0')
  }));
}
```

### B. Waiting for Dynamic DOM Predicates
```javascript
(timeoutMs = 5000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector('.async-content-loaded');
      if (el) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Timeout waiting for .async-content-loaded'));
      }
    }, 100);
  });
}
```

### C. Triggering Custom Synthetic Events
```javascript
(selector) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
```

---

## 3. Cookie & Local Storage Auditing

Read or modify browser session state in the active origin:
```javascript
// Inspect session storage keys
() => ({
  cookies: document.cookie,
  localStorage: { ...localStorage },
  sessionStorage: { ...sessionStorage }
})
```
