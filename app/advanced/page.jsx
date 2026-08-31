'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AdvancedInner() {
  const params = useSearchParams();
  const [username, setUsername] = useState(params.get('u') || '');
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  const [step, setStep] = useState('start'); // start | verify | panel
  const [claim, setClaim] = useState(null);
  const [conn, setConn] = useState(null);     // { verified, webhookUrl, secret }
  const [token, setToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const poll = useRef(null);

  // restore a saved session for this username
  useEffect(() => {
    if (!clean) return;
    const t = localStorage.getItem('blinkManage:' + clean);
    if (t) loadPanel(clean, t);
    // eslint-disable-next-line
  }, []);
  useEffect(() => () => clearInterval(poll.current), []);

  async function loadPanel(u, t) {
    const c = await fetch(`/api/advanced/connector?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`).then((r) => r.json());
    if (c && !c.error) { setToken(t); setConn(c); setWebhookUrl(c.webhookUrl || ''); setStep('panel'); }
  }

  async function startClaim() {
    if (!clean) return;
    setMsg(''); setStep('verify'); setClaim(null);
    const r = await fetch('/api/advanced/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean }) }).then((x) => x.json());
    if (!r.ok) { setMsg(r.error || 'Could not create invoice'); return; }
    setClaim(r);
    poll.current = setInterval(async () => {
      const v = await fetch(`/api/advanced/verify?u=${encodeURIComponent(clean)}`).then((x) => x.json());
      if (v.verified) {
        clearInterval(poll.current);
        localStorage.setItem('blinkManage:' + clean, v.manageToken);
        setToken(v.manageToken); setConn({ verified: true, webhookUrl: v.webhookUrl, secret: v.secret }); setWebhookUrl(v.webhookUrl || ''); setStep('panel');
      }
    }, 3000);
  }

  async function saveWebhook() {
    setMsg('saving');
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token, webhookUrl }) }).then((x) => x.json());
    setMsg(r.ok ? 'saved' : 'error'); setTimeout(() => setMsg(''), 2000);
  }
  async function rotate() {
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token, rotate: true }) }).then((x) => x.json());
    if (r.secret) setConn({ ...conn, secret: r.secret });
  }
  async function test() {
    const r = await fetch('/api/advanced/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token }) }).then((x) => x.json());
    setMsg(r.ok ? 'test sent' : 'set a webhook URL first'); setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="nav">
        <a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a>
        <a className="navlink" href="/advanced/learn">Learn more</a>
      </div>

      <div className="eyebrow">Advanced</div>
      <h1 className="h-page" style={{ marginBottom: 8 }}>Connect your backend</h1>
      <p style={{ color: 'var(--dim)', fontSize: 15, marginTop: 0, maxWidth: '60ch' }}>
        Get a signed webhook so your own site (Bitcoin Africa Story, WordPress, anything) is told when someone pays or is about to expire. Your backend writes to your own database and sends your own emails. Blink Subscriptions stores no keys to your systems.
      </p>

      {step !== 'panel' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="ph"><h2>Prove you own the username</h2><span className="tag">21 sats</span></div>
          <div className="pb">
            {step === 'start' && (
              <>
                <label>Your Blink username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" autoCapitalize="none" spellCheck={false} style={{ maxWidth: 360 }} />
                <p style={{ color: 'var(--faint)', fontSize: 13 }}>You&apos;ll pay a tiny 21-sat invoice to your own account. Only the owner can receive it, so this proves the username is yours — a public username alone can&apos;t unlock this.</p>
                {msg && <p style={{ color: 'var(--error)', fontSize: 13 }}>{msg}</p>}
                <button className="btn primary" onClick={startClaim} disabled={!clean}>Verify ownership</button>
              </>
            )}
            {step === 'verify' && (
              <div style={{ textAlign: 'center' }}>
                {!claim ? <p style={{ color: 'var(--faint)' }}>Creating invoice…</p> : (
                  <>
                    <p style={{ color: 'var(--dim)', fontSize: 14 }}>Pay 21 sats from your <b>@{clean}</b> Blink account.</p>
                    <img src={claim.qr} alt="Verify" width={200} height={200} style={{ borderRadius: 12, margin: '4px auto 12px', display: 'block', background: '#fff', padding: 8 }} />
                    <div style={{ display: 'flex', gap: 8, maxWidth: 360, margin: '0 auto' }}>
                      <a className="btn primary" style={{ flex: 1 }} href={`lightning:${claim.paymentRequest}`}>Open in wallet</a>
                      <button className="btn ghost" style={{ flex: 1 }} onClick={() => navigator.clipboard?.writeText(claim.paymentRequest)}>Copy</button>
                    </div>
                    <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 12 }}>Waiting for payment — unlocks automatically.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'panel' && conn && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="ph"><h2>Webhook for @{clean}</h2><span className="tag" style={{ color: 'var(--green)' }}>verified</span></div>
          <div className="pb">
            <label>Your webhook URL (your backend receives signed events here)</label>
            <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://bitcoinafricastory.com/api/blink-webhook" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
              <button className="btn primary sm" onClick={saveWebhook}>{msg === 'saving' ? 'Saving…' : 'Save webhook'}</button>
              <button className="btn ghost sm" onClick={test}>Send test event</button>
              {msg && msg !== 'saving' && <span style={{ fontSize: 13, color: msg === 'saved' || msg === 'test sent' ? 'var(--green)' : 'var(--error)' }}>{msg}</span>}
            </div>

            <label style={{ marginTop: 18 }}>Signing secret (verify events came from us)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={showSecret ? conn.secret : '•'.repeat(24)} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
              <button className="btn ghost sm" style={{ flex: 'none' }} onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Reveal'}</button>
              <button className="btn ghost sm" style={{ flex: 'none' }} onClick={() => navigator.clipboard?.writeText(conn.secret)}>Copy</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn ghost sm" onClick={rotate}>Rotate secret</button>
              <a className="btn ghost sm" href="/advanced/learn">How to verify &amp; handle events →</a>
            </div>

            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 16, marginBottom: 0 }}>
              Events fire to your URL: <code style={{ fontFamily: 'var(--mono)' }}>subscription.paid</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.renewed</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.expiring</code>. Each is signed with the <code style={{ fontFamily: 'var(--mono)' }}>Blink-Signature</code> header. Your backend writes to your own database and sends your own emails.
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
