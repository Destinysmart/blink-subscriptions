/**
 * engine.mjs — the billing engine core.
 *
 * Reuses the fiat playbook (state machine, cycle loop, dunning-as-workflow,
 * entitlement events) and replaces only the payment primitive with Blink pulls.
 *
 * The `db` argument is a small repository interface you implement over Supabase
 * (supabase-js or pg). Required methods are listed in README.md. Keeping DB
 * access behind `db` keeps the engine storage-agnostic and unit-testable.
 */

import * as blink from './blink.mjs';
import { payInvoice as nwcPay } from './blink-nwc-collector.mjs';

// ---- state machine --------------------------------------------------------
export const STATES = ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
const TRANSITIONS = {
  trialing: ['active', 'past_due', 'canceled'],
  active: ['past_due', 'canceled', 'paused'],
  past_due: ['active', 'canceled', 'unpaid'],
  paused: ['active', 'canceled'],
  unpaid: ['active', 'canceled'],
  canceled: [],
};
export function canTransition(from, to) {
  return from === to || (TRANSITIONS[from] || []).includes(to);
}

// Reminder-based dunning schedule (days after first miss). No silent card retry
// exists in Bitcoin: for nwc/intraledger each step is a re-pull within budget;
// for the reminder mandate each step is a fresh notification. After the last
// step we terminate to `canceled` (or `unpaid` if you prefer to keep the record).
const DUNNING_DAYS = [0, 1, 3, 5];
const DUNNING_TERMINAL = 'canceled'; // or 'unpaid'

// ---- period math ----------------------------------------------------------
const UNIT_MS = { day: 86400000, week: 604800000 };
export function nextPeriodEnd(from, interval, count = 1) {
  const d = new Date(from);
  if (interval === 'month') d.setMonth(d.getMonth() + count);
  else if (interval === 'year') d.setFullYear(d.getFullYear() + count);
  else d.setTime(d.getTime() + UNIT_MS[interval] * count);
  return d;
}

// ---- fiat-peg quoting -----------------------------------------------------
// realtimePrice.btcSatPrice = price of ONE sat in minor units of the display
// currency, expressed as { base, offset }: value = base * 10^(-offset).
// So: sats = pricing_minor_units / (base * 10^-offset) = pricing_minor * 10^offset / base.
function priceOfOneSatInMinor(rt) {
  const { base, offset } = rt.btcSatPrice;
  return Number(base) * Math.pow(10, -offset); // minor units (e.g. USD cents) per sat
}

/**
 * Resolve what to actually charge, in settlement units.
 * Returns { amountSats?, amountCents?, rateUsed? }.
 */
export async function quote(price) {
  // BTC settlement
  if (price.settlement_currency === 'BTC') {
    if (price.rate_policy === 'fixed_settlement' && price.pricing_currency === 'BTC') {
      return { amountSats: Number(price.unit_amount) }; // unit_amount already in sats
    }
    // fixed_pricing: unit_amount is pricing_currency minor units -> convert to sats
    const rt = await blink.getRealtimePrice(price.pricing_currency);
    const minorPerSat = priceOfOneSatInMinor(rt);
    const amountSats = Math.round(Number(price.unit_amount) / minorPerSat);
    return { amountSats, rateUsed: minorPerSat };
  }
  // USD settlement (Dollar Account) — pricing is USD cents, no conversion
  return { amountCents: Number(price.unit_amount) };
}

// ---- collectors -----------------------------------------------------------
// Each returns { ok, ref } on success, or { ok:false, pending } / throws on failure.

async function collectIntraledger({ customer, creator, price, amount, memo }) {
  const cur = price.settlement_currency;
  const recipientWalletId =
    cur === 'USD' ? creator.recipient_wallet_usd : creator.recipient_wallet_btc;
  if (!recipientWalletId) throw new Error(`creator has no ${cur} wallet resolved`);
  const key = decrypt(customer.api_key_enc); // implement decrypt for your at-rest scheme
  let status;
  if (cur === 'USD') {
    status = await blink.intraLedgerUsdSend(
      { walletId: customer.subscriber_wallet_id, recipientWalletId, amountCents: amount.amountCents, memo },
      key
    );
  } else {
    status = await blink.intraLedgerSend(
      { walletId: customer.subscriber_wallet_id, recipientWalletId, amountSats: amount.amountSats, memo },
      key
    );
  }
  if (status === 'SUCCESS' || status === 'ALREADY_PAID') return { ok: true, ref: status };
  if (status === 'PENDING') return { ok: false, pending: true };
  return { ok: false }; // FAILURE
}

async function collectNwc({ customer, creator, price, amount, memo, webhookUrl }) {
  // NWC path settles over Lightning: mint the creator's invoice, then pay it via NIP-47.
  const invoice = await blink.mintInvoiceForRecipient(
    { recipientWalletId: creator.recipient_wallet_btc, amountSats: amount.amountSats, memo, webhookUrl },
    process.env.BLINK_PLATFORM_KEY // a receive/read key is enough to mint on behalf of recipient
  );
  const uri = decrypt(customer.nwc_uri_enc);
  const { preimage } = await nwcPay(uri, invoice.paymentRequest);
  return { ok: !!preimage, ref: preimage, invoice };
}

async function collectReminder({ subscription, price, amount, creator, emit }) {
  // No auto-pull. Mint an invoice the payer can settle, notify them, and wait.
  // Settlement arrives out-of-band via Blink's invoice webhook -> markInvoicePaid().
  const invoice = await blink.mintInvoiceForRecipient(
    {
      recipientWalletId: creator.recipient_wallet_btc,
      amountSats: amount.amountSats,
      memo: `Renewal — ${creator.blink_username}`,
      webhookUrl: process.env.SETTLEMENT_WEBHOOK_URL,
    },
    process.env.BLINK_PLATFORM_KEY
  );
  await emit('invoice.reminder', { subscription_id: subscription.id, paymentRequest: invoice.paymentRequest });
  return { ok: false, pending: true, invoice };
}

const COLLECTORS = {
  intraledger: collectIntraledger,
  nwc: collectNwc,
  reminder: collectReminder,
};

// ---- the billing cycle ----------------------------------------------------
/**
 * Run one billing pass. Call on a schedule (e.g. every 5 min via cron / Supabase
 * scheduled function). Picks up every subscription whose next action is due.
 */
export async function runCycle(db, { now = new Date() } = {}) {
  const due = await db.dueSubscriptions(now); // status in (active,past_due) AND (period_end<=now OR next_attempt_at<=now)
  for (const sub of due) {
    try {
      await chargeOne(db, sub, now);
    } catch (err) {
      await db.log?.('cycle_error', { subscription_id: sub.id, error: String(err.message) });
    }
  }
}

async function chargeOne(db, sub, now) {
  const price = await db.getPrice(sub.price_id);
  const customer = await db.getCustomer(sub.customer_id);
  const creator = await db.getCreator(sub.creator_id);
  const emit = (type, payload) => db.enqueueEvent({ type, subscription_id: sub.id, payload });

  const amount = await quote(price);
  const memo = `Subscription ${sub.id.slice(0, 8)}`;
  const invoiceRow = await db.createInvoice({
    subscription_id: sub.id,
    status: 'open',
    amount_sats: amount.amountSats ?? null,
    amount_cents: amount.amountCents ?? null,
    pricing_amount: price.unit_amount,
    pricing_currency: price.pricing_currency,
    rate_used: amount.rateUsed ?? null,
    period_start: sub.current_period_end,
    period_end: nextPeriodEnd(sub.current_period_end, price.interval, price.interval_count),
  });

  const collector = COLLECTORS[customer.mandate_kind];
  const result = await collector({
    subscription: sub, customer, creator, price, amount, memo,
    webhookUrl: process.env.SETTLEMENT_WEBHOOK_URL, emit,
  });

  if (result.ok) {
    await onPaid(db, sub, price, invoiceRow, result);
  } else if (result.pending) {
    // reminder mandate, or PENDING intraledger — leave open, settlement confirms later
    await db.updateSubscription(sub.id, {
      status: 'past_due',
      next_attempt_at: addDays(now, 1),
    });
  } else {
    await onFailed(db, sub, invoiceRow, now, emit);
  }
}

async function onPaid(db, sub, price, invoiceRow, result) {
  await db.updateInvoice(invoiceRow.id, {
    status: 'paid', paid_at: new Date(),
    payment_hash: result.invoice?.paymentHash ?? null,
    payment_request: result.invoice?.paymentRequest ?? null,
  });
  const newEnd = nextPeriodEnd(sub.current_period_end, price.interval, price.interval_count);
  await db.updateSubscription(sub.id, {
    status: 'active',
    current_period_start: sub.current_period_end,
    current_period_end: newEnd,
    next_attempt_at: newEnd,          // next action is the next renewal
    dunning_attempts: 0,
  });
  await db.enqueueEvent({ type: 'invoice.paid', subscription_id: sub.id, invoice_id: invoiceRow.id, payload: { ref: result.ref } });
  await db.enqueueEvent({ type: 'subscription.renewed', subscription_id: sub.id, payload: { period_end: newEnd } });
}

async function onFailed(db, sub, invoiceRow, now, emit) {
  const attempt = sub.dunning_attempts + 1;
  await db.updateInvoice(invoiceRow.id, { status: 'open' });
  await emit('invoice.payment_failed', { subscription_id: sub.id, attempt });

  if (attempt >= DUNNING_DAYS.length) {
    await db.updateInvoice(invoiceRow.id, { status: 'uncollectible' });
    await db.updateSubscription(sub.id, { status: DUNNING_TERMINAL, canceled_at: new Date(), next_attempt_at: null });
    await db.enqueueEvent({ type: 'subscription.canceled', subscription_id: sub.id, payload: { reason: 'dunning_exhausted' } });
    return;
  }
  await db.updateSubscription(sub.id, {
    status: 'past_due',
    dunning_attempts: attempt,
    next_attempt_at: addDays(now, DUNNING_DAYS[attempt] - DUNNING_DAYS[attempt - 1]),
  });
  await db.enqueueEvent({ type: 'subscription.past_due', subscription_id: sub.id, payload: { attempt } });
}

/**
 * Called by your Blink settlement webhook handler when an invoice is paid
 * out-of-band (reminder mandate, or a PENDING intraledger that later settles).
 */
export async function markInvoicePaid(db, paymentHash) {
  const invoiceRow = await db.getInvoiceByHash(paymentHash);
  if (!invoiceRow || invoiceRow.status === 'paid') return; // idempotent
  const sub = await db.getSubscription(invoiceRow.subscription_id);
  const price = await db.getPrice(sub.price_id);
  await onPaid(db, sub, price, invoiceRow, { invoice: { paymentHash } });
}

// ---- helpers you wire to your infra --------------------------------------
function addDays(d, n) { return new Date(new Date(d).getTime() + n * 86400000); }

// Replace with your at-rest decryption (Supabase Vault / pgsodium / KMS).
function decrypt(enc) {
  if (process.env.NODE_ENV === 'production') throw new Error('implement decrypt() before production');
  return enc; // dev only
}
