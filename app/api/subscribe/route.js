import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const { addSubscription } = await import('@/lib/db/local.mjs');
    const sub = await addSubscription(body);
    return NextResponse.json({ ok: true, sub });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message) }, { status: 500 });
  }
}
