'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TierEditor from './tier-editor';
import EmbedSnippet from './embed-snippet';

function fmtDue(iso) {
  if (!iso) return '—';
  const d = new Date(iso), diff = Math.round((d - Date.now()) / 86400000);
  const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diff < 0) return `${s} · ${Math.abs(diff)}d overdue`;
  if (diff === 0) return `${s} · today`;
  return `${s} · in ${diff}d`;
}
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function DashboardInner() {
  const params = useSearchParams();
  const [uInput, setUInput] = useState(params.get('u') || '');
  const u = (params.get('u') || '').trim().toLowerCase().replace(/^@/, '');
  const [step, setStep] = useState('loading'); // loading | needUser | gate | ready
  const [data, setData] = useState(null);
  const [inv, setInv] = useState(null);
  const [msg, setMsg] = useState('');
  const poll = useRef(null);

  useEffect(() => {
    if (!u) { setStep('needUser'); return; }
    const t = localStorage.getItem('blinkManage:' + u);
    if (!t) { setStep('gate'); return; }
    load(u, t);
    // eslint-disable-next-line
  }, []);
  useEffect(() => () => clearInterval(poll.current), []);

  async function load(who, token) {
    setStep('loading');
    const r = await fetch(`/api/dashboard?u=${encodeURIComponent(who)}&t=${encodeURIComponent(token)}`).then((x) => x.json()).catch(() => ({}));
    if (r && r.dashboard) { setData(r); setStep('ready'); }
    else { setStep('gate'); } // token missing/expired -> verify
  }

  async function startVerify() {
    setMsg(''); setInv(null);
    const r = await fetch('/api/advanced/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u }) }).then((x) => x.json()).catch(() => ({ error: 'network' }));
    if (r.error) { setMsg(r.error); return; }
    setInv(r);
    poll.current = setInterval(async () => {
      const v = await fetch(`/api/advanced/verify?c=${encodeURIComponent(r.claimId)}`).then((x) => x.json()).catch(() => ({}));
      if (v.verified && v.manageToken) { clearInterval(poll.current); localStorage.setItem('blinkManage:' + u, v.manageToken); load(u, v.manageToken); }
      else if (v.error) { clearInterval(poll.current); setMsg(v.error); }
    }, 3000);
  }

  // --- needs a username ---
  if (step === 'needUser') {
    return (
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="nav"><a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a></div>
        <h1 className="h-page" style={{ marginBottom: 8 }}>Open your dashboard</h1>
        <p style={{ color: 'var(--dim)' }}>Enter your Blink username.</p>
        <div style={{ display: 'flex', gap: 8, maxWidth: 380 }}>
          <input value={uInput} onChange={(e) => setUInput(e.target.value)} placeholder="yourname" autoCapitalize="none" spellCheck={false} />
          <button className="btn primary" style={{ flex: 'none' }} onClick={() => { const v = uInput.trim().toLowerCase().replace(/^@/, ''); if (v) window.location.href = '/dashboard?u=' + encodeURIComponent(v); }}>Go</button>
        </div>
      </div>
    );
  }

  // --- verify gate (pay from your username) ---
  if (step === 'gate') {
    return (
      <div className="wrap" style={{ maxWidth: 620 }}>
        <div className="nav"><a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a></div>
        <div className="eyebrow">Dashboard</div>
        <h1 className="h-page" style={{ marginBottom: 8 }}>Verify @{u}</h1>
        <p style={{ color: 'var(--dim)', maxWidth: '54ch' }}>To open this dashboard, prove the account is yours by paying a small amount <b>from @{u}</b>. Only the owner can send from it. This unlocks your dashboard and backend connector.</p>
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="ph"><h2>Pay from @{u}</h2><span className="tag">{inv ? inv.sats.toLocaleString() : '21'} sats</span></div>
          <div className="pb" style={{ textAlign: 'center' }}>
            {msg && <p style={{ color: 'var(--error)', fontSize: 13 }}>{msg}</p>}
            {!inv ? (
              <button className="btn grad" onClick={startVerify}>Start verification</button>
            ) : (
              <>
                <p style={{ color: 'var(--dim)', fontSize: 14 }}>Pay <b>{inv.sats.toLocaleString()} sats</b> to the username <b>circularity</b> from your <b>@{u}</b> Blink account.</p>
                <img src={inv.qr} alt="circularity paycode" width={190} height={190} style={{ borderRadius: 12, margin: '4px auto 8px', display: 'block', background: '#fff', padding: 8 }} />
                <div style={{ display: 'flex', gap: 8, maxWidth: 360, margin: '0 auto' }}>
                  <a className="btn primary" style={{ flex: 1 }} href={`lightning:${inv.lnaddress}`}>Open in wallet</a>
                  <button className="btn ghost" style={{ flex: 1 }} onClick={() => navigator.clipboard.writeText('circularity')}>Copy username</button>
                </div>
                <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 10 }}>Pay from @{u} — that’s how we confirm it’s yours. Unlocks automatically.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'loading' || !data) {
    return <div className="wrap"><p style={{ color: 'var(--faint)' }}>Loading…</p></div>;
  }

  // --- ready: the real dashboard ---
  const { creator, stats, subs, events } = data.dashboard;
  const full = data.full;
  return (
    <div className="wrap">
      <div className="nav">
        <a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a>
        <div style={{ display: 'flex', gap: 8 }}><a className="navlink" href={`/advanced?u=${creator.blink_username}`}>Advanced</a><a className="navlink" href={`/c/${creator.blink_username}`}>Subscribe page</a></div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow">Dashboard</div>
        <h1 className="h-page">{creator.brand}</h1>
      </div>

      <div className="grid2">
        <div>
          <div className="stats">
            <div className="stat accent"><div className="k">Active</div><div className="v">{stats.active}</div></div>
            <div className="stat good"><div className="k">Monthly income</div><div className="v">{stats.mrr.toLocaleString()}<small>sats</small></div></div>
            <div className="stat"><div className="k">Expired</div><div className="v">{stats.pastDue}</div></div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="ph"><h2>Subscribers</h2><span className="tag">{subs.length} total · {stats.free} free</span></div>
            <div className="pb" style={{ paddingTop: 6 }}>
              {subs.length === 0 ? (
                <div className="empty">No subscribers yet. Share your subscribe page to get your first.</div>
              ) : (
                <table>
                  <thead><tr><th>Subscriber</th><th>Tier</th><th>Renews</th><th>Status</th></tr></thead>
                  <tbody>
                    {subs.map((s, i) => (
                      <tr key={s.id || i}>
                        <td><div className="contact">{s.contact}</div><div className="sub">{s.sats.toLocaleString()} sats/mo</div></td>
                        <td>{s.tier}</td>
                        <td>{fmtDue(s.nextDue)}</td>
                        <td><span className={`pill ${s.kind === 'free' ? 'free' : s.status}`}>{s.kind === 'free' ? 'free' : s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="ph"><h2>Embed on your site</h2><span className="tag">copy &amp; paste</span></div>
            <div className="pb"><EmbedSnippet username={creator.blink_username} /></div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="ph"><h2>Your tiers</h2><span className="tag">edit and save</span></div>
            <div className="pb"><TierEditor username={creator.blink_username} initialTiers={full?.tiers || []} /></div>
          </div>
        </div>

        <div className="panel" style={{ alignSelf: 'start' }}>
          <div className="ph"><h2>Recent activity</h2><span className="tag">payments</span></div>
          <div className="pb">
            {events.length === 0 ? (
              <div className="empty">Payments will appear here as they land.</div>
            ) : (
              <div className="feed">
                {events.map((e, i) => (
                  <div className="ev" key={i}>
                    <span className={`etype ${e.type.includes('paid') ? 'paid' : ''}`}>{e.type}</span>
                    <span className="ewho">{e.who}</span>
                    <span className="edetail">{e.detail} · {ago(e.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return <Suspense fallback={<div className="wrap"><p style={{ color: 'var(--faint)' }}>Loading…</p></div>}><DashboardInner /></Suspense>;
}
