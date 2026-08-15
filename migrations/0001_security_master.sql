-- Security Master (spec §18) — see docs/design/security-master.md for rationale.
-- Untested against a live database — no Postgres instance is available in this
-- environment to run it against. Reviewed by hand against the design doc and the
-- verified Angel One field shapes, not executed.

create extension if not exists pgcrypto;

-- Immutable identity. Never updated except to correct a data-entry error.
create table instrument (
  instrument_id uuid primary key default gen_random_uuid(),
  instrument_type text not null check (instrument_type in ('EQUITY', 'ETF', 'FUTURES', 'OPTIONS', 'INDEX')),
  -- Equities/ETFs only. Derivatives contracts have no ISIN in the Indian market
  -- structure — null here means "not applicable," not "unknown."
  isin text,
  exchange text not null,
  underlying_instrument_id uuid references instrument (instrument_id),
  expiry date,
  strike numeric,
  option_type text check (option_type in ('CE', 'PE')),
  created_at timestamptz not null default now(),
  constraint isin_only_for_cash_instruments
    check (instrument_type in ('EQUITY', 'ETF') or isin is null),
  constraint derivative_fields_only_for_derivatives
    check (
      (instrument_type in ('FUTURES', 'OPTIONS'))
      or (expiry is null and strike is null and option_type is null)
    )
);

-- Point-in-time attributes (spec §93.1). A lot-size revision gets a new row here,
-- not an update to the old one — see docs/design/security-master.md.
create table instrument_version (
  instrument_version_id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instrument (instrument_id),
  trading_symbol text not null,
  lot_size integer not null,
  contract_multiplier numeric not null,
  tick_size numeric not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  source text not null,
  last_verified_date date not null,
  constraint effective_range_valid check (effective_to is null or effective_to > effective_from)
);

-- One currently-effective version per instrument.
create unique index instrument_version_current_uidx
  on instrument_version (instrument_id)
  where effective_to is null;

create index instrument_version_lookup_idx
  on instrument_version (instrument_id, effective_from, effective_to);

-- The adapter boundary artifact (broker-adapters.md: "no broker-specific type, field
-- name, or error code may cross the adapter boundary"). broker_instrument_token and
-- broker_trading_symbol are promoted to real columns — not left in the jsonb blob —
-- because the Angel One verification pass confirmed these are exactly what
-- InstrumentResolver needs to look up on (see src/core/instrument-resolver.ts):
-- some records only carry a token, others (the trade book) only carry a symbol.
-- broker_native_attributes stays jsonb for genuinely incidental fields
-- (exch_seg, instrumenttype, tick_size, is_cas_enabled, ...).
create table broker_instrument_mapping (
  mapping_id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instrument (instrument_id),
  broker text not null,
  -- Nullable: Angel One's own order-book responses can have a null symboltoken on
  -- some rows, and the trade book has no token field at all (verified absent from
  -- the documented response shape).
  broker_instrument_token text,
  broker_trading_symbol text not null,
  exchange text not null,
  broker_native_attributes jsonb not null default '{}',
  effective_from timestamptz not null,
  effective_to timestamptz,
  last_verified_date date not null,
  constraint effective_range_valid check (effective_to is null or effective_to > effective_from)
);

create unique index broker_instrument_mapping_token_uidx
  on broker_instrument_mapping (broker, broker_instrument_token)
  where effective_to is null and broker_instrument_token is not null;

create unique index broker_instrument_mapping_symbol_uidx
  on broker_instrument_mapping (broker, exchange, broker_trading_symbol)
  where effective_to is null;
