import { getDashboard, getDefaultCreator, getCreator } from '@/lib/data';
import TierEditor from './tier-editor';

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

export default async function Dashboard({ searchParams }) {
  const who = searchParams?.u || (await getDefaultCreator());
  const { creator, stats, subs, events } = await getDashboard(who);
  const full = await getCreator(who);

  return (
    <div className="wrap">
      <div className="nav">
        <a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a>
        <a className="navlink" href={`/c/${creator.blink_username}`}>Subscribe page</a>
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
            <div className="ph"><h2>Subscribers</h2><span className="tag">{subs.length} total</span></div>
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
                        <td><span className={`pill ${s.status}`}>{s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
