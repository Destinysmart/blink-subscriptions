import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = (new URL(req.url).searchParams.get('u') || '').trim().toLowerCase().replace(/^@/, '');
  if (!u) return NextResponse.json({ exists: false });
  try {
    // usernameAvailable: false => the username EXISTS (custodial). true => available (no account).
    const q = `query($username: Username!){ usernameAvailable(username: $username) }`;
    const r = await fetch('https://api.blink.sv/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, variables: { username: u } }),
    });
    const d = await r.json();
    if (d.errors) {
      const m = d.errors[0]?.message || '';
      if (m.includes('Invalid value for Username')) return NextResponse.json({ exists: false, invalid: true });
    }
    if (d?.data?.usernameAvailable === false) return NextResponse.json({ exists: true });

    // self-custodial (Spark) fallback: a valid LNURL-pay payRequest means it exists and is payable
    const lr = await fetch(`https://blink.sv/.well-known/lnurlp/${encodeURIComponent(u)}`, { headers: { Accept: 'application/json' } });
    if (lr.ok) {
      const ld = await lr.json();
      if (ld && ld.tag === 'payRequest' && ld.callback) return NextResponse.json({ exists: true });
    }
    return NextResponse.json({ exists: false });
  } catch (e) {
    return NextResponse.json({ exists: false, error: String(e.message) });
  }
}
