import { getCreator, SATS_PER_USD } from '@/lib/data';
import SubscribePanel from '../../c/[username]/subscribe-panel';
import EmbedResizer from './resizer';

export const dynamic = 'force-dynamic';

export default async function Embed({ params }) {
  const creator = await getCreator(params.username);
  if (!creator) return <div style={{ padding: 16, color: '#999', fontFamily: 'sans-serif' }}>Not found.</div>;

  return (
    <div data-theme={creator.theme || 'dark'}>
      <style>{'body{background:transparent;margin:0}'}</style>
      <div className="panel" style={{ margin: 0 }}>
        <div className="pb">
          <SubscribePanel creator={creator} rate={SATS_PER_USD} />
          <p className="sub-tagline">Recurring support, paid in bitcoin over Lightning to @{creator.blink_username}.</p>
        </div>
      </div>
      <EmbedResizer />
    </div>
  );
}
