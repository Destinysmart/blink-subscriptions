import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function POST(req) {
  const { username, token } = await req.json();
  const { sendTestEvent } = await import('@/lib/db/local.mjs');
  const r = await sendTestEvent(username, token);
  if (!r) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(r);
}
