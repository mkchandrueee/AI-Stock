-- Canonical account data (spec §4) — persistence for the types in src/core/types.ts.
-- Verified against the real trading_platform database, 2026-08-15 (see
-- docs/design/sync-service.md).

-- One row per connected broker account. The accountId the rest of the platform uses.
create table account (
  account_id uuid primary key default gen_random_uuid(),
  broker text not null,
  broker_account_ref text not null,
  display_name text not null,
  exchanges text[] not null,
  products text[] not null,
  created_at timestamptz not null default now(),
  unique (broker, broker_account_ref)
);

-- Latest-observed snapshot per (account, instrument) — ordinary sync overwrites this
-- as holdings legitimately change. This is NOT where a reconciliation mismatch gets
-- resolved; comparing this against a fresh broker read is reconciliation's job,
-- not persistence's (spec §13 — never silently overwrite on a *mismatch*, which is a
-- different thing from a normal snapshot update).
create table holding (
  account_id uuid not null references account (account_id),
  instrument_id uuid not null references instrument (instrument_id),
  quantity numeric not null,
  t1_quantity numeric not null,
  average_price numeric not null,
  last_traded_price numeric not null,
  current_value numeric not null,
  unrealized_pnl numeric not null,
  product text not null,
  broker_native jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (account_id, instrument_id)
);

create table position (
  account_id uuid not null references account (account_id),
  instrument_id uuid not null references instrument (instrument_id),
  product text not null,
  net_quantity numeric not null,
  day_buy_quantity numeric not null,
  day_sell_quantity numeric not null,
  average_price numeric not null,
  unrealized_pnl numeric not null,
  broker_native jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (account_id, instrument_id, product)
);

-- Append-only, unlike holding/position — funds change constantly and history is cheap
-- and potentially audit-relevant, matching the point-in-time posture already used for
-- instrument_version rather than a single overwritten row.
create table funds_snapshot (
  funds_snapshot_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account (account_id),
  as_of timestamptz not null,
  available_cash numeric not null,
  utilised_margin numeric not null,
  collateral numeric not null,
  net numeric not null,
  broker_native jsonb not null,
  synced_at timestamptz not null default now()
);

create index funds_snapshot_account_asof_idx on funds_snapshot (account_id, as_of desc);

-- One row per broker order, updated in place as status changes (an order has one
-- current status at a time) — "order" is a reserved word, hence broker_order.
create table broker_order (
  account_id uuid not null references account (account_id),
  broker_order_id text not null,
  instrument_id uuid not null references instrument (instrument_id),
  transaction_type text not null check (transaction_type in ('BUY', 'SELL')),
  quantity numeric not null,
  filled_quantity numeric not null,
  price numeric,
  trigger_price numeric,
  status text not null,
  broker_native_status text not null,
  origin text not null check (origin = 'EXTERNAL'),
  placed_at timestamptz not null,
  updated_at timestamptz not null,
  broker_native jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (account_id, broker_order_id)
);

-- A fill is an immutable historical fact — insert-only, never updated.
create table trade (
  account_id uuid not null references account (account_id),
  broker_trade_id text not null,
  broker_order_id text not null,
  instrument_id uuid not null references instrument (instrument_id),
  transaction_type text not null check (transaction_type in ('BUY', 'SELL')),
  quantity numeric not null,
  price numeric not null,
  traded_at timestamptz not null,
  broker_native jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (account_id, broker_trade_id)
);
