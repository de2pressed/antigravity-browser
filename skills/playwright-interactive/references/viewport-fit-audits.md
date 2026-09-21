# Viewport Fit & Horizontal Overflow Audits

Unintended horizontal scrolling and layout clipping are among the most common visual bugs on the modern web.

---

## 1. Automated Overflow Detection Script

Run this script via `browser_evaluate` or Playwright to detect which DOM elements cause horizontal overflow beyond `document.documentElement.clientWidth`:

```javascript
() => {
  const docWidth = document.documentElement.clientWidth;
  const elements = document.querySelectorAll('*');
  const overflowing = [];

  for (const el of elements) {
    const box = el.getBoundingClientRect();
    if (box.right > docWidth + 1) { // 1px margin of error
      overflowing.push({
        tag: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className,
        right: Math.round(box.right),
        excessPixels: Math.round(box.right - docWidth),
        htmlPreview: el.outerHTML.slice(0, 100)
      });
    }
  }

  return {
    docWidth,
    hasOverflow: overflowing.length > 0,
    totalOffenders: overflowing.length,
    offenders: overflowing.slice(0, 10)
  };
}
```

---

## 2. Common Causes of Layout Bleed

1. **Fixed Widths on Children**:
   `width: 1200px` inside a responsive flex container. Fix: change to `max-width: 100%` or use `clamp()`.
2. **Negative Margins**:
   CSS frameworks using `-mx-4` without a parent container having matching padding or `overflow: hidden`.
3. **Unbroken Long Strings**:
   URLs, hashes, or code snippets without `word-break: break-word` or `overflow-wrap: anywhere`.
4. **Pre-formatted Code Blocks (`<pre>`)**:
   Code blocks without `overflow-x: auto`.
5. **Absolute Positioned Decorative Orbs**:
   Blur gradients (`filter: blur(80px)`) positioned at `right: -100px` without `overflow: hidden` on the parent `<section>`.

---

## 3. Viewport Breakpoint Testing Matrix

When running automated visual tests, iterate through this standard test matrix:

```javascript
const VIEWPORTS = [
  { name: 'Mobile SE', width: 375, height: 667 },
  { name: 'Mobile Modern', width: 390, height: 844 },
  { name: 'Tablet Portrait', width: 768, height: 1024 },
  { name: 'Laptop', width: 1280, height: 800 },
  { name: 'Desktop Standard', width: 1440, height: 900 },
  { name: 'Wide 4K', width: 1920, height: 1080 }
];
```
For each viewport, verify:
- Navigation switches to mobile hamburger menu below 768px.
- Grid columns collapse from 3 or 4 columns down to 1 column.
- Modals scale within 90% of screen width.
