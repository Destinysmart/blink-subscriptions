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
import { invoiceStatusByHash } from '../blink.mjs';

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
      cycle TEXT, kind TEXT, status TEXT DEFAULT 'active', next_due TEXT, paid_until TEXT,
      payment_hash TEXT, payment_request TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, creator_id TEXT, type TEXT, who TEXT, detail TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
  ], 'write');
  for (const col of ['paid_until TEXT', 'payment_hash TEXT', 'payment_request TEXT']) {
    try { await db.execute('ALTER TABLE subscriptions ADD COLUMN ' + col); } catch {}
  }
  // one-time cleanup: remove the fake demo subscribers/events shipped in earlier builds
  const FAKE = ['ada@blink.sv','kofi@getalby.com','npub1z…q7','lerato@blink.sv','sam@walletofsat…','thabo@blink.sv'];
  const ph = FAKE.map(() => '?').join(',');
  try { await db.execute({ sql: `DELETE FROM subscriptions WHERE contact IN (${ph})`, args: FAKE }); } catch {}
  try { await db.execute({ sql: `DELETE FROM events WHERE who IN (${ph})`, args: FAKE }); } catch {}
  await seed();
}

async function seed() {
  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM creators');
  if (Number(rows[0].n) > 0) return;
  // create the demo creator only (so /c/destiny_smart resolves). NO fake subscribers.
  await db.execute({
    sql: 'INSERT INTO creators (id, username, brand, pitch, tiers_json) VALUES (?,?,?,?,?)',
    args: [id(), 'destiny_smart', 'Bitcoin Africa Story',
      'Independent Bitcoin journalism from the continent. Monthly support keeps the reporting free and pays the writers directly, in bitcoin, where cards do not reach.',
      JSON.stringify(DEMO_TIERS)],
  });
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

export async function getDefaultCreator() {
  await ensureReady();
  // prefer the creator that actually has subscriptions; fall back to most-recent
  const busy = await db.execute(
    `SELECT c.username AS username, COUNT(sub.id) AS n
       FROM creators c LEFT JOIN subscriptions sub ON sub.creator_id = c.id
      GROUP BY c.id ORDER BY n DESC, c.rowid DESC LIMIT 1`
  );
  return busy.rows[0]?.username || 'destiny_smart';
}

export async function getDashboard(username) {
  const c = await findOrProvision(username);
  // self-heal: any pending subscription that Blink says is actually PAID -> activate it
  const pend = await db.execute({ sql: 'SELECT id, payment_hash FROM subscriptions WHERE creator_id = ? AND status = ?', args: [c.id, 'pending'] });
  for (const row of pend.rows) {
    if (!row.payment_hash) continue;
    try { if ((await invoiceStatusByHash(row.payment_hash)) === 'PAID') await activateSub(row.id); } catch {}
  }
  const subsRes = await db.execute({ sql: 'SELECT * FROM subscriptions WHERE creator_id = ? ORDER BY created_at DESC', args: [c.id] });
  const evRes = await db.execute({ sql: 'SELECT * FROM events WHERE creator_id = ? ORDER BY created_at DESC LIMIT 8', args: [c.id] });
  const now = Date.now();
  const eff = (s) => {
    if (s.status === 'canceled') return 'canceled';
    if (s.status === 'pending') return 'pending';
    if (s.paid_until) return new Date(s.paid_until).getTime() > now ? 'active' : 'expired';
    return s.status === 'past_due' ? 'expired' : 'active';
  };
  const subs = subsRes.rows
    .map((s) => ({ id: s.id, contact: s.contact || '—', tier: s.tier, sats: Number(s.sats), status: eff(s), nextDue: s.paid_until || s.next_due, kind: s.kind }))
    .filter((s) => s.status !== 'pending');
  const active = subs.filter((s) => s.status === 'active');
  return {
    creator: { brand: c.brand, blink_username: c.username },
    stats: { active: active.length, mrr: active.reduce((a, s) => a + s.sats, 0), pastDue: subs.filter((s) => s.status === 'expired').length },
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


// ---- no-keys pay flow: pending -> paid -> active until paid_until --------
export async function createPendingSub({ username, contact, tier, sats, cycle, paymentHash, paymentRequest }) {
  const c = await findOrProvision(username);
  const sid = id();
  await db.execute({
    sql: 'INSERT INTO subscriptions (id, creator_id, contact, tier, sats, cycle, kind, status, payment_hash, payment_request) VALUES (?,?,?,?,?,?,?,?,?,?)',
    args: [sid, c.id, contact || null, tier, Math.round(sats) || 0, cycle || 'monthly', 'reminder', 'pending', paymentHash, paymentRequest],
  });
  return { subId: sid, creator: c.username };
}

export async function getSubById(subId) {
  const r = await db.execute({ sql: 'SELECT * FROM subscriptions WHERE id = ?', args: [subId] });
  return r.rows[0] || null;
}

export async function activateSub(subId) {
  const s = await getSubById(subId);
  if (!s) return null;
  if (s.status === 'active' && s.paid_until) return { paidUntil: s.paid_until };
  const until = daysISO(s.cycle === 'annual' ? 365 : 30);
  await db.execute({
    sql: 'UPDATE subscriptions SET status = ?, paid_until = ?, next_due = ? WHERE id = ?',
    args: ['active', until, until, subId],
  });
  await db.execute({
    sql: 'INSERT INTO events (id, creator_id, type, who, detail, created_at) VALUES (?,?,?,?,?,?)',
    args: [id(), s.creator_id, 'invoice.paid', s.contact || 'subscriber', `${s.sats.toLocaleString?.() || s.sats} sats · ${s.tier}`, new Date().toISOString()],
  });
  return { paidUntil: until };
}

export const LOCAL = URL.startsWith('file:');
