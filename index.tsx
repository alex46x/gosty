import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ── Extension-Script Isolation ────────────────────────────────────────────────
// Browser extensions (AI assistants, DevTools polyfills, etc.) can inject
// scripts (content.js, polyfill.js) that try to access React internals that
// don't exist in the ESM build (e.g., `useCache`, `unstable_*` APIs).
// These errors cause unhandled promise rejections that can interfere with
// React's render cycle. We intercept and filter them here to prevent the
// extension from silently crashing/hanging the app.
window.addEventListener('unhandledrejection', (event) => {
  const msg = event?.reason?.message || '';
  const stack = event?.reason?.stack || '';
  // These patterns identify errors from injected extension scripts
  const isExtensionError =
    stack.includes('content.js') ||
    stack.includes('polyfill.js') ||
    stack.includes('chrome-extension://') ||
    msg.includes('useCache') ||
    msg.includes('Could not establish connection') ||
    msg.includes('Receiving end does not exist');

  if (isExtensionError) {
    console.debug('[GhostProtocol] Suppressed external script error:', msg);
    event.preventDefault(); // Prevent it from crashing the app
  }
});

// Suppress synchronous extension errors that bubble up to window
window.addEventListener('error', (event) => {
  const src = (event?.filename || '');
  if (src.includes('content.js') || src.includes('polyfill.js') || src.includes('chrome-extension://')) {
    console.debug('[GhostProtocol] Suppressed extension script error:', event.message);
    event.preventDefault();
  }
});
// ─────────────────────────────────────────────────────────────────────────────

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);