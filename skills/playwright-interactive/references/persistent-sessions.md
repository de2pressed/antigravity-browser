# Persistent Sessions & State Management

In real-world browser automation, repeatedly asking users to solve 2FA, SMS codes, or Google Sign-In prompts breaks automation workflows. Persisting session state is mandatory.

---

## 1. Storage State Export & Hydration (Playwright)

Playwright provides native storage state serialization:

### Exporting Authenticated Session
Once an authenticated session exists:
```javascript
// Save storage state to a JSON file
await context.storageState({ path: '/home/jayant/.gemini/antigravity/scratch/auth-state.json' });
```

The output file contains:
- All domain cookies (including `HttpOnly` session tokens, expiration timestamps, sameSite flags).
- All `localStorage` key-value pairs for each origin.

### Re-hydrating Session on Cold Start
```javascript
const context = await browser.newContext({
  storageState: '/home/jayant/.gemini/antigravity/scratch/auth-state.json',
  viewport: { width: 1440, height: 900 }
});
const page = await context.newPage();
// Already authenticated!
await page.goto('https://internal.company.com/dashboard');
```

---

## 2. Connecting to Running Chrome via CDP

Instead of spinning up isolated test browsers, Playwright can attach directly to the user's running Chrome instance via Chrome DevTools Protocol port (e.g. `--remote-debugging-port=9222`):

```javascript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const defaultContext = browser.contexts()[0];
const pages = defaultContext.pages();
console.log(`Connected to ${pages.length} active tabs in user Chrome.`);
```

---

## 3. Session Expiration & Refresh Safeguards

Always check session validity before executing critical paths:
```javascript
await page.goto('https://app.service.com/home');
if (page.url().includes('/login') || page.url().includes('/auth')) {
  throw new Error('SESSION_EXPIRED: Stored credentials have expired. User interaction required.');
}
```
