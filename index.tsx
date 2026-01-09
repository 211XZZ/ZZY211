
/**
 * 兼容性与性能优化
 * 1. 拦截并过滤 TF/MediaPipe 的系统级日志，减少 Console 噪音
 * 2. 移除 importmap，改用直接路径引用以规避 CSP inline-script 错误
 * 3. 针对中国区部署优化资源加载链
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

// 配置 Tailwind (程序化注入以规避 inline 限制)
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
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
