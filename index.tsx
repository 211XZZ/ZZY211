
// Silence TF Lite and MediaPipe logs before anything else
(function silenceLogs() {
  const keywords = ["tensorflow", "xnnpack", "delegate", "mediapipe", "tflite", "wasm-check"];
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  const shouldFilter = (args: any[]) => {
    try {
      const combined = args.map(a => String(a)).join(" ").toLowerCase();
      return keywords.some(k => combined.includes(k));
    } catch { return false; }
  };
  console.log = (...args) => { if (!shouldFilter(args)) originals.log.apply(console, args); };
  console.info = (...args) => { if (!shouldFilter(args)) originals.info.apply(console, args); };
  console.warn = (...args) => { if (!shouldFilter(args)) originals.warn.apply(console, args); };
  console.error = (...args) => { if (!shouldFilter(args)) originals.error.apply(console, args); };
})();

// Initialize Tailwind config programmatically to avoid inline script CSP errors
if ((window as any).tailwind) {
  (window as any).tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'sans-serif'],
          ethereal: ['Cinzel', 'serif'],
        },
        colors: {
          gold: '#D4AF37',
          deepspace: '#000008',
        },
      }
    }
  };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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
