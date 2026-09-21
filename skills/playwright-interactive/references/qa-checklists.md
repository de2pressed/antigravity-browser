# 30-Point End-to-End QA Checklist

Run this comprehensive checklist across any web application before certifying it as production-ready.

---

## 1. Functional Integrity (1-10)
- [ ] **1. Form Validation**: Submitting empty forms triggers user-friendly inline error messages.
- [ ] **2. Boundary Values**: Inputs accept min, max, and edge strings (unicode, emojis, long text).
- [ ] **3. Email/Phone Formatting**: Validates standard formats and rejects invalid domains.
- [ ] **4. Button Double-Click**: Repeated clicks on submit buttons do not create duplicate records; button disables with loading spinner.
- [ ] **5. Deep Linking**: Pasting direct URLs to sub-pages, modals, or filtered views loads the expected state.
- [ ] **6. Back/Forward Navigation**: Browser back and forward buttons preserve filter states and navigation stack.
- [ ] **7. Tab State Retention**: Opening items in a new tab (`Ctrl+Click`) retains user context and authentication.
- [ ] **8. Toast / Feedback**: Async mutations (save, delete, update) display temporary confirmation toasts.
- [ ] **9. Destructive Action Safeguards**: Deletions prompt for confirmation or require explicit modal consent.
- [ ] **10. Empty States**: Tables, feeds, and lists display clean empty illustrations or messages when no data exists.

---

## 2. Visual & Responsive Design (11-20)
- [ ] **11. Horizontal Overflow**: Viewports have zero accidental horizontal scrolling (`overflow-x: hidden`).
- [ ] **12. Typography Hierarchy**: Distinct sizing between `h1`, `h2`, `h3`, body, and caption text.
- [ ] **13. Image Aspect Ratios**: Images load with defined aspect ratios and do not cause layout shifts (CLS).
- [ ] **14. Sticky Header Behavior**: Sticky navbars do not obscure content anchor points or headings.
- [ ] **15. Modal Viewport Fit**: Modals on mobile screens scroll vertically without getting clipped at bottom.
- [ ] **16. Contrast Ratios**: Text meets WCAG AA contrast (4.5:1 for normal text, 3:1 for large text).
- [ ] **17. Dark/Light Theme Switching**: All text remains legible when toggling themes; zero white-on-white text.
- [ ] **18. Touch Targets**: Mobile buttons and links measure at least 44 × 44 pixels.
- [ ] **19. Truncation & Ellipsis**: Long usernames or titles use clean text clipping with tooltips.
- [ ] **20. Favicon & Metadata**: Proper favicon, page `<title>`, and OpenGraph meta tags are present.

---

## 3. Performance & Resilience (21-30)
- [ ] **21. Zero Uncaught Exceptions**: DevTools console has 0 uncaught errors or React hydration warnings.
- [ ] **22. HTTP Error Handling**: Failed API calls (500, 502, 504) render recovery UI ("Retry" button).
- [ ] **23. Network Offline Mode**: Gracefully alerts user when connection drops (`navigator.onLine === false`).
- [ ] **24. Asset 404s**: Zero broken fonts, SVGs, or bundle chunks.
- [ ] **25. Memory Footprint**: Closing modals and unmounting components tears down event listeners and intervals.
- [ ] **26. Skeleton Loaders**: Content surfaces show pulse skeletons rather than jarring blank voids during fetch.
- [ ] **27. Keyboard Accessibility**: All interactive controls can be reached and activated using only `Tab` and `Enter/Space`.
- [ ] **28. Focus Rings**: Visible keyboard focus indicators are present for accessibility navigation.
- [ ] **29. Screen Reader Labels**: Icon-only buttons have descriptive `aria-label` tags.
- [ ] **30. Print Stylesheet**: Printing the page (`Ctrl+P`) renders clean text without dark background blocks or clipped tables.
