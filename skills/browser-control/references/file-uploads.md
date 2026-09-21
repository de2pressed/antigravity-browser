# File Uploads & Drag-and-Drop Automation Reference

File uploads in web applications generally fall into two categories:
1. Native `<input type="file">` elements (often hidden behind stylized buttons).
2. Drag-and-Drop Dropzones (canvas or `div` containers listening to `dragover` / `drop` events).

---

## 1. Native `<input type="file">` Upload Pattern

Even when modern UI libraries (AntD, MUI, Tailwind, React Dropzone) disguise the input with styled buttons, a hidden input is almost always present in the DOM tree.

### Step 1: Un-hide the File Input
Many frameworks set `display: none` or `visibility: hidden` on the file input, which prevents automated dispatch:
```javascript
// Via browser_evaluate:
(() => {
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.style.display = 'block';
    fileInput.style.visibility = 'visible';
    fileInput.style.opacity = '1';
    fileInput.style.width = '200px';
    fileInput.style.height = '50px';
    fileInput.style.position = 'fixed';
    fileInput.style.top = '10px';
    fileInput.style.left = '10px';
    fileInput.style.zIndex = '999999';
    return true;
  }
  return false;
})()
```

### Step 2: Inject Files via DataTransfer API
Modern browsers support constructing synthetic `File` objects from Base64 or plain text and dispatching them directly into the input:
```javascript
// browser_evaluate:
((fileName, mimeType, base64Data) => {
  const bstr = atob(base64Data);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  const file = new File([u8arr], fileName, { type: mimeType });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  
  const input = document.querySelector('input[type="file"]');
  if (!input) return false;
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})('dataset.csv', 'text/csv', btoa('col1,col2\nval1,val2\n'))
```

---

## 2. Drag-and-Drop Dropzone Emulation

When an application does not maintain a file input and requires a synthetic drag event on a Dropzone container:
```javascript
((dropzoneSelector, fileName, textContent) => {
  const dropzone = document.querySelector(dropzoneSelector);
  if (!dropzone) return false;

  const file = new File([textContent], fileName, { type: 'text/plain' });
  const dt = new DataTransfer();
  dt.items.add(file);

  dropzone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
  dropzone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  return true;
})('#dropzone-container', 'upload.txt', 'Sample payload content')
```
