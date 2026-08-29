import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const subId = new URL(req.url).searchParams.get('subId');
    if (!subId) return NextResponse.json({ status: 'PENDING' });

    const { getSubById, activateSub } = await import('@/lib/db/local.mjs');
    const { invoiceStatusByHash } = await import('@/lib/blink.mjs');
    const sub = await getSubById(subId);
    if (!sub) return NextResponse.json({ status: 'PENDING' });
    if (sub.status === 'active') return NextResponse.json({ status: 'PAID', paidUntil: sub.paid_until });

    // server-side verification against Blink's public status query
    const status = await invoiceStatusByHash(sub.payment_hash);
    if (status === 'PAID') {
      const { paidUntil } = await activateSub(subId);
      return NextResponse.json({ status: 'PAID', paidUntil });
    }
    return NextResponse.json({ status }); // PENDING | EXPIRED
  } catch (e) {
    return NextResponse.json({ status: 'PENDING', error: String(e.message) });
  }
}
