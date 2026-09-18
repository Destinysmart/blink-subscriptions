import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Diagnostic only. Asks Blink directly what it reports for a given invoice, using the
// exact queries the app relies on. Read-only, touches no secrets, changes nothing.
// Remove once detection is settled.
//   GET /api/debug/invoice?pr=<bolt11>[&hash=<paymentHash>]
export async function GET(req) {
  const u = new URL(req.url);
  const pr = u.searchParams.get('pr');
  const hash = u.searchParams.get('hash');
  if (!pr && !hash) {
    return NextResponse.json({ error: 'pass ?pr=<bolt11 invoice> (optionally &hash=<paymentHash>)' }, { status: 400 });
  }
  const { invoiceStatusByRequest, invoiceStatusByHash } = await import('@/lib/blink.mjs');
  const out = { checkedAt: new Date().toISOString() };
  if (pr) {
    try { out.byRequest = await invoiceStatusByRequest(pr); }
    catch (e) { out.byRequest = 'ERR: ' + String(e.message); }
  }
  if (hash) {
    try { out.byHash = await invoiceStatusByHash(hash); }
    catch (e) { out.byHash = 'ERR: ' + String(e.message); }
  }
  return NextResponse.json(out);
}
