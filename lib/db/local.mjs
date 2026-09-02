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
import { invoiceStatusByHash, createInvoiceForUsername, whoAmI, getRecentReceives } from '../blink.mjs';
import crypto from 'node:crypto';

const URL = process.env.DATABASE_URL || 'file:.data/blinksub.db';
if (URL.startsWith('file:')) { try { fs.mkdirSync('.data', { recursive: true }); } catch {} }
const db = createClient({ url: URL, authToken: process.env.DATABASE_AUTH_TOKEN });

const id = () => (globalThis.crypto?.randomUUID?.() || 'id_' + Math.random().toString(36).slice(2));
const daysISO = (n) => new Date(Date.now() + n * 86400000).toISOString();
const minsISO = (n) => new Date(Date.now() - n * 60000).toISOString();

const DEFAULT_TIERS = [
  { id: 'free', name: 'Free', desc: 'Join the newsletter, no payment.', free: true, benefits: ['Free newsletter'], recommended: false },
  { id: 'supporter', name: 'Supporter', desc: 'Back the work each month.', display: 'sats',
    monthly: { sats: 1000 }, annual: { sats: 10000 }, benefits: ['Members-only updates'], recommended: true },
  { id: 'patron', name: 'Patron', desc: 'Underwrite the whole thing.', display: 'sats',
    monthly: { sats: 5000 }, annual: { sats: 50000 }, benefits: ['Everything in Supporter', 'Name in the credits'], recommended: false },
];

const DEMO_TIERS = [
  { id: 'free', name: 'Free', desc: 'Join the newsletter, no payment.', free: true, benefits: ['Free newsletter'], recommended: false },
  { id: 'supporter', name: 'Supporter', desc: 'Back the work each month.', display: 'sats', monthly: { sats: 1000 }, annual: { sats: 10000 }, benefits: ['Members-only posts', 'Community access'], recommended: false },
  { id: 'pro', name: 'Pro', desc: 'For the committed reader.', display: 'sats', monthly: { sats: 5000 }, annual: { sats: 50000 }, benefits: ['Everything in Supporter', 'Monthly call', 'Full archive'], recommended: true },
  { id: 'patron', name: 'Patron', desc: 'Underwrite the whole thing.', display: 'fiat', monthly: { usd: 2100 }, annual: { usd: 21000 }, benefits: ['Everything in Pro', 'Name in the credits'], recommended: false },
]

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
      webhook_url TEXT, webhook_secret TEXT, verified_at TEXT, manage_token TEXT, claim_hash TEXT,
      plan_paid_until TEXT, fee_hash TEXT, payout_username TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, contact TEXT, tier TEXT, sats INTEGER,
      cycle TEXT, kind TEXT, status TEXT DEFAULT 'active', next_due TEXT, paid_until TEXT,
      payment_hash TEXT, payment_request TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY, username TEXT, expected_sats INTEGER, started_at TEXT, status TEXT DEFAULT 'pending', payment_hash TEXT)`,
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, creator_id TEXT, type TEXT, who TEXT, detail TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
  ], 'write');
  try { await db.execute(`CREATE TABLE IF NOT EXISTS claims (\n    id TEXT PRIMARY KEY, username TEXT, expected_sats INTEGER, started_at TEXT, status TEXT DEFAULT 'pending', payment_hash TEXT)`); } catch {}
  for (const col of ['paid_until TEXT', 'payment_hash TEXT', 'payment_request TEXT', 'reminded INTEGER DEFAULT 0']) {
    try { await db.execute('ALTER TABLE subscriptions ADD COLUMN ' + col); } catch {}
  }
  for (const col of ['webhook_url TEXT', 'webhook_secret TEXT', 'verified_at TEXT', 'manage_token TEXT', 'claim_hash TEXT', 'plan_paid_until TEXT', 'fee_hash TEXT', 'payout_username TEXT']) {
    try { await db.execute('ALTER TABLE creators ADD COLUMN ' + col); } catch {}
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
  // create a neutral demo creator only (so /c/demo resolves). NO fake subscribers.
  await db.execute({
    sql: 'INSERT INTO creators (id, username, brand, pitch, tiers_json, payout_username) VALUES (?,?,?,?,?,?)',
    args: [id(), 'demo', 'Demo Newsletter',
      'This is an example subscribe page. Payments here go to the demo account, not a real creator.',
      JSON.stringify(DEMO_TIERS), 'bitcoinikorodu'],
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
    id: c.id, blink_username: c.username, payout_username: c.payout_username || c.username, demo: c.username === 'demo', brand: c.brand, pitch: c.pitch,
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
  return busy.rows[0]?.username || 'demo';
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
  const paidActive = subs.filter((s) => s.status === 'active' && s.kind !== 'free');
  const free = subs.filter((s) => s.kind === 'free').length;
  return {
    creator: { brand: c.brand, blink_username: c.username },
    stats: { active: paidActive.length, mrr: paidActive.reduce((a, s) => a + s.sats, 0), pastDue: subs.filter((s) => s.status === 'expired').length, free },
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
  const existingPaid = !!s.paid_until;
  const until = daysISO(s.cycle === 'annual' ? 365 : 30);
  await db.execute({
    sql: 'UPDATE subscriptions SET status = ?, paid_until = ?, next_due = ? WHERE id = ?',
    args: ['active', until, until, subId],
  });
  await db.execute({
    sql: 'INSERT INTO events (id, creator_id, type, who, detail, created_at) VALUES (?,?,?,?,?,?)',
    args: [id(), s.creator_id, 'invoice.paid', s.contact || 'subscriber', `${s.sats.toLocaleString?.() || s.sats} sats · ${s.tier}`, new Date().toISOString()],
  });
  const cr = (await db.execute({ sql: 'SELECT webhook_url, webhook_secret FROM creators WHERE id = ?', args: [s.creator_id] })).rows[0];
  if (cr && cr.webhook_url) signAndPost(cr.webhook_url, cr.webhook_secret, existingPaid ? 'subscription.renewed' : 'subscription.paid', { email: s.contact, tier: s.tier, sats: s.sats, cycle: s.cycle, paidUntil: until });
  await db.execute({ sql: 'UPDATE subscriptions SET reminded = 0 WHERE id = ?', args: [subId] });
  return { paidUntil: until };
}

export async function updateCreatorTiers(username, tiers) {
  const c = await findOrProvision(username);
  await db.execute({ sql: 'UPDATE creators SET tiers_json = ? WHERE id = ?', args: [JSON.stringify(tiers), c.id] });
  return { ok: true };
}

export async function addFreeMember({ username, email, tier }) {
  const c = await findOrProvision(username);
  const sid = id();
  await db.execute({
    sql: 'INSERT INTO subscriptions (id, creator_id, contact, tier, sats, cycle, kind, status) VALUES (?,?,?,?,?,?,?,?)',
    args: [sid, c.id, email || null, tier || 'Free', 0, 'none', 'free', 'active'],
  });
  await db.execute({
    sql: 'INSERT INTO events (id, creator_id, type, who, detail, created_at) VALUES (?,?,?,?,?,?)',
    args: [id(), c.id, 'subscription.created', email || 'new subscriber', `${tier || 'Free'} · free`, new Date().toISOString()],
  });
  return { ok: true, id: sid };
}


// ---- Advanced connector: signed webhooks, proof-of-ownership ----------------
function signAndPost(url, secret, event, data) {
  if (!url) return;
  const body = JSON.stringify({ event, data, ts: Date.now() });
  const sig = crypto.createHmac('sha256', secret || '').update(body).digest('hex');
  try {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Blink-Signature': sig }, body, keepalive: true }).catch(() => {});
  } catch {}
}
async function creatorRow(idOrUser, byUser) {
  const q = byUser ? 'SELECT * FROM creators WHERE username = ?' : 'SELECT * FROM creators WHERE id = ?';
  const r = await db.execute({ sql: q, args: [idOrUser] });
  return r.rows[0] || null;
}
export async function fireCreatorWebhook(creatorId, event, data) {
  const c = await creatorRow(creatorId, false);
  if (c && c.webhook_url) signAndPost(c.webhook_url, c.webhook_secret, event, data);
}


const FEE_SATS = 21;         // TEST price. Launch value: 21000 (change this one number).
const PLAN_DAYS = 36500;     // one-time unlock (~100 years). Not a monthly plan.
const PLATFORM_USERNAME = 'circularity';
function planActive(c) { return !!(c && c.plan_paid_until && new Date(c.plan_paid_until).getTime() > Date.now()); }
function newSecret() { return 'whsec_' + crypto.randomBytes(24).toString('hex'); }
function newToken() { return crypto.randomBytes(18).toString('hex'); }

// one-step ownership+payment: creator sends the fee FROM their username to @circularity.
// We read circularity's incoming tx (its own read-key) and confirm the sender's username.
export async function startOwnershipVerify(username) {
  await ensureReady();
  const u = String(username).toLowerCase().replace(/^@/, '');
  const cid = crypto.randomBytes(10).toString('hex');
  await db.execute({ sql: 'INSERT INTO claims (id, username, expected_sats, started_at, status) VALUES (?,?,?,?,?)', args: [cid, u, FEE_SATS, new Date().toISOString(), 'pending'] });
  return { claimId: cid, sats: FEE_SATS, payTo: PLATFORM_USERNAME, lnaddress: PLATFORM_USERNAME + '@blink.sv' };
}

export async function pollOwnershipVerify(claimId) {
  await ensureReady();
  const r = await db.execute({ sql: 'SELECT * FROM claims WHERE id = ?', args: [claimId] });
  const claim = r.rows[0];
  if (!claim) return { verified: false, error: 'Unknown verification session. Go back and start again.' };
  if (claim.status === 'done') return { verified: true, done: true };
  if (!process.env.CIRCULARITY_API_KEY) return { verified: false, error: 'Verification is not set up on this instance: add CIRCULARITY_API_KEY to .env.local and restart the server.' };

  let receives = [];
  try { receives = await getRecentReceives(process.env.CIRCULARITY_API_KEY, 50); }
  catch (e) { return { verified: false, error: 'Could not read the @circularity account with the platform key: ' + String(e.message) }; }

  const started = new Date(claim.started_at).getTime() - 120000; // bind to this claim (small clock-skew allowance)
  const claimant = String(claim.username).toLowerCase();

  // the only thing that verifies: an INTERNAL (Blink-to-Blink) payment FROM the claimed username, >= the fee, made since this claim began
  const good = receives.find((x) => x.via === 'intraledger' && x.from && String(x.from).toLowerCase() === claimant && x.sats >= Number(claim.expected_sats) && x.at >= started);
  if (!good) {
    // guide the user if they paid the wrong way (Lightning carries no sender, so it can't verify them)
    const ln = receives.find((x) => x.via !== 'intraledger' && x.sats >= Number(claim.expected_sats) && x.at >= started);
    if (ln) return { verified: false, error: 'A payment arrived over Lightning, which carries no sender, so we cannot confirm it was you. In your Blink app tap Send, choose the username @circularity, and send ' + claim.expected_sats + ' sats from @' + claim.username + '.' };
    return { pending: true };
  }

  const c = await findOrProvision(claim.username);
  const secret = c.webhook_secret || newSecret();
  const token = newToken();
  const until = new Date(Date.now() + PLAN_DAYS * 86400000).toISOString();
  await db.execute({ sql: 'UPDATE creators SET verified_at = ?, webhook_secret = ?, manage_token = ?, plan_paid_until = ? WHERE id = ?', args: [new Date().toISOString(), secret, token, until, c.id] });
  await db.execute({ sql: "UPDATE claims SET status = 'done' WHERE id = ?", args: [claimId] });
  return { verified: true, manageToken: token, secret, until };
}



// prove ownership by reading the account's own username with a read-only key. KEY IS NOT STORED.
export async function verifyByReadKey(username, apiKey) {
  let who = null;
  try { who = await whoAmI(apiKey); } catch (e) { return { verified: false, error: 'Could not read account with that key.' }; }
  if (!who || who.toLowerCase() !== String(username).toLowerCase().replace(/^@/, '')) {
    return { verified: false, error: 'That key does not belong to @' + username + '.' };
  }
  const c = await findOrProvision(who);
  const secret = c.webhook_secret || newSecret();
  const token = newToken();
  await db.execute({ sql: 'UPDATE creators SET verified_at = ?, webhook_secret = ?, manage_token = ? WHERE id = ?', args: [new Date().toISOString(), secret, token, c.id] });
  return { verified: true, manageToken: token, secret, plan: { paid: planActive(c), until: c.plan_paid_until || null }, fee: FEE_SATS };
  // apiKey is intentionally never persisted.
}

export async function startPlanPayment(username, token) {
  const c = await requireToken(username, token);
  if (!c) return null;
  const inv = await createInvoiceForUsername(PLATFORM_USERNAME, FEE_SATS, `Blink Subscriptions connector — @${username}`);
  await db.execute({ sql: 'UPDATE creators SET fee_hash = ? WHERE id = ?', args: [inv.paymentHash, c.id] });
  return { paymentRequest: inv.paymentRequest, hash: inv.paymentHash, sats: FEE_SATS };
}
export async function verifyPlanPayment(username, token) {
  const c = await requireToken(username, token);
  if (!c) return null;
  if (!c.fee_hash) return { paid: planActive(c) };
  const st = await invoiceStatusByHash(c.fee_hash);
  if (st !== 'PAID') return { paid: planActive(c), status: st };
  const until = new Date(Date.now() + PLAN_DAYS * 86400000).toISOString();
  await db.execute({ sql: 'UPDATE creators SET plan_paid_until = ? WHERE id = ?', args: [until, c.id] });
  return { paid: true, until };
}

// proof-of-ownership: pay a small invoice to your OWN username
export async function startOwnershipClaim(username) {
  const c = await findOrProvision(username);
  const inv = await createInvoiceForUsername(username, 21, `Verify ownership of @${username}`);
  await db.execute({ sql: 'UPDATE creators SET claim_hash = ? WHERE id = ?', args: [inv.paymentHash, c.id] });
  return { paymentRequest: inv.paymentRequest, hash: inv.paymentHash };
}
export async function verifyOwnership(username) {
  const c = await findOrProvision(username);
  if (!c.claim_hash) return { verified: false };
  const st = await invoiceStatusByHash(c.claim_hash);
  if (st !== 'PAID') return { verified: false, status: st };
  const secret = c.webhook_secret || 'whsec_' + crypto.randomBytes(24).toString('hex');
  const token = crypto.randomBytes(18).toString('hex');
  await db.execute({ sql: 'UPDATE creators SET verified_at = ?, webhook_secret = ?, manage_token = ? WHERE id = ?', args: [new Date().toISOString(), secret, token, c.id] });
  return { verified: true, manageToken: token, secret, webhookUrl: c.webhook_url || '' };
}
async function requireToken(username, token) {
  const c = await creatorRow(username, true);
  if (!c || !c.manage_token || c.manage_token !== token) return null;
  return c;
}
export async function getConnector(username, token) {
  const c = await requireToken(username, token);
  if (!c) return null;
  return { verified: !!c.verified_at, webhookUrl: c.webhook_url || '', secret: c.webhook_secret || '', plan: { paid: planActive(c), until: c.plan_paid_until || null }, fee: FEE_SATS };
}
export async function setWebhookUrl(username, token, url) {
  const c = await requireToken(username, token);
  if (!c) return null;
  if (!planActive(c)) return { error: 'plan_required' };
  await db.execute({ sql: 'UPDATE creators SET webhook_url = ? WHERE id = ?', args: [url || null, c.id] });
  return { ok: true };
}
export async function rotateSecret(username, token) {
  const c = await requireToken(username, token);
  if (!c) return null;
  const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');
  await db.execute({ sql: 'UPDATE creators SET webhook_secret = ? WHERE id = ?', args: [secret, c.id] });
  return { secret };
}
export async function sendTestEvent(username, token) {
  const c = await requireToken(username, token);
  if (!c) return null;
  if (!planActive(c)) return { error: 'plan_required' };
  signAndPost(c.webhook_url, c.webhook_secret, 'test.ping', { message: 'Hello from Blink Subscriptions', username });
  return { ok: !!c.webhook_url };
}

// scheduler: fire subscription.expiring for paid subs due within N days (once)
export async function runExpiringCheck(days = 3) {
  await ensureReady();
  const now = Date.now(), horizon = new Date(now + days * 86400000).toISOString(), nowISO = new Date(now).toISOString();
  const due = await db.execute({
    sql: "SELECT * FROM subscriptions WHERE kind != 'free' AND status = 'active' AND paid_until IS NOT NULL AND paid_until <= ? AND paid_until >= ? AND (reminded IS NULL OR reminded = 0)",
    args: [horizon, nowISO],
  });
  let fired = 0;
  for (const s of due.rows) {
    const c = await creatorRow(s.creator_id, false);
    if (c && c.webhook_url) { signAndPost(c.webhook_url, c.webhook_secret, 'subscription.expiring', { email: s.contact, tier: s.tier, expiresAt: s.paid_until }); fired++; }
    await db.execute({ sql: 'UPDATE subscriptions SET reminded = 1 WHERE id = ?', args: [s.id] });
  }
  return { fired, checked: due.rows.length };
}

export const LOCAL = URL.startsWith('file:');
