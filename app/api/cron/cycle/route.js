import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  // In demo mode (no Supabase) there is nothing to bill.
  if (!process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, demo: true, note: 'set SUPABASE_URL + Blink keys to run the real cycle' });
  }
  // Protect the endpoint. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [{ makeDb }, { runCycle }, { deliverEvents }] = await Promise.all([
    import('@/lib/db/supabase.mjs'),
    import('@/lib/engine.mjs'),
    import('@/lib/deliver.mjs'),
  ]);
  const db = makeDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  await runCycle(db);
  await deliverEvents(db);
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
