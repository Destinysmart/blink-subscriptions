'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

async function safeJson(res) {
  try { const t = await res.text(); return t ? JSON.parse(t) : { error: 'Empty response from server (' + res.status + ')' }; }
  catch { return { error: 'Server error (' + res.status + ')' }; }
}

function AdvancedInner() {
  const params = useSearchParams();
  const [username, setUsername] = useState(params.get('u') || '');
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  const [step, setStep] = useState('start'); // start | pay | panel
  const [token, setToken] = useState('');
  const [conn, setConn] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [inv, setInv] = useState(null);
  const [msg, setMsg] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const poll = useRef(null);

  useEffect(() => {
    if (!clean) return;
    const t = localStorage.getItem('blinkManage:' + clean);
    if (t) loadPanel(clean, t);
    // eslint-disable-next-line
  }, []);
  useEffect(() => () => clearInterval(poll.current), []);

  async function loadPanel(u, t) {
    const c = await fetch(`/api/advanced/connector?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`).then(safeJson);
    if (c && !c.error && c.plan && c.plan.paid) { setToken(t); setConn(c); setWebhookUrl(c.webhookUrl || ''); setStep('panel'); }
  }

  async function startVerify() {
    if (!clean) return;
    setMsg(''); setInv(null); setStep('pay');
    const r = await fetch('/api/advanced/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean }) }).then(safeJson);
    if (r.error) { setMsg(r.error); return; }
    setInv(r);
    poll.current = setInterval(async () => {
      const v = await fetch(`/api/advanced/verify?c=${encodeURIComponent(r.claimId)}`).then(safeJson);
      if (v.verified && v.manageToken) {
        clearInterval(poll.current);
        localStorage.setItem('blinkManage:' + clean, v.manageToken);
        setToken(v.manageToken); setConn({ verified: true, secret: v.secret, webhookUrl: '', plan: { paid: true, until: v.until } }); setWebhookUrl(''); setStep('panel');
      } else if (v.verified === false && v.error) { clearInterval(poll.current); setMsg(v.error); }
    }, 3000);
  }

  async function saveWebhook() {
    setMsg('saving');
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token, webhookUrl }) }).then(safeJson);
    setMsg(r.ok ? 'saved' : 'error'); setTimeout(() => setMsg(''), 2200);
  }
  async function rotate() {
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token, rotate: true }) }).then(safeJson);
    if (r.secret) setConn((c) => ({ ...c, secret: r.secret }));
  }
  async function test() {
    const r = await fetch('/api/advanced/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token }) }).then(safeJson);
    setMsg(r.ok ? 'test sent' : 'set a webhook URL first'); setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="nav">
        <a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a>
        <a className="navlink" href="/advanced/learn">Learn more</a>
      </div>

      <div className="eyebrow">Advanced · paid</div>
      <h1 className="h-page" style={{ marginBottom: 8 }}>Connect your backend</h1>
      <p style={{ color: 'var(--dim)', fontSize: 15, marginTop: 0, maxWidth: '62ch' }}>
        Signed webhooks so your own site — custom, WordPress, an AI-built site, any builder — is told when someone pays or is about to expire. Your backend writes to your own database and sends your own emails. We store no keys to your systems.
      </p>

      {step === 'start' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="ph"><h2>Unlock the connector</h2><span className="tag">one-time unlock</span></div>
          <div className="pb">
            <label>Your Blink username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" autoCapitalize="none" spellCheck={false} style={{ maxWidth: 360 }} />
            <p style={{ color: 'var(--faint)', fontSize: 13 }}>
              You&apos;ll pay a one-time fee <b>from this account</b>. Paying from it proves it&apos;s yours (only the owner can send from it) and unlocks the connector for good. The subscribe box and embed stay free.
            </p>
            {msg && <p style={{ color: 'var(--error)', fontSize: 13 }}>{msg}</p>}
            <button className="btn grad" onClick={startVerify} disabled={!clean}>Continue to payment</button>
          </div>
        </div>
      )}

      {step === 'pay' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="ph"><h2>Pay from @{clean}</h2><span className="tag">{inv ? inv.expectedSats.toLocaleString() : '…'} sats</span></div>
          <div className="pb" style={{ textAlign: 'center' }}>
            {msg && <p style={{ color: 'var(--error)', fontSize: 13 }}>{msg}</p>}
            {!inv && !msg && <p style={{ color: 'var(--faint)' }}>Creating invoice…</p>}
            {inv && (
              <>
                <p style={{ color: 'var(--dim)', fontSize: 14 }}>Pay <b>{inv.expectedSats.toLocaleString()} sats</b> (one-time) from your <b>@{clean}</b> Blink account.</p>
                <img src={inv.qr} alt="Pay" width={200} height={200} style={{ borderRadius: 12, margin: '4px auto 12px', display: 'block', background: '#fff', padding: 8 }} />
                <div style={{ display: 'flex', gap: 8, maxWidth: 360, margin: '0 auto' }}>
                  <a className="btn primary" style={{ flex: 1 }} href={`lightning:${inv.paymentRequest}`}>Open in wallet</a>
                  <button className="btn ghost" style={{ flex: 1 }} onClick={() => navigator.clipboard.writeText(inv.paymentRequest)}>Copy</button>
                </div>
                <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 12 }}>Pay from @{clean} specifically — that&apos;s how we confirm it&apos;s yours. Unlocks automatically.</p>
              </>
            )}
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => { clearInterval(poll.current); setStep('start'); }}>← back</button>
          </div>
        </div>
      )}

      {step === 'panel' && conn && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="ph"><h2>Webhook for @{clean}</h2><span className="tag" style={{ color: 'var(--green)' }}>active</span></div>
          <div className="pb">
            <label>Your webhook URL</label>
            <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://bitcoinafricastory.com/api/blink-webhook" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
              <button className="btn primary sm" onClick={saveWebhook}>{msg === 'saving' ? 'Saving…' : 'Save webhook'}</button>
              <button className="btn ghost sm" onClick={test}>Send test event</button>
              {msg && msg !== 'saving' && <span style={{ fontSize: 13, color: msg === 'saved' || msg === 'test sent' ? 'var(--green)' : 'var(--error)' }}>{msg}</span>}
            </div>
            <label style={{ marginTop: 18 }}>Signing secret</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={showSecret ? conn.secret : '\u2022'.repeat(24)} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
              <button className="btn ghost sm" style={{ flex: 'none' }} onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Reveal'}</button>
              <button className="btn ghost sm" style={{ flex: 'none' }} onClick={() => navigator.clipboard.writeText(conn.secret)}>Copy</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn ghost sm" onClick={rotate}>Rotate secret</button>
              <a className="btn ghost sm" href="/advanced/learn">How to verify &amp; handle events →</a>
            </div>
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 16, marginBottom: 0 }}>
              Events: <code style={{ fontFamily: 'var(--mono)' }}>subscription.paid</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.renewed</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.expiring</code> — signed with <code style={{ fontFamily: 'var(--mono)' }}>Blink-Signature</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Advanced() {
  return <Suspense fallback={<div className="wrap">Loading…</div>}><AdvancedInner /></Suspense>;
}
