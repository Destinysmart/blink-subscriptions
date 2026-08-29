import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    if (!process.env.SUPABASE_URL) return NextResponse.json({ ok: true, demo: true });
    // TODO: verify Blink's webhook signature before trusting the payload.
    const b = await req.json().catch(() => ({}));
    const paymentHash = b.paymentHash || b.eventPayload?.paymentHash || b.transaction?.initiationVia?.paymentHash;
    if (paymentHash) {
      const [{ makeDb }, { markInvoicePaid }] = await Promise.all([
        import('@/lib/db/supabase.mjs'),
        import('@/lib/engine.mjs'),
      ]);
      const db = makeDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      await markInvoicePaid(db, paymentHash);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}
