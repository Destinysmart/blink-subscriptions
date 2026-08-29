'use client';
import { useState } from 'react';

export default function SubscribePanel({ creator }) {
  const [sel, setSel] = useState(null);
  const [step, setStep] = useState('pick'); // pick | connect | done
  const [kind, setKind] = useState(null);

  const label = (p) =>
    p.usd != null
      ? { main: `$${(p.usd / 100).toFixed(0)}`, sub: 'USD / MO' }
      : { main: p.sats.toLocaleString(), sub: 'SATS / MO' };

  if (step === 'done') {
    return (
      <div className="done">
        <div className="big">✓</div>
        <div className="t">You&apos;re subscribed</div>
        <p className="pitch" style={{ margin: '8px auto 0', maxWidth: '32ch' }}>
          {sel.name} to {creator.brand} via {kind}. We&apos;ll pull the next payment automatically within your cap, or nudge you if you chose reminders.
        </p>
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => { setStep('pick'); setSel(null); setKind(null); }}>
          Back to start
        </button>
      </div>
    );
  }

  if (step === 'connect') {
    return (
      <div>
        <div className="explain">
          Authorize <b>{creator.brand}</b> to receive {label(sel).main} {sel.usd != null ? 'per month' : 'sats per month'}. Choose how much control you keep:
        </div>
        {[
          ['nwc', 'Connect with Nostr Wallet Connect', 'Auto-renews within a budget you set. Cancel by revoking the connection.'],
          ['intraledger', 'Authorize a capped Blink key', 'Blink to Blink, instant and free. Capped at your monthly limit.'],
          ['reminder', 'Just remind me each month', 'No standing authorization. You approve every renewal by hand.'],
        ].map(([k, t, d]) => (
          <button key={k} className="tier" style={{ marginBottom: 10 }} onClick={() => { setKind(k); setStep('done'); }}>
            <div><div className="tn">{t}</div><div className="td">{d}</div></div>
          </button>
        ))}
        <button className="btn ghost" onClick={() => setStep('pick')}>← back</button>
      </div>
    );
  }

  return (
    <div>
      <div className="tiers">
        {creator.prices.map((p) => {
          const l = label(p);
          return (
            <button key={p.id} className={`tier${sel?.id === p.id ? ' sel' : ''}`} onClick={() => setSel(p)}>
              <div><div className="tn">{p.name}</div><div className="td">{p.desc}</div></div>
              <div className="amt">{l.main}<small>{l.sub}</small></div>
            </button>
          );
        })}
      </div>
      <button className="btn primary" style={{ marginTop: 16 }} disabled={!sel} onClick={() => setStep('connect')}>
        {sel ? `Subscribe · ${label(sel).main} ${sel.usd != null ? '/mo' : 'sats/mo'}` : 'Choose a tier'}
      </button>
    </div>
  );
}
