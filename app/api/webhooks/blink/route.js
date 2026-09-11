import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Blink delivers webhooks through Svix. Verify the signature over the raw body so
// a forged "paid" event can't activate a subscription. Secret looks like "whsec_...".
function verifySvix(rawBody, headers, secret) {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  // reject stale deliveries (replay window: 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(ts)) || Math.abs(now - Number(ts)) > 300) return false;
  let key;
  try { key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); } catch { return false; }
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64');
  const provided = sigHeader.split(' ').map((s) => s.split(',')[1]).filter(Boolean);
  return provided.some((s) => {
    try { return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)); } catch { return false; }
  });
}

export async function POST(req) {
  const raw = await req.text();
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true, ignored: 'bad json' }); }

  const eventType = String(body?.eventType || '');
  const tx = body?.transaction || {};
  const paymentHash = tx?.initiationVia?.paymentHash;
  const status = String(tx?.status || '').toLowerCase();

  // We only act on incoming receives that carry an invoice hash. Everything else
  // (sends, unrelated account activity) is acknowledged and ignored.
  if (!eventType.startsWith('receive.') || !paymentHash) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (status && status !== 'success') {
    return NextResponse.json({ ok: true, pending: status });
  }

  const secret = process.env.BLINK_WEBHOOK_SECRET || '';
  if (secret) {
    if (!verifySvix(raw, req.headers, secret)) {
      console.warn('[webhook/blink] signature check failed for', paymentHash);
      return NextResponse.json({ error: 'bad signature' }, { status: 401 });
    }
  } else {
    // Allowed for local/testing only. In production this must be set.
    console.warn('[webhook/blink] BLINK_WEBHOOK_SECRET not set — accepting unverified');
  }

  try {
    const { markPaidByHash } = await import('@/lib/db/local.mjs');
    const subId = await markPaidByHash(paymentHash);
    console.log('[webhook/blink]', eventType, paymentHash, '->', subId ? 'activated ' + subId : 'no matching sub');
  } catch (e) {
    // 500 so Blink/Svix retries a transient DB error
    console.error('[webhook/blink] activate failed', paymentHash, e);
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
