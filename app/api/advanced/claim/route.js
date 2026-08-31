import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function POST(req) {
  try {
    const { username } = await req.json();
    const { startOwnershipClaim } = await import('@/lib/db/local.mjs');
    const QRCode = (await import('qrcode')).default;
    const { paymentRequest, hash } = await startOwnershipClaim(username);
    const qr = await QRCode.toDataURL('lightning:' + paymentRequest.toUpperCase(), { margin: 1, width: 220 });
    return NextResponse.json({ ok: true, paymentRequest, hash, qr });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e.message) }, { status: 500 }); }
}
