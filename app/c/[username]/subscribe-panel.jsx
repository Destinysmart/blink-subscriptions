'use client';
import { useState, useEffect, useRef } from 'react';

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
  return amt.sats != null ? amt.sats : Math.round((amt.usd / 100) * rate);
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso; }
}

export default function SubscribePanel({ creator, rate }) {
  const [cycle, setCycle] = useState('monthly');
  const [sel, setSel] = useState(null);
  const [contact, setContact] = useState('');
  const [step, setStep] = useState('pick');       // pick | pay | done
  const [pay, setPay] = useState(null);           // { subId, paymentRequest, qr }
  const [paidUntil, setPaidUntil] = useState(null);
  const [error, setError] = useState('');
  const poll = useRef(null);

  useEffect(() => () => clearInterval(poll.current), []);

  async function startPay(tier) {
    setSel(tier); setError(''); setPay(null); setStep('pay');
    try {
      const res = await fetch('/api/pay/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: creator.blink_username, tier: tier.name, sats: satsOf(tier, cycle, rate), cycle, contact }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Could not create invoice'); return; }
      setPay(data);
      poll.current = setInterval(async () => {
        try {
          const s = await fetch(`/api/pay/status?subId=${data.subId}`).then((r) => r.json());
          if (s.status === 'PAID') { clearInterval(poll.current); setPaidUntil(s.paidUntil); setStep('done'); }
          else if (s.status === 'EXPIRED') { clearInterval(poll.current); setError('The invoice expired. Start again.'); }
        } catch {}
      }, 3000);
    } catch (e) { setError(String(e.message)); }
  }

  function reset() { clearInterval(poll.current); setStep('pick'); setSel(null); setPay(null); setPaidUntil(null); setError(''); }

  if (step === 'done') {
    return (
      <div className="done">
        <div className="big">✓</div>
        <div className="t">You&apos;re subscribed</div>
        <p style={{ color: 'var(--dim)', fontSize: 14, margin: '8px auto 0', maxWidth: '40ch' }}>
          {sel.name} to {creator.brand}. Access is active until <b>{fmtDate(paidUntil)}</b>. When it lapses we&apos;ll remind you to renew — you pay again to extend. Nothing auto-charges; you approve every payment.
        </p>
        <button className="btn ghost" style={{ maxWidth: 240, margin: '16px auto 0' }} onClick={reset}>Back to plans</button>
      </div>
    );
  }

  if (step === 'pay') {
    const v = sel ? view(sel, cycle, rate) : null;
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <div className="explain" style={{ textAlign: 'left' }}>
          Pay <b>{v.label}</b> to <b>@{creator.blink_username}</b> to start your <b>{sel.name}</b> subscription. Scan with any Lightning wallet, or open in Blink.
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        {!pay && !error && <p style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 13 }}>Creating invoice…</p>}
        {pay && (
          <>
            <img src={pay.qr} alt="Lightning invoice QR" width={220} height={220}
                 style={{ borderRadius: 12, margin: '4px auto 14px', display: 'block', background: '#fff', padding: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <a className="btn primary" style={{ flex: 1 }} href={`lightning:${pay.paymentRequest}`}>Open in wallet</a>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => navigator.clipboard?.writeText(pay.paymentRequest)}>Copy invoice</button>
            </div>
            <p style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 12, marginTop: 14 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', marginRight: 7 }} />
              waiting for payment — updates automatically
            </p>
          </>
        )}
        <button className="btn ghost" style={{ marginTop: 6 }} onClick={reset}>← back to plans</button>
      </div>
    );
  }

  return (
    <>
      <div className="toggle-wrap">
        <div className="seg">
          <button className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Annual <span className="save">2 months free</span></button>
        </div>
      </div>

      <div style={{ maxWidth: 460, margin: '0 auto 20px' }}>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email or nostr for renewal reminders (optional)"
          style={{ width: '100%', background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10,
                   color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 13, padding: '11px 13px', outline: 'none' }}
        />
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
              <ul className="feats">{t.benefits.map((b, i) => <li key={i}><span className="ck">✓</span>{b}</li>)}</ul>
              <div className="cta">
                <button className={`btn ${t.recommended ? 'primary' : 'outline'}`} onClick={() => startPay(t)}>Subscribe</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
