import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET(req) {
  const subId = new URL(req.url).searchParams.get('subId');
  if (!subId) return NextResponse.json({ status: 'PENDING' });

  const { getSubById, settlePendingSub } = await import('@/lib/db/local.mjs');

  let sub;
  try {
    sub = await getSubById(subId);
  } catch (e) {
    console.error('[pay/status] getSubById failed', subId, e);
    return NextResponse.json({ status: 'PENDING', debug: 'getSubById: ' + String(e.message) });
  }
  if (!sub) return NextResponse.json({ status: 'PENDING', debug: 'no sub for id ' + subId });

  let r;
  try {
    r = await settlePendingSub(sub);
  } catch (e) {
    console.error('[pay/status] settlePendingSub failed', subId, e);
    return NextResponse.json({ status: 'PENDING', debug: 'settle: ' + String(e.message) });
  }
  console.log('[pay/status]', subId, 'byReq', r.byReq, 'byHash', r.byHash, 'via', r.via, '->', r.status);
  if (r.status === 'PAID') return NextResponse.json({ status: 'PAID', paidUntil: r.paidUntil, via: r.via });
  return NextResponse.json({ status: r.status, debug: r.error, byReq: r.byReq, byHash: r.byHash, via: r.via });
}
