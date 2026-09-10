'use client';
import { useEffect } from 'react';

export default function EmbedResizer() {
  useEffect(() => {
    // Measure the real content box, not documentElement.scrollHeight. The shared
    // stylesheet sets body{min-height:100vh}, which would otherwise report a full
    // viewport and leave a screen of empty space below the last tier.
    const root = document.getElementById('blink-embed-root') || document.body;
    const send = () => {
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h > 0) { try { window.parent.postMessage({ blinkSubHeight: h }, '*'); } catch {} }
    };
    send();
    const ro = new ResizeObserver(send); ro.observe(root);
    const mo = new MutationObserver(send); mo.observe(root, { subtree: true, childList: true, attributes: true });
    window.addEventListener('load', send);
    const t = setInterval(send, 1000); // catch async content (QR, tier changes)
    return () => { ro.disconnect(); mo.disconnect(); clearInterval(t); window.removeEventListener('load', send); };
  }, []);
  return null;
}
