'use client';
import { useState, useEffect, useRef } from 'react';

function view(tier, cycle, rate) {
  const amt = tier[cycle] || {};
  const isSats = tier.display === 'sats';
  let sats, cents;
  if (amt.sats != null) { sats = amt.sats; cents = Math.round((amt.sats / rate) * 100); }
  else { cents = amt.usd || 0; sats = Math.round((cents / 100) * rate); }
  const per = (isSats ? 'sats' : '') + (cycle === 'annual' ? '/yr' : '/mo');
  const primary = isSats ? sats.toLocaleString() : `$${(cents / 100).toFixed(0)}`;
  const approx = isSats ? `≈ $${(cents / 100).toFixed(2)}` : `≈ ${sats.toLocaleString()} sats`;
  let savenote = '';
  if (cycle === 'annual') {
    const m = tier.monthly || {};
    const annualP = isSats ? sats : cents;
    const monthP = isSats ? (m.sats ?? Math.round((m.usd / 100) * rate)) : (m.usd ?? Math.round((m.sats / rate) * 100));
    const pct = monthP ? Math.round((1 - annualP / (monthP * 12)) * 100) : 0;
    const perMo = isSats ? `${Math.round(annualP / 12).toLocaleString()} sats/mo` : `$${(annualP / 100 / 12).toFixed(2)}/mo`;
    savenote = pct > 0 ? `${perMo} · ${pct}% off` : perMo;
  }
  return { primary, per, approx, savenote, label: isSats ? `${primary} ${per}` : `${primary}${per}` };
}
function satsOf(tier, cycle, rate) {
  const amt = tier[cycle] || {};
  return amt.sats != null ? amt.sats : Math.round(((amt.usd || 0) / 100) * rate);
}
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return iso; } }
const validEmail = (e) => /.+@.+\..+/.test(e);

export default function SubscribePanel({ creator, rate }) {
  const [cycle, setCycle] = useState('monthly');
  const [sel, setSel] = useState(null);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('pick'); // pick | email | pay | done | joined
  const [pay, setPay] = useState(null);
  const [paidUntil, setPaidUntil] = useState(null);
  const [error, setError] = useState('');
  const poll = useRef(null);
  useEffect(() => () => clearInterval(poll.current), []);

  function reset() { clearInterval(poll.current); setStep('pick'); setSel(null); setPay(null); setPaidUntil(null); setError(''); }

  async function proceed() {
    if (!validEmail(email)) { setError('Enter a valid email.'); return; }
    setError('');
    if (sel.free) {
      await fetch('/api/join-free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creator.blink_username, tier: sel.name, email }) });
      setStep('joined'); return;
    }
    setStep('pay'); setPay(null);
    try {
      const res = await fetch('/api/pay/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: creator.blink_username, payout: creator.payout_username || creator.blink_username, tier: sel.name, sats: satsOf(sel, cycle, rate), cycle, email }) });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Could not create invoice'); return; }
      setPay(data);
      poll.current = setInterval(async () => {
        try {
          const st = await fetch(`/api/pay/status?subId=${data.subId}`).then((r) => r.json());
          if (st.status === 'PAID') { clearInterval(poll.current); setPaidUntil(st.paidUntil); setStep('done'); }
          else if (st.status === 'EXPIRED') { clearInterval(poll.current); setError('The invoice expired. Start again.'); }
        } catch {}
      }, 3000);
    } catch (e) { setError(String(e.message)); }
  }

  if (step === 'joined') {
    return (
      <div className="done">
        <div className="big">✓</div><div className="t">You&apos;re on the list</div>
        <p style={{ color: 'var(--dim)', fontSize: 14, margin: '8px auto 0', maxWidth: '38ch' }}>We&apos;ll send the newsletter to <b>{email}</b>.</p>
        <button className="btn ghost" style={{ maxWidth: 240, margin: '16px auto 0' }} onClick={reset}>Back</button>
      </div>
    );
  }
  if (step === 'done') {
    return (
      <div className="done">
        <div className="big">✓</div><div className="t">You&apos;re subscribed</div>
        <p style={{ color: 'var(--dim)', fontSize: 14, margin: '8px auto 0', maxWidth: '40ch' }}>
          {sel.name} to {creator.brand}, active until <b>{fmtDate(paidUntil)}</b>. The newsletter goes to <b>{email}</b>. We&apos;ll remind you to renew when it lapses.
        </p>
        <button className="btn ghost" style={{ maxWidth: 240, margin: '16px auto 0' }} onClick={reset}>Back to plans</button>
      </div>
    );
  }
  if (step === 'email') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="explain">{sel.free ? `Join ${creator.brand}'s free newsletter.` : `Subscribe to ${sel.name}. Your email is where the newsletter goes.`}</div>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="you@email.com" autoCapitalize="none" spellCheck={false} style={{ fontSize: 16 }} />
        {error && <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 6 }}>{error}</p>}
        <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={!validEmail(email)} onClick={proceed}>
          {sel.free ? 'Join free' : 'Continue to payment'}
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={reset}>← back to plans</button>
      </div>
    );
  }
  if (step === 'pay') {
    const v = view(sel, cycle, rate);
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <div className="explain" style={{ textAlign: 'left' }}>Pay <b>{v.label}</b> to <b>@{creator.blink_username}</b> to start your <b>{sel.name}</b> subscription.</div>
        {error && <p style={{ color: 'var(--error)', fontSize: 13 }}>{error}</p>}
        {!pay && !error && <p style={{ color: 'var(--faint)', fontSize: 13 }}>Creating invoice…</p>}
        {pay && (
          <>
            <img src={pay.qr} alt="Lightning invoice" width={220} height={220} style={{ borderRadius: 12, margin: '4px auto 14px', display: 'block', background: '#fff', padding: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <a className="btn primary" style={{ flex: 1 }} href={`lightning:${pay.paymentRequest}`}>Open in wallet</a>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => navigator.clipboard?.writeText(pay.paymentRequest)}>Copy invoice</button>
            </div>
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 14 }}>Waiting for payment — updates automatically.</p>
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
      <div className="cols3">
        {creator.tiers.map((t) => {
          const v = t.free ? null : view(t, cycle, rate);
          return (
            <div className={`plan${t.recommended ? ' rec' : ''}`} key={t.id}>
              {t.recommended && <span className="badge">Most popular</span>}
              <div className="pn">{t.name}</div>
              <div className="pd">{t.desc}</div>
              {t.free ? (
                <div className="price"><span className="big">Free</span></div>
              ) : (
                <>
                  <div className="price"><span className="big">{v.primary}</span><span className="per">{v.per}</span></div>
                  <div className="approx">{v.approx}</div>
                  <div className="savenote">{v.savenote}</div>
                </>
              )}
              <ul className="feats">{(t.benefits || []).map((b, i) => <li key={i}><span className="ck">✓</span>{b}</li>)}</ul>
              <div className="cta">
                <button className={`btn ${t.free ? 'ghost' : t.recommended ? 'grad' : 'outline'}`} onClick={() => { setSel(t); setEmail(''); setError(''); setStep('email'); }}>
                  {t.free ? 'Join free' : 'Subscribe'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
