'use client';
import { useEffect, useRef, useState } from 'react';

const SCRIPT = 'https://blinkbitcoin.github.io/donation-button.blink.sv/js/blink-pay-button.js';

function loadScript() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.BlinkPayButton) return resolve();
    const existing = document.querySelector(`script[data-blinkpay]`);
    if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('load failed'))); return; }
    const el = document.createElement('script');
    el.src = SCRIPT; el.async = true; el.dataset.blinkpay = '1';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not reach Blink to load the payment widget'));
    document.head.appendChild(el);
  });
}

// The real Blink donate button. Subscriber pays the creator's Lightning address;
// Blink's widget verifies settlement keylessly and fires onSuccess. We never hold a key.
export default function PayStep({ username, amountSats, theme, onPaid }) {
  const fired = useRef(false);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled) return;
        setStatus('ready');
        window.BlinkPayButton.init({
          username,
          containerId: 'blink-pay-mount',
          buttonText: `Pay ${amountSats.toLocaleString()} sats`,
          defaultAmount: amountSats,
          themeMode: theme === 'light' ? 'light' : 'dark',
          onSuccess: (payload) => {
            if (fired.current) return;
            fired.current = true;
            onPaid(payload);
          },
        });
      })
      .catch((e) => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [username, amountSats, theme, onPaid]);

  return (
    <div>
      <div className="paynote">
        Pay the first month to <b>@{username}</b> with any Lightning wallet. Nothing is stored, nothing can charge you again. When it lands, your subscription starts.
      </div>
      {status === 'loading' && <div className="paynote muted">Loading secure payment…</div>}
      {status === 'error' && <div className="paynote err">Couldn’t load the payment widget — check your internet connection and try again.</div>}
      <div id="blink-pay-mount" style={{ minHeight: 90 }} />
    </div>
  );
}
