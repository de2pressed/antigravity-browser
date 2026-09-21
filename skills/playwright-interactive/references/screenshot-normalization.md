# Screenshot Normalization & Visual Diffing

Raw screenshots often introduce false positives in visual regression testing due to font rendering differences, CSS animations, blinking carats, and variable timestamps.

---

## 1. The Normalization Protocol

Before capturing a screenshot for visual comparison:

### Step 1: Wait for Fonts and Web Assets
```javascript
// Ensure custom web fonts have finished loading
await document.fonts.ready;
```

### Step 2: Disable CSS Animations and Transitions
Inject a temporary stylesheet to freeze all animations, pulse loaders, and transitions:
```javascript
() => {
  const style = document.createElement('style');
  style.id = '__antigravity_freeze_styles';
  style.textContent = `
    *, *::before, *::after {
      -webkit-transition: none !important;
      -moz-transition: none !important;
      -o-transition: none !important;
      -ms-transition: none !important;
      transition: none !important;
      -webkit-animation: none !important;
      -moz-animation: none !important;
      -o-animation: none !important;
      -ms-animation: none !important;
      animation: none !important;
      caret-color: transparent !important;
    }
  `;
  document.head.appendChild(style);
}
```

### Step 3: Normalize Dynamic Timestamps & Random Identifiers
If the page displays "Last updated: 2 minutes ago" or random session IDs, mask or freeze them:
```javascript
() => {
  document.querySelectorAll('.dynamic-timestamp, [data-testid="time"]').forEach(el => {
    el.textContent = '2026-01-01 00:00:00';
  });
}
```

---

## 2. High-DPI Screenshot Capture

Standard screenshots taken at 1x resolution often look blurry on Retina/High-DPI displays.
- Always set `deviceScaleFactor: 2` in viewport options when generating marketing mockups or design reviews.
- When stitching full-page screenshots, scroll the viewport down incrementally to allow lazy-loaded images to load before taking the capture.
