import { getCreator, SATS_PER_USD } from '@/lib/data';
import SubscribePanel from './subscribe-panel';

export const dynamic = 'force-dynamic';

export default async function CreatorPage({ params }) {
  const creator = await getCreator(params.username);
  if (!creator) return <div className="wrap"><p>Not found.</p></div>;

  return (
    <div className="wrap">
      <div className="nav">
        <a className="brandmark" href="/"><img className="logo logo-dark" src="/blink/blink-lockup-dark.svg" alt="Blink" /><img className="logo logo-light" src="/blink/blink-lockup-color.svg" alt="Blink" /><span className="product">subscriptions</span></a>
      </div>
      <div className="panel">
        <div className="pb">
          <div className="creator-head">
            <div className="avatar">{(creator.brand || creator.blink_username)[0].toUpperCase()}</div>
            <div>
              <div className="n">{creator.brand}</div>
              <div className="h">@{creator.blink_username}</div>
            </div>
          </div>
          {creator.pitch && <p className="creator-pitch">{creator.pitch}</p>}
          <SubscribePanel creator={creator} rate={SATS_PER_USD} />
        </div>
      </div>
    </div>
  );
}
