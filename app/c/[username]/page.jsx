import { getCreator, DEMO } from '@/lib/data';
import SubscribePanel from './subscribe-panel';

export const dynamic = 'force-dynamic';

export default async function CreatorPage({ params }) {
  const creator = await getCreator(params.username);
  if (!creator) return <div className="wrap"><p>Creator not found.</p></div>;

  return (
    <div className="wrap">
      <div className="nav">
        <a className="brandmark" href="/"><span className="dot">₿</span> Blink<span style={{ color: 'var(--orange2)', fontStyle: 'italic', fontWeight: 500 }}>Sub</span></a>
        {DEMO && <span className="demo-flag">demo mode</span>}
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="ph"><h2>Support {creator.brand}</h2><span className="tag">monthly · recurring</span></div>
          <div className="pb">
            <div className="hero">
              <div className="avatar">{(creator.brand || creator.blink_username)[0].toUpperCase()}</div>
              <div>
                <div className="n">{creator.brand}</div>
                <div className="h">@{creator.blink_username}</div>
              </div>
            </div>
            <p className="pitch">{creator.pitch}</p>
            <SubscribePanel creator={creator} />
          </div>
        </div>

        <div className="panel">
          <div className="ph"><h2>How it works</h2><span className="tag">honest mechanics</span></div>
          <div className="pb" style={{ fontSize: 13.5, color: 'var(--dim)', lineHeight: 1.65 }}>
            <p style={{ marginTop: 0 }}><b style={{ color: 'var(--ink)' }}>You approve every payment.</b> Lightning cannot auto-charge you. A capped authorization (NWC or a limited key) lets each month settle within a limit you set.</p>
            <p><b style={{ color: 'var(--ink)' }}>Paid to a Blink username.</b> Funds go straight to the creator. No middleman balance, no float.</p>
            <p><b style={{ color: 'var(--ink)' }}>Cancel anytime.</b> Revoke the authorization and it lapses. Nothing holds standing power over your funds.</p>
            <p style={{ marginBottom: 0 }}><b style={{ color: 'var(--ink)' }}>No chargebacks, instant settlement.</b> Payments are final the moment they land.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
