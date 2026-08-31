'use client';
import { useState } from 'react';

const blank = () => ({
  id: 'tier_' + Math.random().toString(36).slice(2, 7),
  name: 'New tier', desc: '', display: 'sats',
  monthly: { sats: 1000 }, annual: { sats: 10000 },
  benefits: [], recommended: false,
});

function amt(tier, cycle) {
  const a = tier[cycle] || {};
  return tier.display === 'sats' ? (a.sats ?? 0) : ((a.usd ?? 0) / 100);
}
function setAmt(tier, cycle, val) {
  const n = Number(val) || 0;
  return { ...tier, [cycle]: tier.display === 'sats' ? { sats: Math.round(n) } : { usd: Math.round(n * 100) } };
}

export default function TierEditor({ username, initialTiers }) {
  const [tiers, setTiers] = useState(initialTiers?.length ? initialTiers : [blank()]);
  const [saved, setSaved] = useState('');

  const update = (i, next) => setTiers(tiers.map((t, k) => (k === i ? next : t)));

  async function save() {
    setSaved('saving');
    const clean = tiers.map((t) => ({
      ...t,
      benefits: Array.isArray(t.benefits) ? t.benefits : String(t.benefits || '').split('\n').map((s) => s.trim()).filter(Boolean),
    }));
    const res = await fetch('/api/creator/tiers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, tiers: clean }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    setSaved(res.ok ? 'saved' : 'error');
    setTimeout(() => setSaved(''), 2500);
  }

  const hasFree = tiers.some((t) => t.free);
  const addFree = () => setTiers([{ id: 'free_' + Math.random().toString(36).slice(2, 6), name: 'Free', desc: 'Join the newsletter, no payment.', free: true, benefits: ['Free newsletter'], recommended: false }, ...tiers]);

  return (
    <div>
      {!hasFree && (
        <div className="explain" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Keep a free tier so readers can join your newsletter without paying. It captures your whole list, not just paid subscribers.</span>
          <button className="btn outline sm" style={{ flex: 'none' }} onClick={addFree}>Add free tier</button>
        </div>
      )}
      {tiers.map((t, i) => (
        <div className="tier-row" key={t.id || i}>
          <div className="rowtop">
            <div style={{ display: 'flex', gap: 16 }}>
              <label className="chk"><input type="checkbox" checked={!!t.free} onChange={(e) => update(i, { ...t, free: e.target.checked })} /> Free (no payment)</label>
              <label className="chk"><input type="checkbox" checked={!!t.recommended} onChange={(e) => update(i, { ...t, recommended: e.target.checked })} /> Most popular</label>
            </div>
            <button className="btn ghost sm" onClick={() => setTiers(tiers.filter((_, k) => k !== i))}>Remove</button>
          </div>
          <div className="tier-grid">
            <div><label>Name</label><input value={t.name} onChange={(e) => update(i, { ...t, name: e.target.value })} /></div>
            {!t.free && <div><label>Priced in</label>
              <select value={t.display} onChange={(e) => update(i, { ...t, display: e.target.value })}>
                <option value="sats">sats</option><option value="fiat">USD</option>
              </select>
            </div>}
            <div className="full"><label>Description</label><input value={t.desc || ''} onChange={(e) => update(i, { ...t, desc: e.target.value })} /></div>
            {!t.free && <div><label>Monthly {t.display === 'sats' ? '(sats)' : '($)'}</label>
              <input type="number" value={amt(t, 'monthly')} onChange={(e) => update(i, setAmt(t, 'monthly', e.target.value))} /></div>}
            {!t.free && <div><label>Annual {t.display === 'sats' ? '(sats)' : '($)'}</label>
              <input type="number" value={amt(t, 'annual')} onChange={(e) => update(i, setAmt(t, 'annual', e.target.value))} /></div>}
            <div className="full"><label>Benefits (one per line)</label>
              <textarea rows={2} value={(Array.isArray(t.benefits) ? t.benefits : []).join('\n')}
                onChange={(e) => update(i, { ...t, benefits: e.target.value.split('\n') })} /></div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
        <button className="btn ghost sm" onClick={() => setTiers([...tiers, blank()])}>+ Add tier</button>
        <button className="btn primary sm" onClick={save} disabled={saved === 'saving'}>
          {saved === 'saving' ? 'Saving…' : 'Save tiers'}
        </button>
        {saved === 'saved' && <span style={{ color: 'var(--green)', fontSize: 13 }}>Saved</span>}
        {saved === 'error' && <span style={{ color: 'var(--error)', fontSize: 13 }}>Failed</span>}
      </div>
    </div>
  );
}
