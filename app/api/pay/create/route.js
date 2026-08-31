import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { username, tier, sats, cycle, email } = await req.json();
    const amount = Math.round(Number(sats)) || 0;
    if (!username || amount < 1) return NextResponse.json({ ok: false, error: 'missing username or amount' }, { status: 400 });

    const { createInvoiceForUsername } = await import('@/lib/blink.mjs');
    const { createPendingSub } = await import('@/lib/db/local.mjs');
    const QRCode = (await import('qrcode')).default;

    // no keys: public invoice for the creator's username
    const { paymentRequest, paymentHash } = await createInvoiceForUsername(username, amount, `${tier} subscription`);
    const { subId } = await createPendingSub({ username, contact: email, tier, sats: amount, cycle, paymentHash, paymentRequest });
    const qr = await QRCode.toDataURL('lightning:' + paymentRequest.toUpperCase(), { margin: 1, width: 240 });

    return NextResponse.json({ ok: true, subId, paymentRequest, qr });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message) }, { status: 500 });
  }
}
