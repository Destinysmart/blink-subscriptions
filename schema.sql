-- ===========================================================================
-- blink-billing — schema.sql
-- A Bitcoin/Lightning-native subscription billing engine, Stripe-shaped.
--
-- The object model (Product -> Price -> Subscription -> Invoice -> Event) and
-- the lifecycle state machine come straight from how fiat billing systems work.
-- The Bitcoin-native parts are: (1) a mandate that is a user-authorized,
-- capped, revocable pull (NWC connection or capped API key) instead of a stored
-- card, and (2) a pricing_currency vs settlement_currency split so a "$10/mo"
-- price can be re-quoted to sats each cycle via Blink's realtimePrice oracle.
--
-- Target: Postgres (Supabase). Secrets (api_key, nwc_uri) MUST be encrypted at
-- rest — use Supabase Vault / pgsodium or application-level encryption. The
-- plaintext columns below are placeholders; do not store raw secrets in prod.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---- enums ----------------------------------------------------------------
create type settlement_currency as enum ('BTC', 'USD');   -- which Blink wallet settles the charge
create type price_interval      as enum ('day', 'week', 'month', 'year');

-- fixed_settlement : charge a fixed sats (BTC) or cents (USD) amount; fiat value floats
-- fixed_pricing    : charge a fixed pricing-currency amount, re-quoted to settlement each cycle
create type rate_policy as enum ('fixed_settlement', 'fixed_pricing');

-- the mandate type = how we pull. Descending fidelity, per the research.
--   intraledger : Blink->Blink via a capped API key the subscriber issued (instant, free)
--   nwc         : NIP-47 pay_invoice over a budgeted NWC connection (standard, revocable)
--   reminder    : no auto-pull; we notify and the subscriber pays each cycle
create type mandate_kind as enum ('intraledger', 'nwc', 'reminder');

-- Stripe's status enum, trimmed to what applies without card rails
create type sub_status as enum ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');
create type invoice_status as enum ('draft', 'open', 'paid', 'uncollectible', 'void');

-- ---- creators (the recipients earning recurring income) --------------------
create table creators (
  id                   uuid primary key default gen_random_uuid(),
  blink_username       text not null unique,
  -- resolved once via accountDefaultWallet(username, BTC|USD); cache to avoid re-resolving
  recipient_wallet_btc text,
  recipient_wallet_usd text,
  webhook_url          text,                    -- creator's endpoint for entitlement events
  webhook_secret       text,                    -- HMAC signing secret for outbound events
  created_at           timestamptz not null default now()
);

-- ---- products & prices (creator-owned catalog) ----------------------------
create table products (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table prices (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id) on delete cascade,
  -- money mechanics
  pricing_currency    text not null default 'USD',      -- currency the amount is denominated in (e.g. USD, or 'BTC')
  unit_amount         bigint not null,                  -- minor units of pricing_currency (USD cents), or sats if pricing_currency='BTC'
  settlement_currency settlement_currency not null,     -- which Blink wallet the charge settles in
  rate_policy         rate_policy not null default 'fixed_pricing',
  interval            price_interval not null default 'month',
  interval_count      int not null default 1,
  trial_days          int not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ---- customers (payers) + their mandate -----------------------------------
create table customers (
  id                  uuid primary key default gen_random_uuid(),
  blink_username      text,                              -- optional, for display / intraledger memo
  subscriber_wallet_id text,                             -- sender wallet (intraledger path)
  contact             text,                              -- email / npub / lnaddress for reminders
  mandate_kind        mandate_kind not null,
  -- SECRETS — encrypt at rest (Vault/pgsodium). Never log.
  api_key_enc         text,                              -- capped write key (intraledger path)
  nwc_uri_enc         text,                              -- NWC connectionUri (nwc path)
  monthly_cap_sats    bigint,                            -- mirror of the cap set on the key/connection
  created_at          timestamptz not null default now()
);

-- ---- subscriptions (the state machine lives here) -------------------------
create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references customers(id) on delete cascade,
  price_id              uuid not null references prices(id),
  creator_id            uuid not null references creators(id),
  status                sub_status not null default 'active',
  -- billing cycle
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz not null,
  cancel_at_period_end  boolean not null default false,
  canceled_at           timestamptz,
  -- dunning (reminder-based; see research — no silent card retry exists in BTC)
  next_attempt_at       timestamptz,                     -- when the billing runner should next act
  dunning_attempts      int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on subscriptions (status, next_attempt_at);
create index on subscriptions (current_period_end);

-- ---- invoices (one per cycle attempt) -------------------------------------
create table invoices (
  id                 uuid primary key default gen_random_uuid(),
  subscription_id    uuid not null references subscriptions(id) on delete cascade,
  status             invoice_status not null default 'draft',
  -- what we intended to collect
  amount_sats        bigint,                              -- settlement amount (BTC path)
  amount_cents       bigint,                              -- settlement amount (USD path)
  pricing_amount     bigint not null,                     -- original pricing_currency minor units
  pricing_currency   text not null,
  rate_used          numeric,                             -- sats-per-pricing-unit at quote time (fixed_pricing)
  -- lightning artifacts (nwc / reminder paths)
  payment_request    text,
  payment_hash       text,
  -- settlement
  paid_at            timestamptz,
  period_start       timestamptz not null,
  period_end         timestamptz not null,
  created_at         timestamptz not null default now()
);
create index on invoices (subscription_id);
create unique index on invoices (payment_hash) where payment_hash is not null;

-- ---- events (outbound webhook queue; entitlement source of truth) ---------
-- Mirrors the fiat pattern: creators gate access on these, not on any redirect.
create type event_type as enum (
  'subscription.created', 'subscription.renewed', 'subscription.past_due',
  'subscription.canceled', 'invoice.paid', 'invoice.payment_failed',
  'invoice.reminder'
);
create table events (
  id              uuid primary key default gen_random_uuid(),
  type            event_type not null,
  subscription_id uuid references subscriptions(id) on delete cascade,
  invoice_id      uuid references invoices(id) on delete set null,
  payload         jsonb not null default '{}',
  delivered       boolean not null default false,
  attempts        int not null default 0,
  created_at      timestamptz not null default now()
);
create index on events (delivered, created_at);
