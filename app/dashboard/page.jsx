import { getDashboard, DEMO } from '@/lib/data';

export const dynamic = 'force-dynamic';

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

export default async function Dashboard() {
  const { creator, stats, subs, events } = await getDashboard('destiny_smart');

  return (
    <div className="wrap">
      <div className="nav">
        <a className="brandmark" href="/"><span className="dot">₿</span>Blink<span className="s">Sub</span></a>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {DEMO && <span className="demo-flag">local db</span>}
          <a className="navlink" href={`/c/${creator.blink_username}`}>Subscribe page</a>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <span className="kicker">Creator dashboard</span>
        <div className="serif" style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{creator.brand}</div>
      </div>

      <div className="grid2">
        <div>
          <div className="stats">
            <div className="stat accent"><div className="k">Active subscribers</div><div className="v">{stats.active}</div></div>
            <div className="stat good"><div className="k">MRR</div><div className="v">{stats.mrr.toLocaleString()}<small>sats</small></div></div>
            <div className="stat warn"><div className="k">Past due</div><div className="v">{stats.pastDue}</div></div>
          </div>

          <div className="panel" style={{ marginTop: 20 }}>
            <div className="ph"><h2>Subscribers</h2><span className="tag">{subs.length} total</span></div>
            <div className="pb" style={{ paddingTop: 6 }}>
              <table>
                <thead><tr><th>Subscriber</th><th>Tier</th><th>Next due</th><th>Via</th><th>Status</th></tr></thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id}>
                      <td><div className="contact">{s.contact}</div><div className="sub">{s.sats.toLocaleString()} sats/mo</div></td>
                      <td className="amtm">{s.tier}</td>
                      <td className="amtm">{fmtDue(s.nextDue)}</td>
                      <td><span className="pill kind">{s.kind}</span></td>
                      <td><span className={`pill ${s.status}`}>{s.status.replace('_', ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel" style={{ alignSelf: 'start' }}>
          <div className="ph"><h2>Recent events</h2><span className="tag">webhook feed</span></div>
          <div className="pb">
            <div className="feed">
              {events.map((e, i) => {
                const cls = e.type.includes('paid') ? 'paid' : e.type.includes('failed') ? 'failed' : '';
                return (
                  <div className="ev" key={i}>
                    <span className={`etype ${cls}`}>{e.type}</span>
                    <span className="ewho">{e.who}</span>
                    <span className="edetail">{e.detail} · {ago(e.at)}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ color: 'var(--faint)', fontSize: 11.5, marginTop: 14, marginBottom: 0 }}>
              Creators gate access on these events, never on a checkout redirect.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
