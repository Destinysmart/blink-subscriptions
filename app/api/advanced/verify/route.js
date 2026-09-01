import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { username } = await req.json();
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });
  const { startOwnershipVerify } = await import('@/lib/db/local.mjs');
  const QRCode = (await import('qrcode')).default;
  const r = await startOwnershipVerify(username);
  const qr = await QRCode.toDataURL('lightning:' + r.paymentRequest.toUpperCase(), { margin: 1, width: 220 });
  return NextResponse.json({ ...r, qr });
}
export async function GET(req) {
  const c = new URL(req.url).searchParams.get('c');
  const { pollOwnershipVerify } = await import('@/lib/db/local.mjs');
  return NextResponse.json(await pollOwnershipVerify(c));
}
