import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET(req) {
  const subId = new URL(req.url).searchParams.get('subId');
  if (!subId) return NextResponse.json({ status: 'PENDING' });

  const { getSubById, activateSub } = await import('@/lib/db/local.mjs');
  const { invoiceStatus } = await import('@/lib/blink.mjs');

  let sub;
  try {
    sub = await getSubById(subId);
  } catch (e) {
    console.error('[pay/status] getSubById failed', subId, e);
    return NextResponse.json({ status: 'PENDING', debug: 'getSubById: ' + String(e.message) });
  }
  if (!sub) return NextResponse.json({ status: 'PENDING', debug: 'no sub for id ' + subId });
  if (sub.status === 'active') return NextResponse.json({ status: 'PAID', paidUntil: sub.paid_until });

  let status, byReq, byHash;
  try {
    ({ status, byReq, byHash } = await invoiceStatus({ paymentHash: sub.payment_hash, paymentRequest: sub.payment_request }));
  } catch (e) {
    console.error('[pay/status] invoiceStatus failed', sub.payment_hash, e);
    return NextResponse.json({ status: 'PENDING', debug: 'invoiceStatus: ' + String(e.message) });
  }
  console.log('[pay/status]', subId, 'byReq', byReq, 'byHash', byHash, '->', status);

  if (status === 'PAID') {
    try {
      const { paidUntil } = await activateSub(subId);
      return NextResponse.json({ status: 'PAID', paidUntil });
    } catch (e) {
      console.error('[pay/status] activateSub failed', subId, e);
      return NextResponse.json({ status: 'PENDING', debug: 'activateSub: ' + String(e.message) });
    }
  }
  return NextResponse.json({ status });
}
