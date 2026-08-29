'use client';
import { useState } from 'react';

// build the display for a tier at a given cycle, honoring the creator's chosen denomination
function view(tier, cycle, rate) {
  const amt = tier[cycle];
  const isSats = tier.display === 'sats';
  let sats, cents;
  if (amt.sats != null) { sats = amt.sats; cents = Math.round((amt.sats / rate) * 100); }
  else { cents = amt.usd; sats = Math.round((amt.usd / 100) * rate); }

  const per = (isSats ? 'sats' : '') + (cycle === 'annual' ? '/yr' : '/mo');
  const primary = isSats ? sats.toLocaleString() : `$${(cents / 100).toFixed(0)}`;
  const approx = isSats ? `≈ $${(cents / 100).toFixed(2)}` : `≈ ${sats.toLocaleString()} sats`;

  let savenote = '';
  if (cycle === 'annual') {
    const m = tier.monthly;
    const annualP = isSats ? sats : cents;
    const monthP = isSats ? (m.sats ?? Math.round((m.usd / 100) * rate)) : (m.usd ?? Math.round((m.sats / rate) * 100));
    const pct = Math.round((1 - annualP / (monthP * 12)) * 100);
    const perMo = isSats ? `${Math.round(annualP / 12).toLocaleString()} sats/mo` : `$${(annualP / 100 / 12).toFixed(2)}/mo`;
    savenote = pct > 0 ? `${perMo} · ${pct}% off` : perMo;
  }
  return { primary, per, approx, savenote, label: isSats ? `${primary} ${per}` : `${primary}${per}` };
}

function satsOf(tier, cycle, rate) {
  const amt = tier[cycle];
  if (amt.sats != null) return amt.sats;
  return Math.round((amt.usd / 100) * rate);
}

const CONNECT_OPTIONS = [
  ['nwc', 'Connect with Nostr Wallet Connect', 'Auto-renews within a budget you set. Cancel by revoking the connection.'],
  ['intraledger', 'Authorize a capped Blink key', 'Blink to Blink, instant and free. Capped at your monthly limit.'],
  ['reminder', 'Just remind me each cycle', 'No standing authorization. You approve every renewal by hand.'],
];

export default function SubscribePanel({ creator, rate }) {
  const [cycle, setCycle] = useState('monthly');
  const [sel, setSel] = useState(null);
  const [step, setStep] = useState('pick');
  const [kind, setKind] = useState(null);

  async function confirm(k) {
    setKind(k);
    try {
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: creator.blink_username,
          tier: sel.name,
          sats: satsOf(sel, cycle, rate),
          cycle,
          kind: k,
        }),
      });
    } catch {}
    setStep('done');
  }

  if (step === 'done') {
    const v = view(sel, cycle, rate);
    return (
      <div className="done">
        <div className="big">✓</div>
        <div className="t">You&apos;re subscribed</div>
        <p style={{ color: 'var(--dim)', fontSize: 14, margin: '8px auto 0', maxWidth: '38ch' }}>
          {sel.name} · {v.label} to {creator.brand}, via {kind}. We&apos;ll pull the next payment automatically within your cap, or nudge you if you chose reminders.
        </p>
        <button className="btn ghost" style={{ maxWidth: 240, margin: '16px auto 0' }} onClick={() => { setStep('pick'); setSel(null); setKind(null); }}>
          Back to plans
        </button>
      </div>
    );
  }

  if (step === 'connect') {
    const v = view(sel, cycle, rate);
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="explain">
          Authorize <b>{creator.brand}</b> to receive <b>{v.label}</b>. Choose how much control you keep:
        </div>
        {CONNECT_OPTIONS.map(([k, t, d]) => (
          <button key={k} className="tier" style={{ marginBottom: 10, width: '100%' }} onClick={() => confirm(k)}>
            <div><div className="tn">{t}</div><div className="td">{d}</div></div>
          </button>
        ))}
        <button className="btn ghost" onClick={() => setStep('pick')}>← back to plans</button>
      </div>
    );
  }

  return (
    <>
      <div className="toggle-wrap">
        <div className="seg">
          <button className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>
            Annual <span className="save">2 months free</span>
          </button>
        </div>
      </div>

      <div className="cols3">
        {creator.tiers.map((t) => {
          const v = view(t, cycle, rate);
          return (
            <div className={`plan${t.recommended ? ' rec' : ''}`} key={t.id}>
              {t.recommended && <span className="badge">Most popular</span>}
              <div className="pn">{t.name}</div>
              <div className="pd">{t.desc}</div>
              <div className="price"><span className="big">{v.primary}</span><span className="per">{v.per}</span></div>
              <div className="approx">{v.approx}</div>
              <div className="savenote">{v.savenote}</div>
              <ul className="feats">
                {t.benefits.map((b, i) => <li key={i}><span className="ck">✓</span>{b}</li>)}
              </ul>
              <div className="cta">
                <button className={`btn ${t.recommended ? 'primary' : 'outline'}`} onClick={() => { setSel(t); setStep('connect'); }}>
                  Subscribe
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
