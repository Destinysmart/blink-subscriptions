import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function POST(req) {
  const { username, token } = await req.json();
  const { startPlanPayment } = await import('@/lib/db/local.mjs');
  const QRCode = (await import('qrcode')).default;
  const r = await startPlanPayment(username, token);
  if (!r) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const qr = await QRCode.toDataURL('lightning:' + r.paymentRequest.toUpperCase(), { margin: 1, width: 220 });
  return NextResponse.json({ ...r, qr });
}
export async function GET(req) {
  const u = new URL(req.url);
  const { verifyPlanPayment } = await import('@/lib/db/local.mjs');
  const r = await verifyPlanPayment(u.searchParams.get('u'), u.searchParams.get('t'));
  if (!r) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(r);
}
