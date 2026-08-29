# blink-billing

Bitcoin/Lightning-native subscriptions on Blink — a billing engine plus a creator **subscribe page** and **dashboard**, as one Next.js app you can deploy to Vercel or run locally.

It runs in **demo mode out of the box**: with no environment variables set, the pages render with sample data so you can preview everything immediately. Add Blink + Supabase keys to go live.

## Preview locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Pages:
- `/` landing
- `/c/destiny_smart` a creator subscribe page (pick a tier, choose a mandate, subscribe)
- `/dashboard` the creator dashboard (subscribers, MRR in sats, past-due, event feed)

## Deploy to Vercel

Push to GitHub, then in Vercel: **New Project → import the repo → Deploy**. No env vars needed for the demo preview. The `vercel.json` cron calls `/api/cron/cycle` every 5 minutes (no-ops until you add Supabase).

Or from the CLI:

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production
```

## Go live

Set these in Vercel (or `.env.local` for localhost) — see `.env.example`:

```
SUPABASE_URL=...            # presence of this flips the app out of demo mode
SUPABASE_SERVICE_KEY=...
BLINK_API_URL=https://api.blink.sv/graphql
BLINK_PLATFORM_KEY=...
SETTLEMENT_WEBHOOK_URL=https://<your-vercel-domain>/api/webhooks/blink-settlement
CRON_SECRET=...            # Vercel Cron sends this as a Bearer token
```

Then apply `schema.sql` to your Supabase project and implement the live reads in `lib/data.js` (the demo path shows the exact shape).

## What's inside

```
app/
  page.jsx                              landing
  c/[username]/page.jsx + subscribe-panel.jsx   subscribe flow
  dashboard/page.jsx                    creator dashboard
  api/cron/cycle/route.js               billing tick (runCycle + deliverEvents)
  api/webhooks/blink-settlement/route.js  markInvoicePaid
lib/
  engine.mjs        state machine, fiat-peg quoting, collectors, dunning
  blink.mjs         Blink GraphQL adapter (verified shapes)
  blink-nwc-collector.mjs   NIP-47 pay_invoice client
  deliver.mjs       signed entitlement events to creator webhooks
  db/supabase.mjs   storage layer
  data.js           demo data vs live Supabase reads
schema.sql          Postgres/Supabase schema
vercel.json         cron
```

The engine is the same verified core from the backend build: Stripe-shaped objects, three collectors (intraledger → NWC → reminder), reminder-based dunning, and `pricing_currency` / `settlement_currency` / `rate_policy` so a `$21/mo` price re-quotes to sats each cycle via Blink's `realtimePrice`.

## Before production

- Implement `decrypt()` in `lib/engine.mjs` against Supabase Vault / pgsodium.
- Verify Blink's webhook signature in the settlement route.
- Confirm the `btcSatPrice { base, offset }` conversion in `lib/engine.mjs` against a known amount.
- Fill in the live reads in `lib/data.js`.
