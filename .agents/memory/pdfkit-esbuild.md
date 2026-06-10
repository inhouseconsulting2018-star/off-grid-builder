---
name: PDFKit in esbuild ESM bundle
description: How to use pdfkit correctly in the api-server esbuild+ESM setup, including externals, require interop, and async stream handling.
---

# PDFKit in esbuild ESM bundle

## The rule
PDFKit (and its fontkit/brotli/@swc sub-deps) must be listed as **external** in `build.mjs` — do not let esbuild bundle it. Use the `"end"` event (not `"finish"`) to know when the PDF stream is done.

## Why
- fontkit (pdfkit dep) requires `@swc/helpers` at runtime; when bundled by esbuild, the module resolution path breaks and throws `Cannot find module '@swc/helpers/cjs/_define_property.cjs'`.
- In ESM+esbuild context `require('pdfkit')` may return a module wrapper; the constructor lives at `.default` in some environments.
- PDFDocument is a **Readable** stream. Readables emit `end` when done, not `finish` (that's for Writables). Waiting on `finish` hangs forever.

## How to apply
1. `build.mjs` externals array: add `"pdfkit"`.
2. Require interop: `const PDFDocument = (_pdfMod.default ?? _pdfMod) as any;`
3. Async pattern:
```ts
const chunks: Buffer[] = [];
const doc = new PDFDocument({ bufferPages: true });
doc.on("data", c => chunks.push(c));
const pdfReady = new Promise<Buffer>((resolve, reject) => {
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);
});
// ... draw document ...
doc.end();
return pdfReady;
```
4. The route handler must `await` the returned Promise.
