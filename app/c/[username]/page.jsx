import { getCreator, SATS_PER_USD, LOCAL } from '@/lib/data';
import SubscribeExperience from './subscribe-experience';

export const dynamic = 'force-dynamic';

export default async function CreatorPage({ params }) {
  const creator = await getCreator(params.username);
  if (!creator) return <div className="wrap"><p>Creator not found.</p></div>;

  return (
    <div className="wrap">
      <div className="nav">
        <a className="brandmark" href="/"><span className="dot">₿</span>Blink<span className="s">Sub</span></a>
        {LOCAL && <span className="demo-flag">local db</span>}
      </div>

      <SubscribeExperience creator={creator} rate={SATS_PER_USD} />

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="ph"><h2>How it works</h2><span className="tag">honest mechanics</span></div>
        <div className="pb">
          <div className="howrow">
            <div><div className="h">You approve every payment</div><p>Lightning cannot auto-charge you. A capped authorization lets each cycle settle within a limit you set.</p></div>
            <div><div className="h">Paid to a Blink username</div><p>Funds go straight to the creator. No middleman balance, no float.</p></div>
            <div><div className="h">Cancel anytime</div><p>Revoke the authorization and it lapses. Nothing holds standing power over your funds.</p></div>
            <div><div className="h">Instant, final settlement</div><p>No chargebacks, no disputes. Payments are final the moment they land.</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
