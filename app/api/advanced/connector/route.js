import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(req) {
  const url = new URL(req.url);
  const { getConnector } = await import('@/lib/db/local.mjs');
  const c = await getConnector(url.searchParams.get('u'), url.searchParams.get('t'));
  if (!c) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(c);
}
export async function POST(req) {
  const { username, token, webhookUrl, rotate } = await req.json();
  const { setWebhookUrl, rotateSecret } = await import('@/lib/db/local.mjs');
  if (rotate) { const r = await rotateSecret(username, token); return r ? NextResponse.json(r) : NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }
  const r = await setWebhookUrl(username, token, webhookUrl);
  return r ? NextResponse.json(r) : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
