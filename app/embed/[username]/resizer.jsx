'use client';
import { useEffect } from 'react';

export default function EmbedResizer() {
  useEffect(() => {
    const send = () => {
      try { window.parent.postMessage({ blinkSubHeight: document.documentElement.scrollHeight }, '*'); } catch {}
    };
    send();
    const ro = new ResizeObserver(send); ro.observe(document.body);
    const mo = new MutationObserver(send); mo.observe(document.body, { subtree: true, childList: true, attributes: true });
    window.addEventListener('load', send);
    const t = setInterval(send, 1000); // catch async content (QR, tier changes)
    return () => { ro.disconnect(); mo.disconnect(); clearInterval(t); };
  }, []);
  return null;
}
