'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GetStarted() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [state, setState] = useState('idle'); // idle | checking | found | notfound
  const clean = name.trim().toLowerCase().replace(/^@/, '');

  async function go(e) {
    e?.preventDefault();
    if (!clean) return;
    setState('checking');
    try {
      // verify the username exists on Blink (public LNURL), same as the donate button
      const r = await fetch(`https://blink.sv/.well-known/lnurlp/${encodeURIComponent(clean)}`);
      if (r.ok) { setState('found'); router.push(`/dashboard?u=${clean}`); return; }
      setState('notfound');
    } catch {
      // network blocked / offline — proceed anyway, dashboard will provision
      router.push(`/dashboard?u=${clean}`);
    }
  }

  return (
    <form onSubmit={go} style={{ maxWidth: 420, margin: '0 auto' }}>
      <div style={{ textAlign: 'left', marginBottom: 12 }}>
        <label>Your Blink username</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setState('idle'); }}
          placeholder="yourname"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          style={{ fontSize: 16 }}
        />
        {state === 'notfound' && <div style={{ color: 'var(--error)', fontSize: 13, marginTop: 6 }}>No Blink account with that username.</div>}
      </div>
      <button type="submit" className="btn primary" style={{ width: '100%' }} disabled={!clean || state === 'checking'}>
        {state === 'checking' ? 'Checking…' : 'Get started'}
      </button>
    </form>
  );
}
