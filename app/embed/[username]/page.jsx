import { getCreator, SATS_PER_USD } from '@/lib/data';
import SubscribePanel from '../../c/[username]/subscribe-panel';
import EmbedResizer from './resizer';

export const dynamic = 'force-dynamic';

export default async function Embed({ params }) {
  const creator = await getCreator(params.username);
  if (!creator) return <div style={{ padding: 16, color: '#999', fontFamily: 'sans-serif' }}>Not found.</div>;

  return (
    <>
      <style>{'body{background:transparent;margin:0}'}</style>
      <div className="panel" style={{ margin: 0 }}>
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
      <EmbedResizer />
    </>
  );
}
