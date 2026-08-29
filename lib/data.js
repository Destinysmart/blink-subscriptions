/**
 * data.js — read layer for the pages.
 * DEMO mode (no SUPABASE_URL): returns sample data so the preview renders with
 * zero configuration. Live mode: reads from Supabase.
 */
import { makeDb } from './db/supabase.mjs';

export const DEMO = !process.env.SUPABASE_URL;

// ---- demo data ------------------------------------------------------------
const demoCreators = {
  destiny_smart: {
    id: 'cr_1',
    blink_username: 'destiny_smart',
    brand: 'Bitcoin Africa Story',
    pitch:
      'Independent Bitcoin journalism from the continent. Monthly support keeps the reporting free and pays the writers directly, in bitcoin, where cards do not reach.',
    prices: [
      { id: 'p_reader', name: 'Reader', desc: 'Every article, no paywall', sats: 1000, usd: null },
      { id: 'p_builder', name: 'Builder', desc: 'Monthly builder call + full archive', sats: 5000, usd: null },
      { id: 'p_patron', name: 'Patron', desc: 'Name on the masthead, 21k club', sats: null, usd: 2100 },
    ],
  },
};

const demoSubs = [
  { id: 's1', contact: 'ada@blink.sv',       tier: 'Builder', sats: 5000,  status: 'active',   nextDue: days(12),  kind: 'nwc' },
  { id: 's2', contact: 'kofi@getalby.com',   tier: 'Reader',  sats: 1000,  status: 'active',   nextDue: days(3),   kind: 'intraledger' },
  { id: 's3', contact: 'npub1z…q7',          tier: 'Patron',  sats: 33210, status: 'active',   nextDue: days(20),  kind: 'nwc' },
  { id: 's4', contact: 'lerato@blink.sv',    tier: 'Builder', sats: 5000,  status: 'past_due', nextDue: days(-1),  kind: 'reminder' },
  { id: 's5', contact: 'sam@walletofsat…',   tier: 'Reader',  sats: 1000,  status: 'active',   nextDue: days(8),   kind: 'reminder' },
  { id: 's6', contact: 'thabo@blink.sv',     tier: 'Reader',  sats: 1000,  status: 'canceled', nextDue: null,      kind: 'intraledger' },
];

const demoEvents = [
  { type: 'invoice.paid',           who: 'ada@blink.sv',    at: mins(9),   detail: '5,000 sats' },
  { type: 'subscription.renewed',   who: 'ada@blink.sv',    at: mins(9),   detail: 'next 12 Sep' },
  { type: 'invoice.payment_failed', who: 'lerato@blink.sv', at: mins(140), detail: 'attempt 1 of 4' },
  { type: 'subscription.created',   who: 'sam@walletofsat…',at: mins(320), detail: 'Reader · reminder' },
  { type: 'invoice.paid',           who: 'kofi@getalby.com',at: mins(600), detail: '1,000 sats' },
];

function days(n) { return n === null ? null : new Date(Date.now() + n * 86400000).toISOString(); }
function mins(n) { return new Date(Date.now() - n * 60000).toISOString(); }

// ---- public read functions -----------------------------------------------
export async function getCreator(username) {
  if (DEMO) return demoCreators[username] || demoCreators.destiny_smart;
  const db = makeDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const creator = await db.getCreatorByUsername?.(username);
  return creator || null;
}

export async function getDashboard(username) {
  if (DEMO) {
    const active = demoSubs.filter((s) => s.status !== 'canceled');
    const mrr = active.reduce((a, s) => a + s.sats, 0);
    const pastDue = demoSubs.filter((s) => s.status === 'past_due').length;
    return {
      creator: demoCreators[username] || demoCreators.destiny_smart,
      stats: { active: active.length, mrr, pastDue },
      subs: demoSubs,
      events: demoEvents,
    };
  }
  // Live mode: implement Supabase aggregate reads here against your schema.
  return { creator: null, stats: { active: 0, mrr: 0, pastDue: 0 }, subs: [], events: [] };
}
