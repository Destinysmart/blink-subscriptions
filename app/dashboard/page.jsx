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

// Forward-don't-store. Subscribers go to the creator's own tool the moment a
// payment lands, and we stop holding their email. This card is where a verified
// creator points that firehose. Free for everyone; no unlock.
function DestinationCard({ username, initial }) {
  const [url, setUrl] = useState(initial?.url || '');
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(!!initial?.set);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(initial?.held || 0);
  const token = typeof window !== 'undefined' ? localStorage.getItem('blinkManage:' + username) : null;

  async function flush() {
    setBusy(true); setMsg('');
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, token, flush: true }) }).then((x) => x.json()).catch(() => ({ error: 'network' }));
    setBusy(false);
    if (r && r.ok) { setHeld(r.remaining || 0); setMsg(`Forwarded ${r.forwarded} to your destination${r.failed ? `, ${r.failed} could not be delivered and are still held` : '. We hold none of them now.'}`); }
    else setMsg(r?.error === 'no_destination' ? 'Set and save a destination first.' : (r?.error || 'Could not forward'));
  }

  useEffect(() => {
    if (!token) return;
    fetch(`/api/advanced/connector?u=${encodeURIComponent(username)}&t=${encodeURIComponent(token)}`)
      .then((r) => r.json()).then((c) => { if (c && c.secret) setSecret(c.secret); }).catch(() => {});
  }, [username, token]);

  async function save() {
    setBusy(true); setMsg('');
    const r = await fetch('/api/advanced/connector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, token, webhookUrl: url.trim() }) }).then((x) => x.json()).catch(() => ({ error: 'network' }));
    setBusy(false);
    if (r && r.ok) { setSaved(!!url.trim()); setMsg(url.trim() ? 'Saved. New subscribers now go straight to you.' : 'Cleared. We will hold emails until you set a destination.'); }
    else setMsg(r?.error === 'unauthorized' ? 'Session expired. Reload and verify again.' : (r?.error || 'Could not save'));
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="ph"><h2>Where do your subscribers go?</h2><span className={`tag ${saved ? '' : 'warn'}`}>{saved ? 'forwarding on' : 'not set'}</span></div>
      <div className="pb">
        <p style={{ color: 'var(--dim)', fontSize: 14, marginTop: 0 }}>
          Your subscribers belong to you, not to us. The moment someone pays or joins free, we send their email, tier, and renewal date to a URL you control, then we stop holding it. Point this at your newsletter tool, a Zapier or n8n hook, or a Google Sheet.
        </p>
        {!saved && (
          <p style={{ color: 'var(--warn, #f5b642)', fontSize: 13 }}>
            Until you set a destination, subscriber emails sit in this dashboard's database. Set one so they go to you.
          </p>
        )}
        <label>Destination URL</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/… or https://yoursite.com/api/subscribers" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn grad" onClick={save} disabled={busy || !token}>{busy ? 'Saving…' : 'Save destination'}</button>
          {msg && <span style={{ fontSize: 13, color: 'var(--dim)' }}>{msg}</span>}
        </div>
        {saved && held > 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
            We are still holding <b>{held}</b> subscriber email{held === 1 ? '' : 's'} from before you set a destination.
            <div style={{ marginTop: 8 }}><button className="btn ghost sm" onClick={flush} disabled={busy}>{busy ? 'Forwarding…' : 'Forward them to my destination and stop holding them'}</button></div>
          </div>
        )}
        {secret && (
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--faint)' }}>
            Every POST is signed with header <code style={{ fontFamily: 'var(--mono)' }}>Blink-Signature</code> (HMAC-SHA256 of the body). Your signing secret:
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, marginTop: 4, wordBreak: 'break-all', color: 'var(--ink)' }}>{secret}</div>
            Events: <code style={{ fontFamily: 'var(--mono)' }}>subscription.paid</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.renewed</code>, <code style={{ fontFamily: 'var(--mono)' }}>subscription.created</code> (free), <code style={{ fontFamily: 'var(--mono)' }}>subscription.expiring</code>. Each carries a stable <code style={{ fontFamily: 'var(--mono)' }}>subscriberId</code> so your tool can match renewals to the original signup.
          </div>
        )}
      </div>
    </div>
  );
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

          <DestinationCard username={creator.blink_username} initial={data?.dashboard?.destination} />

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
