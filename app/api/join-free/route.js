import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req) {
  try {
    const { username, tier, email } = await req.json();
    if (!username || !email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
    const { addFreeMember } = await import('@/lib/db/local.mjs');
    await addFreeMember({ username, email, tier });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message) }, { status: 500 });
  }
}
