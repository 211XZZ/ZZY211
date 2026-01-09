/**
 * 仙女座神启 - 核心初始化
 * 1. 拦截并过滤 TF/MediaPipe 的系统级日志
 * 2. 采用全路径 ESM 导入，彻底规避内联脚本 CSP 报错
 * 3. 在外部 JS 文件中安全配置 Tailwind
 */

(function silencePerformanceLogs() {
  const keywords = ["tensorflow", "xnnpack", "delegate", "mediapipe", "tflite", "wasm-check", "created tensorflow"];
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  const filter = (args: any[], originalFn: Function) => {
    try {
      const msg = args.map(a => String(a)).join(" ").toLowerCase();
      if (keywords.some(k => msg.includes(k))) return;
      originalFn.apply(console, args);
    } catch {
      originalFn.apply(console, args);
    }
  };
  console.log = (...args) => filter(args, originals.log);
  console.info = (...args) => filter(args, originals.info);
  console.warn = (...args) => filter(args, originals.warn);
  console.error = (...args) => filter(args, originals.error);
})();

// 在外部文件中配置 Tailwind
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

import React from 'https://esm.sh/react@19.2.3';
import ReactDOM from 'https://esm.sh/react-dom@19.2.3/client';
import App from './App';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}