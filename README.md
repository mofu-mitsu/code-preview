# Code Preview

A browser-based playground for quickly previewing code without setting up a local server.

## Supported

- HTML
- CSS
- JavaScript
- JSX / React
- TSX / React

## Architecture

```
Monaco Editor
     ↓
Browser transform (Babel)
     ↓
Sandboxed iframe
     ↓
Preview
```

TSX is transpiled in the browser with Babel's TypeScript + React presets. This MVP is intentionally a single-file playground; imports and multi-file projects can be added later.

## Roadmap

- Console output forwarding
- Multi-file project mode
- npm package imports
- Vue / Svelte
- PHP / Python / Ruby server-runtime previews
- Shareable snippets
