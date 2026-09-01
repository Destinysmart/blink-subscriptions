'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AdvancedInner() {
  const params = useSearchParams();
  const [username, setUsername] = useState(params.get('u') || '');
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  const [apiKey, setApiKey] = useState('');
  const [step, setStep] = useState('verify'); // verify | upgrade | panel
  const [token, setToken] = useState('');
  const [conn, setConn] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [fee, setFee] = useState(21000);
  const [planInvoice, setPlanInvoice] = useState(null);
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
    const c = await fetch(`/api/advanced/connector?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`).then((r) => r.json());
    if (c && !c.error) {
      setToken(t); setConn(c); setWebhookUrl(c.webhookUrl || ''); setFee(c.fee || 21000);
      setStep(c.plan && c.plan.paid ? 'panel' : 'upgrade');
    }
  }

  async function verify() {
    if (!clean || !apiKey) return;
    setMsg('verifying');
    const r = await fetch('/api/advanced/verify-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, apiKey }) }).then((x) => x.json());
    setApiKey('');
    if (!r.verified) { setMsg(r.error || 'Verification failed'); return; }
    setMsg(''); localStorage.setItem('blinkManage:' + clean, r.manageToken);
    setToken(r.manageToken); setConn({ verified: true, secret: r.secret, webhookUrl: '', plan: r.plan }); setFee(r.fee || 21000);
    setStep(r.plan && r.plan.paid ? 'panel' : 'upgrade');
  }

  async function startUpgrade() {
    setPlanInvoice(null); setMsg('');
    const r = await fetch('/api/advanced/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token }) }).then((x) => x.json());
    if (r.error) { setMsg(r.error); return; }
    setPlanInvoice(r);
    poll.current = setInterval(async () => {
      const v = await fetch(`/api/advanced/plan?u=${encodeURIComponent(clean)}&t=${encodeURIComponent(token)}`).then((x) => x.json());
      if (v.paid) { clearInterval(poll.current); setConn((c) => ({ ...c, plan: { paid: true, until: v.until } })); setStep('panel'); }
    }, 3000);
  }

  async function saveWebhook() {
    setMsg('saving');
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token, webhookUrl }) }).then((x) => x.json());
    setMsg(r.ok ? 'saved' : (r.error === 'plan_required' ? 'plan expired' : 'error')); setTimeout(() => setMsg(''), 2200);
  }
  async function rotate() {
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token, rotate: true }) }).then((x) => x.json());
    if (r.secret) setConn((c) => ({ ...c, secret: r.secret }));
  }
  async function test() {
    const r = await fetch('/api/advanced/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: clean, token }) }).then((x) => x.json());
    setMsg(r.ok ? 'test sent' : (r.error === 'plan_required' ? 'plan expired' : 'set a webhook URL first')); setTimeout(() => setMsg(''), 2500);
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
        Get signed webhooks so your own site — custom, WordPress, an AI-built site, any builder — is told when someone pays or is about to expire. Your backend writes to your own database and sends your own emails. We store no keys to your systems.
      </p>

      {step === 'verify' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="ph"><h2>Verify it&apos;s your account</h2><span className="tag">read-only key</span></div>
          <div className="pb">
            <label>Your Blink username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" autoCapitalize="none" spellCheck={false} style={{ maxWidth: 360 }} />
            <label style={{ marginTop: 12 }}>Blink read-only API key</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="blink_..." autoCapitalize="none" spellCheck={false} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
            <p style={{ color: 'var(--faint)', fontSize: 13 }}>
              Only the owner can make a read-only key for an account, so this proves the username is yours. We use it once to read your username, then discard it. It is never stored, and a read-only key cannot move money.
            </p>
            {msg && msg !== 'verifying' && <p style={{ color: 'var(--error)', fontSize: 13 }}>{msg}</p>}
            <button className="btn primary" onClick={verify} disabled={!clean || !apiKey || msg === 'verifying'}>{msg === 'verifying' ? 'Verifying…' : 'Verify'}</button>
          </div>
        </div>
      )}

      {step === 'upgrade' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="ph"><h2>Unlock the connector</h2><span className="tag">{fee.toLocaleString()} sats / month</span></div>
          <div className="pb" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--dim)', fontSize: 14 }}>Verified as <b>@{clean}</b>. Pay {fee.toLocaleString()} sats to unlock backend webhooks for 30 days.</p>
            {!planInvoice ? (
              <button className="btn grad" onClick={startUpgrade}>Pay {fee.toLocaleString()} sats to unlock</button>
            ) : (
              <>
                <img src={planInvoice.qr} alt="Pay" width={200} height={200} style={{ borderRadius: 12, margin: '4px auto 12px', display: 'block', background: '#fff', padding: 8 }} />
                <div style={{ display: 'flex', gap: 8, maxWidth: 360, margin: '0 auto' }}>
                  <a className="btn primary" style={{ flex: 1 }} href={`lightning:${planInvoice.paymentRequest}`}>Open in wallet</a>
                  <button className="btn ghost" style={{ flex: 1 }} onClick={() => navigator.clipboard.writeText(planInvoice.paymentRequest)}>Copy</button>
                </div>
                <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 12 }}>Waiting for payment — unlocks automatically.</p>
              </>
            )}
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 14, marginBottom: 0 }}>The subscribe box and embed stay free. This fee is only for the backend connector.</p>
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
            <label style={{ marginTop: 18 }}>Signing secret (verify events came from us)</label>
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
              Events: <code style={{ fontFamily: 'var(--mono)' }}>subscription.paid</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.renewed</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.expiring</code> — each signed with <code style={{ fontFamily: 'var(--mono)' }}>Blink-Signature</code>.
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
