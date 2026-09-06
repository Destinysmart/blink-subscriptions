import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET(req) {
  const subId = new URL(req.url).searchParams.get('subId');
  if (!subId) return NextResponse.json({ status: 'PENDING' });

  const { getSubById, activateSub } = await import('@/lib/db/local.mjs');
  const { invoiceStatusByHash } = await import('@/lib/blink.mjs');

  let sub;
  try {
    sub = await getSubById(subId);
  } catch (e) {
    console.error('[pay/status] getSubById failed', subId, e);
    return NextResponse.json({ status: 'PENDING', debug: 'getSubById: ' + String(e.message) });
  }
  if (!sub) return NextResponse.json({ status: 'PENDING', debug: 'no sub for id ' + subId });
  if (sub.status === 'active') return NextResponse.json({ status: 'PAID', paidUntil: sub.paid_until });

  let status;
  try {
    status = await invoiceStatusByHash(sub.payment_hash);
  } catch (e) {
    console.error('[pay/status] invoiceStatusByHash failed', sub.payment_hash, e);
    return NextResponse.json({ status: 'PENDING', debug: 'statusByHash: ' + String(e.message) });
  }
  console.log('[pay/status]', subId, 'hash', sub.payment_hash, '->', status);

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
