// Dedicated CSS entry for xterm.js.
//
// We import xterm.css here rather than in studio.ts so that esbuild emits it
// as its own output file (frontend/xterm.css) instead of overwriting the
// hand-written frontend/studio.css. index.html links /xterm.css directly.
//
// This removes the CDN dependency entirely — xterm (JS in studio.js, CSS here)
// is fully bundled and works without an internet connection.
import '@xterm/xterm/css/xterm.css';
