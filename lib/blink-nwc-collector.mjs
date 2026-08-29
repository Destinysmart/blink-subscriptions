/**
 * blink-nwc-collector.mjs — the "pull" that makes Bitcoin subscriptions work
 * --------------------------------------------------------------------------
 * Proves the one assumption the whole recurring model rests on: that an external
 * service, given a Blink NWC connectionUri, can pull a payment via NIP-47.
 *
 * This is the collector strategy behind the billing engine. The engine generates
 * the creator's invoice each cycle, then calls payInvoice() here to pull it from
 * the subscriber's Blink wallet — within the cap the subscriber set on the API
 * key backing the connection. No standing custody primitive; the subscriber holds
 * a revocable, capped NWC connection and can kill it any time.
 *
 * Coded against Blink's actual NWC implementation (blinkbitcoin/blink-nwc):
 *   event kinds  : InfoEvent 13194, Request 23194, Response 23195   (event-kinds.ts)
 *   encryption   : NIP-44 preferred, NIP-04 legacy fallback         (encryption.ts)
 *   method       : pay_invoice                                      (nip47-method.ts)
 *
 * Deps: nostr-tools, ws
 *
 * ── How the subscriber creates the connection (one-time, in your onboarding) ──
 *   1. apiKeyCreate            -> get an API key (scope: write)
 *   2. apiKeySetLimit          -> monthlyLimitSats = the subscription cap
 *   3. nwcConnectionCreate     -> { walletId, apiKey, permissions: [PAY_INVOICE],
 *                                   walletCurrency: BTC|USD, expiresAt? }
 *                                 returns connectionUri  <-- hand this to the engine
 *   cancel = nwcConnectionRevoke / apiKeyRemoveLimit / delete the key
 *
 * ── Usage ──
 *   node blink-nwc-collector.mjs "<nostr+walletconnect://...>" "<bolt11 invoice>"
 *   or:  import { payInvoice } from './blink-nwc-collector.mjs'
 */

import { finalizeEvent, getPublicKey, nip04, nip44 } from 'nostr-tools';
import WebSocket from 'ws';

const KIND_REQUEST = 23194;
const KIND_RESPONSE = 23195;

const hexToBytes = (hex) => {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return a;
};

/** Parse a nostr+walletconnect:// URI into its parts. */
export function parseNwcUri(uri) {
  const u = new URL(uri.replace(/^nostr\+walletconnect:\/\//, 'https://'));
  const walletPubkey = u.hostname || u.pathname.replace(/\//g, '');
  const relay = u.searchParams.get('relay');
  const secret = u.searchParams.get('secret');
  if (!walletPubkey || !relay || !secret) {
    throw new Error('Invalid NWC URI: need wallet pubkey, relay, and secret');
  }
  return { walletPubkey, relay, secret };
}

function encryptContent(secretHex, walletPubkey, plaintext, scheme) {
  if (scheme === 'nip04') return nip04.encrypt(secretHex, walletPubkey, plaintext);
  const key = nip44.getConversationKey(hexToBytes(secretHex), walletPubkey);
  return nip44.encrypt(plaintext, key);
}
function decryptContent(secretHex, walletPubkey, ciphertext, scheme) {
  if (scheme === 'nip04') return nip04.decrypt(secretHex, walletPubkey, ciphertext);
  const key = nip44.getConversationKey(hexToBytes(secretHex), walletPubkey);
  return nip44.decrypt(ciphertext, key);
}

/**
 * Pull a payment: pay `bolt11` from the wallet behind `connectionUri`.
 * Resolves { preimage } on success, rejects with the NIP-47 error otherwise.
 *
 * @param {string} connectionUri  Blink NWC connectionUri (from nwcConnectionCreate)
 * @param {string} bolt11         the creator's invoice for this cycle
 * @param {object} [opts]         { encryption: 'nip44'|'nip04', timeoutMs: 30000 }
 */
export function payInvoice(connectionUri, bolt11, opts = {}) {
  const { walletPubkey, relay, secret } = parseNwcUri(connectionUri);
  const scheme = opts.encryption || 'nip44'; // Blink prefers nip44; use nip04 only for legacy connections
  const timeoutMs = opts.timeoutMs || 30000;
  const secretBytes = hexToBytes(secret);
  const clientPubkey = getPublicKey(secretBytes);

  const request = {
    kind: KIND_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', walletPubkey], ['encryption', scheme]],
    content: encryptContent(secret, walletPubkey, JSON.stringify({
      method: 'pay_invoice',
      params: { invoice: bolt11 },
    }), scheme),
  };
  const signed = finalizeEvent(request, secretBytes);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relay);
    const subId = 'nwc-' + signed.id.slice(0, 8);
    const timer = setTimeout(() => { cleanup(); reject(new Error('NWC pay_invoice timed out')); }, timeoutMs);
    function cleanup() { clearTimeout(timer); try { ws.close(); } catch {} }

    ws.on('open', () => {
      // listen for the wallet's response referencing our request, then publish it
      ws.send(JSON.stringify(['REQ', subId, {
        kinds: [KIND_RESPONSE], authors: [walletPubkey], '#e': [signed.id], limit: 1,
      }]));
      ws.send(JSON.stringify(['EVENT', signed]));
    });

    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg[0] !== 'EVENT' || msg[1] !== subId) return;
      const ev = msg[2];
      let payload;
      try {
        payload = JSON.parse(decryptContent(secret, walletPubkey, ev.content, scheme));
      } catch (e) {
        // if a legacy connection replied with the other scheme, retry decrypt once
        try {
          payload = JSON.parse(decryptContent(secret, walletPubkey, ev.content, scheme === 'nip44' ? 'nip04' : 'nip44'));
        } catch { cleanup(); return reject(new Error('Could not decrypt NWC response')); }
      }
      cleanup();
      if (payload.error) return reject(new Error(`${payload.error.code}: ${payload.error.message}`));
      resolve({ preimage: payload.result?.preimage, raw: payload.result });
    });

    ws.on('error', (err) => { cleanup(); reject(err); });
  });
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , uri, invoice] = process.argv;
  if (!uri || !invoice) {
    console.error('Usage: node blink-nwc-collector.mjs "<nwc-uri>" "<bolt11>"');
    process.exit(1);
  }
  payInvoice(uri, invoice)
    .then((r) => { console.log('PAID ✓ preimage:', r.preimage); process.exit(0); })
    .catch((e) => { console.error('FAILED ✗', e.message); process.exit(1); });
}
