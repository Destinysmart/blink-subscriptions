/**
 * local.mjs — zero-setup persistence.
 *
 * No Supabase, no signup, no manual schema. On first use it creates its own
 * tables and seeds a demo creator so the dashboard has data. A creator is
 * auto-provisioned the moment their /c/<username> page is opened — same
 * friction as the donate button (username + embed), but with real, persistent
 * subscription state underneath.
 *
 * Storage:
 *   - default: a local file (.data/blinksub.db) — works out of the box, persists.
 *   - hosted:  set DATABASE_URL to a libsql:// (Turso) url for Vercel/production;
 *              same code, same tables, no rewrite.
 */
import { createClient } from '@libsql/client';
import fs from 'node:fs';

const URL = process.env.DATABASE_URL || 'file:.data/blinksub.db';
if (URL.startsWith('file:')) { try { fs.mkdirSync('.data', { recursive: true }); } catch {} }
const db = createClient({ url: URL, authToken: process.env.DATABASE_AUTH_TOKEN });

const id = () => (globalThis.crypto?.randomUUID?.() || 'id_' + Math.random().toString(36).slice(2));
const daysISO = (n) => new Date(Date.now() + n * 86400000).toISOString();
const minsISO = (n) => new Date(Date.now() - n * 60000).toISOString();

const DEFAULT_TIERS = [
  { id: 'supporter', name: 'Supporter', desc: 'Back the work each month.', display: 'sats',
    monthly: { sats: 1000 }, annual: { sats: 10000 }, benefits: ['Members-only updates'], recommended: true },
  { id: 'patron', name: 'Patron', desc: 'Underwrite the whole thing.', display: 'sats',
    monthly: { sats: 5000 }, annual: { sats: 50000 }, benefits: ['Everything in Supporter', 'Name in the credits'], recommended: false },
];

const DEMO_TIERS = [
  { id: 'reader', name: 'Reader', desc: 'For readers who want the work to keep going.', display: 'sats',
    monthly: { sats: 1000 }, annual: { sats: 10000 }, benefits: ['Every article, no paywall', 'Members-only comments'], recommended: false },
  { id: 'builder', name: 'Builder', desc: 'For builders who want in on the process.', display: 'sats',
    monthly: { sats: 5000 }, annual: { sats: 50000 }, benefits: ['Everything in Reader', 'Monthly builder call', 'Full research archive'], recommended: true },
  { id: 'patron', name: 'Patron', desc: 'For patrons underwriting the whole thing.', display: 'fiat',
    monthly: { usd: 2100 }, annual: { usd: 21000 }, benefits: ['Everything in Builder', 'Name on the masthead', '21k club dinner'], recommended: false },
];

let ready;
function ensureReady() {
  if (!ready) ready = init();
  return ready;
}
async function init() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, brand TEXT, pitch TEXT,
      tiers_json TEXT, theme TEXT DEFAULT 'dark', accent TEXT DEFAULT '#f7931a',
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, contact TEXT, tier TEXT, sats INTEGER,
      cycle TEXT, kind TEXT, status TEXT DEFAULT 'active', next_due TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, creator_id TEXT, type TEXT, who TEXT, detail TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
  ], 'write');
  await seed();
}

async function seed() {
  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM creators');
  if (Number(rows[0].n) > 0) return;
  const cid = id();
  await db.execute({
    sql: 'INSERT INTO creators (id, username, brand, pitch, tiers_json) VALUES (?,?,?,?,?)',
    args: [cid, 'destiny_smart', 'Bitcoin Africa Story',
      'Independent Bitcoin journalism from the continent. Monthly support keeps the reporting free and pays the writers directly, in bitcoin, where cards do not reach.',
      JSON.stringify(DEMO_TIERS)],
  });
  const subs = [
    ['ada@blink.sv', 'Builder', 5000, 'active', daysISO(12), 'nwc'],
    ['kofi@getalby.com', 'Reader', 1000, 'active', daysISO(3), 'intraledger'],
    ['npub1z…q7', 'Patron', 18900, 'active', daysISO(20), 'nwc'],
    ['lerato@blink.sv', 'Builder', 5000, 'past_due', daysISO(-1), 'reminder'],
    ['sam@walletofsat…', 'Reader', 1000, 'active', daysISO(8), 'reminder'],
    ['thabo@blink.sv', 'Reader', 1000, 'canceled', null, 'intraledger'],
  ];
  for (const [contact, tier, sats, status, next_due, kind] of subs) {
    await db.execute({
      sql: 'INSERT INTO subscriptions (id, creator_id, contact, tier, sats, cycle, kind, status, next_due) VALUES (?,?,?,?,?,?,?,?,?)',
      args: [id(), cid, contact, tier, sats, 'monthly', kind, status, next_due],
    });
  }
  const events = [
    ['invoice.paid', 'ada@blink.sv', '5,000 sats', minsISO(9)],
    ['subscription.renewed', 'ada@blink.sv', 'next 12 Sep', minsISO(9)],
    ['invoice.payment_failed', 'lerato@blink.sv', 'attempt 1 of 4', minsISO(140)],
    ['subscription.created', 'sam@walletofsat…', 'Reader · reminder', minsISO(320)],
    ['invoice.paid', 'kofi@getalby.com', '1,000 sats', minsISO(600)],
  ];
  for (const [type, who, detail, at] of events) {
    await db.execute({ sql: 'INSERT INTO events (id, creator_id, type, who, detail, created_at) VALUES (?,?,?,?,?,?)', args: [id(), cid, type, who, detail, at] });
  }
}

function prettyBrand(username) {
  return username.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function findOrProvision(username) {
  await ensureReady();
  const found = await db.execute({ sql: 'SELECT * FROM creators WHERE username = ?', args: [username] });
  if (found.rows.length) return found.rows[0];
  // auto-provision: no signup, just the username
  const cid = id();
  await db.execute({
    sql: 'INSERT INTO creators (id, username, brand, pitch, tiers_json) VALUES (?,?,?,?,?)',
    args: [cid, username, prettyBrand(username),
      'Recurring support, paid in bitcoin over Lightning to @' + username + '.',
      JSON.stringify(DEFAULT_TIERS)],
  });
  const again = await db.execute({ sql: 'SELECT * FROM creators WHERE id = ?', args: [cid] });
  return again.rows[0];
}

// ---- public reads used by the pages -------------------------------------
export async function getCreator(username) {
  const c = await findOrProvision(username);
  return {
    id: c.id, blink_username: c.username, brand: c.brand, pitch: c.pitch,
    tiers: JSON.parse(c.tiers_json || '[]'), theme: c.theme, accent: c.accent,
  };
}

export async function getDashboard(username) {
  const c = await findOrProvision(username);
  const subsRes = await db.execute({ sql: 'SELECT * FROM subscriptions WHERE creator_id = ? ORDER BY created_at DESC', args: [c.id] });
  const evRes = await db.execute({ sql: 'SELECT * FROM events WHERE creator_id = ? ORDER BY created_at DESC LIMIT 8', args: [c.id] });
  const subs = subsRes.rows.map((s) => ({
    contact: s.contact, tier: s.tier, sats: Number(s.sats), status: s.status, nextDue: s.next_due, kind: s.kind,
  }));
  const active = subs.filter((s) => s.status !== 'canceled');
  return {
    creator: { brand: c.brand, blink_username: c.username },
    stats: { active: active.length, mrr: active.reduce((a, s) => a + s.sats, 0), pastDue: subs.filter((s) => s.status === 'past_due').length },
    subs,
    events: evRes.rows.map((e) => ({ type: e.type, who: e.who, detail: e.detail, at: e.created_at })),
  };
}

// ---- write used by /api/subscribe ---------------------------------------
export async function addSubscription({ username, contact, tier, sats, cycle, kind }) {
  const c = await findOrProvision(username);
  const sid = id();
  const next = daysISO(cycle === 'annual' ? 365 : 30);
  await db.execute({
    sql: 'INSERT INTO subscriptions (id, creator_id, contact, tier, sats, cycle, kind, status, next_due) VALUES (?,?,?,?,?,?,?,?,?)',
    args: [sid, c.id, contact || 'you@demo', tier, Math.round(sats) || 0, cycle || 'monthly', kind || 'reminder', 'active', next],
  });
  await db.execute({
    sql: 'INSERT INTO events (id, creator_id, type, who, detail, created_at) VALUES (?,?,?,?,?,?)',
    args: [id(), c.id, 'subscription.created', contact || 'new subscriber', `${tier} · ${kind}`, new Date().toISOString()],
  });
  return { id: sid, ok: true };
}

export const LOCAL = URL.startsWith('file:');
