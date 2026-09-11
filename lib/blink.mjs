/**
 * blink.mjs — Blink API adapter.
 * Every call here is coded to the real public schema
 * (blinkbitcoin/blink core/api/src/graphql/public/schema.graphql), verified field-by-field.
 *
 * Auth: Blink API keys go in the `X-API-KEY` header. The key's scope + limits
 * (apiKeySetLimit monthlyLimitSats) are the subscriber's cap for the intraledger path.
 */

const BLINK_API = process.env.BLINK_API_URL || 'https://api.blink.sv/graphql';

async function gql(query, variables, apiKey) {
  const res = await fetch(BLINK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error('Blink GQL: ' + json.errors.map((e) => e.message).join('; '));
  return json.data;
}

/** Resolve a creator's default wallet id by username. currency: 'BTC' | 'USD'. */
export async function resolveWallet(username, currency = 'BTC') {
  const q = `query($u: Username!, $c: WalletCurrency) {
    accountDefaultWallet(username: $u, walletCurrency: $c) { id currency }
  }`;
  const d = await gql(q, { u: username, c: currency });
  return d.accountDefaultWallet; // { id, currency }
}

/** Current BTC/USD price for fiat-peg conversion. */
export async function getRealtimePrice(currency = 'USD') {
  const q = `query($c: DisplayCurrency) {
    realtimePrice(currency: $c) {
      timestamp
      btcSatPrice   { base offset }
      usdCentPrice  { base offset }
    }
  }`;
  const d = await gql(q, { c: currency });
  return d.realtimePrice;
}

/**
 * Mint an invoice ON BEHALF OF the creator (creator can be offline). BTC wallet only.
 * webhookUrl (optional): Blink POSTs it on settlement — push confirmation, no polling.
 * Returns { paymentRequest, paymentHash, satoshis }.
 */
export async function mintInvoiceForRecipient({ recipientWalletId, amountSats, memo, expiresIn = 60, webhookUrl }, apiKey) {
  const q = `mutation($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
    lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
      errors { message }
      invoice { paymentRequest paymentHash satoshis }
    }
  }`;
  const input = { recipientWalletId, amount: amountSats, memo, expiresIn, webhookUrl };
  const d = await gql(q, { input }, apiKey);
  const p = d.lnInvoiceCreateOnBehalfOfRecipient;
  if (p.errors?.length) throw new Error(p.errors.map((e) => e.message).join('; '));
  return p.invoice;
}

/**
 * Intraledger charge (Blink -> Blink), BTC. Uses the SUBSCRIBER's capped API key.
 * Returns PaymentSendResult: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ALREADY_PAID'.
 */
export async function intraLedgerSend({ walletId, recipientWalletId, amountSats, memo }, subscriberApiKey) {
  const q = `mutation($input: IntraLedgerPaymentSendInput!) {
    intraLedgerPaymentSend(input: $input) { status errors { message } }
  }`;
  const input = { walletId, recipientWalletId, amount: amountSats, memo };
  const d = await gql(q, { input }, subscriberApiKey);
  const p = d.intraLedgerPaymentSend;
  if (p.errors?.length) throw new Error(p.errors.map((e) => e.message).join('; '));
  return p.status;
}

/** Intraledger charge, USD (Dollar Account). amount is in CENTS. */
export async function intraLedgerUsdSend({ walletId, recipientWalletId, amountCents, memo }, subscriberApiKey) {
  const q = `mutation($input: IntraLedgerUsdPaymentSendInput!) {
    intraLedgerUsdPaymentSend(input: $input) { status errors { message } }
  }`;
  const input = { walletId, recipientWalletId, amount: amountCents, memo };
  const d = await gql(q, { input }, subscriberApiKey);
  const p = d.intraLedgerUsdPaymentSend;
  if (p.errors?.length) throw new Error(p.errors.map((e) => e.message).join('; '));
  return p.status;
}

/* ---- no-keys public flow (same calls the donation button uses) ---- */

/** Create an invoice for a creator by username. No API key — public API. */
export async function createInvoiceForUsername(username, amountSats, memo) {
  const wallet = await resolveWallet(username, 'BTC');           // public
  const invoice = await mintInvoiceForRecipient(                 // no apiKey => public
    { recipientWalletId: wallet.id, amountSats, memo, expiresIn: 3600 },
  );
  return { paymentRequest: invoice.paymentRequest, paymentHash: invoice.paymentHash };
}

/** Poll an invoice's status by hash. No API key — public API. Returns PAID|PENDING|EXPIRED. */
export async function invoiceStatusByHash(paymentHash) {
  const q = `query($input: LnInvoicePaymentStatusByHashInput!) {
    lnInvoicePaymentStatusByHash(input: $input) { status }
  }`;
  const d = await gql(q, { input: { paymentHash } });
  return d.lnInvoicePaymentStatusByHash?.status || 'PENDING';
}

/** Poll status by payment request. Blink's original, always-public invoice-status query. Returns PAID|PENDING|EXPIRED. */
export async function invoiceStatusByRequest(paymentRequest) {
  const q = `query($input: LnInvoicePaymentStatusInput!) {
    lnInvoicePaymentStatus(input: $input) { status }
  }`;
  const d = await gql(q, { input: { paymentRequest } });
  return d.lnInvoicePaymentStatus?.status || 'PENDING';
}

/**
 * Robust status check. Tries the by-request query first (the one that's always been
 * public and reflects on-behalf invoices reliably), then the by-hash query. PAID if
 * either confirms. Returns { status, byReq, byHash } so callers can log which fired.
 */
export async function invoiceStatus({ paymentHash, paymentRequest }) {
  let byReq = 'PENDING', byHash = 'PENDING';
  if (paymentRequest) { try { byReq = await invoiceStatusByRequest(paymentRequest); } catch (e) { byReq = 'ERR:' + e.message; } }
  if (byReq === 'PAID') return { status: 'PAID', byReq, byHash };
  if (paymentHash) { try { byHash = await invoiceStatusByHash(paymentHash); } catch (e) { byHash = 'ERR:' + e.message; } }
  if (byHash === 'PAID') return { status: 'PAID', byReq, byHash };
  const status = (byReq === 'EXPIRED' || byHash === 'EXPIRED') ? 'EXPIRED' : 'PENDING';
  return { status, byReq, byHash };
}

/**
 * Confirm payment by reading the RECIPIENT account's own transactions with a
 * read-only key, matching this invoice via initiationVia.paymentHash. Works for
 * Lightning AND Blink-to-Blink (intraledger), which the keyless status queries miss.
 */
export async function receivedByHash(apiKey, paymentHash, first = 50) {
  if (!apiKey || !paymentHash) return false;
  const q = `query { me { defaultAccount { transactions(first: ${first}) { edges { node {
    direction status
    initiationVia { __typename ... on InitiationViaLn { paymentHash } }
  } } } } }`;
  const d = await gql(q, {}, apiKey);
  const edges = d?.me?.defaultAccount?.transactions?.edges || [];
  return edges.some((e) => {
    const n = e.node || {};
    return n.direction === 'RECEIVE' && n.status === 'SUCCESS' && n.initiationVia?.paymentHash === paymentHash;
  });
}

/** Read the account's own username with a read-only API key. Ownership proof; key is never stored. */
export async function whoAmI(apiKey) {
  const d = await gql('query { me { username } }', {}, apiKey);
  return d?.me?.username || null;
}

/** Read recent incoming intraledger receives on the key's account, with the sender's username. */
export async function getRecentReceives(apiKey, first = 30) {
  const q = `query { me { defaultAccount { transactions(first: ${first}) { edges { node {
    createdAt direction settlementAmount
    settlementVia { __typename ... on SettlementViaIntraLedger { counterPartyUsername } }
  } } } } } }`;
  const d = await gql(q, {}, apiKey);
  const edges = d?.me?.defaultAccount?.transactions?.edges || [];
  return edges.map((e) => e.node)
    .filter((n) => n.direction === 'RECEIVE')
    .map((n) => {
      const raw = Number(n.createdAt);
      const at = !isNaN(raw) ? (raw < 1e12 ? raw * 1000 : raw) : (Date.parse(n.createdAt) || Date.now()); // Blink createdAt is Unix seconds
      return {
        sats: Math.abs(Number(n.settlementAmount)),
        via: n.settlementVia?.__typename === 'SettlementViaIntraLedger' ? 'intraledger' : 'ln',
        from: n.settlementVia?.counterPartyUsername || null,
        at,
      };
    });
}
