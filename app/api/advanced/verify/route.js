import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { username } = await req.json();
    if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });
    const { startOwnershipVerify } = await import('@/lib/db/local.mjs');
    const QRCode = (await import('qrcode')).default;
    const r = await startOwnershipVerify(username);
    const qr = await QRCode.toDataURL('lightning:' + r.paymentRequest.toUpperCase(), { margin: 1, width: 220 });
    return NextResponse.json({ ...r, qr });
  } catch (e) {
    return NextResponse.json({ error: 'Could not create the verification invoice: ' + String(e.message) }, { status: 200 });
  }
}
export async function GET(req) {
  try {
    const c = new URL(req.url).searchParams.get('c');
    const { pollOwnershipVerify } = await import('@/lib/db/local.mjs');
    return NextResponse.json(await pollOwnershipVerify(c));
  } catch (e) {
    return NextResponse.json({ pending: true, note: String(e.message) });
  }
}
