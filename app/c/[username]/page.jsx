import { getCreator, SATS_PER_USD } from '@/lib/data';
import SubscribePanel from './subscribe-panel';

export const dynamic = 'force-dynamic';

export default async function CreatorPage({ params }) {
  const creator = await getCreator(params.username);
  if (!creator) return <div className="wrap"><p>Not found.</p></div>;

  return (
    <div data-theme={creator.theme || 'dark'} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
    <div className="wrap">
      <div className="nav">
        <a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a>
      </div>
      <div className="panel">
        <div className="pb">
          <SubscribePanel creator={creator} rate={SATS_PER_USD} />
          <p className="sub-tagline">Recurring support, paid in bitcoin over Lightning to @{creator.blink_username}.</p>
        </div>
      </div>
    </div>
    </div>
  );
}