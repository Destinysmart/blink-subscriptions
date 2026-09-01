import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function POST(req) {
  const { username, apiKey } = await req.json();
  if (!username || !apiKey) return NextResponse.json({ verified: false, error: 'username and key required' }, { status: 400 });
  const { verifyByReadKey } = await import('@/lib/db/local.mjs');
  return NextResponse.json(await verifyByReadKey(username, apiKey)); // apiKey used once here, never persisted
}
