/**
 * deliver.mjs — push queued entitlement events to each creator's webhook.
 * Creators gate access on these (invoice.paid, subscription.canceled, ...),
 * never on a checkout redirect. Signed with the creator's webhook_secret so
 * they can verify authenticity; deliveries are retried until a 2xx.
 */
import crypto from 'node:crypto';

export async function deliverEvents(db, { limit = 50 } = {}) {
  const events = await db.undeliveredEvents(limit);
  for (const ev of events) {
    const sub = ev.subscription_id ? await db.getSubscription(ev.subscription_id) : null;
    const creator = sub ? await db.getCreator(sub.creator_id) : null;

    if (!creator?.webhook_url) { await db.markEventDelivered(ev.id); continue; } // nothing to deliver to
    const body = JSON.stringify({ id: ev.id, type: ev.type, data: ev.payload });
    const sig = crypto.createHmac('sha256', creator.webhook_secret || '').update(body).digest('hex');
    try {
      const r = await fetch(creator.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Blinksub-Signature': sig },
        body,
      });
      if (r.ok) await db.markEventDelivered(ev.id);
      else await db.bumpEventAttempt(ev.id);
    } catch {
      await db.bumpEventAttempt(ev.id);
    }
  }
}
