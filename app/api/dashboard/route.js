import { NextResponse } from 'next/server';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(req) {
  try {
    const q = new URL(req.url).searchParams;
    const { getDashboardIfOwner } = await import('@/lib/db/local.mjs');
    const data = await getDashboardIfOwner(q.get('u'), q.get('t'));
    if (!data) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e.message) }, { status: 200 });
  }
}
