/**
 * db/supabase.mjs — the storage layer the engine talks to.
 * Implements the `db` interface from README against Supabase (supabase-js v2).
 * Use the SERVICE ROLE key here (server-side only; never ship it to a browser).
 */
import { createClient } from '@supabase/supabase-js';

export function makeDb(url, serviceKey) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const one = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };

  return {
    // subscriptions due for action: active/past_due whose renewal or next dunning step has arrived
    async dueSubscriptions(now) {
      const iso = new Date(now).toISOString();
      return one(await sb.from('subscriptions').select('*')
        .in('status', ['active', 'past_due'])
        .or(`current_period_end.lte.${iso},next_attempt_at.lte.${iso}`));
    },

    async getPrice(id)        { return one(await sb.from('prices').select('*').eq('id', id).single()); },
    async getCustomer(id)     { return one(await sb.from('customers').select('*').eq('id', id).single()); },
    async getCreator(id)      { return one(await sb.from('creators').select('*').eq('id', id).single()); },
    async getSubscription(id) { return one(await sb.from('subscriptions').select('*').eq('id', id).single()); },

    async getInvoiceByHash(hash) {
      const res = await sb.from('invoices').select('*').eq('payment_hash', hash).maybeSingle();
      if (res.error) throw new Error(res.error.message);
      return res.data; // null if not found
    },
    async createInvoice(row)         { return one(await sb.from('invoices').insert(row).select().single()); },
    async updateInvoice(id, patch)   { return one(await sb.from('invoices').update(patch).eq('id', id).select().single()); },

    async updateSubscription(id, patch) {
      return one(await sb.from('subscriptions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id).select().single());
    },

    async enqueueEvent(e)            { return one(await sb.from('events').insert(e).select().single()); },
    async undeliveredEvents(limit = 50) {
      return one(await sb.from('events').select('*')
        .eq('delivered', false).order('created_at', { ascending: true }).limit(limit));
    },
    async markEventDelivered(id)     { return one(await sb.from('events').update({ delivered: true }).eq('id', id).select().single()); },
    async bumpEventAttempt(id) {
      const ev = one(await sb.from('events').select('attempts').eq('id', id).single());
      return one(await sb.from('events').update({ attempts: (ev.attempts || 0) + 1 }).eq('id', id).select().single());
    },

    async log(tag, obj) { console.error(`[${tag}]`, JSON.stringify(obj)); },
  };
}
