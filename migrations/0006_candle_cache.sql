-- Local candle cache, so screening reads from storage instead of the broker.
--
-- Why this exists: screening across a real universe is impossible against the live
-- API. Angel One's historical endpoint is rate-limited to ~1 req/sec, and the
-- security master holds 9,862 NSE equities alone — roughly 3.3 hours to walk once.
-- A screen has to read a cache built ahead of time; the alternative is a screener
-- capped at a couple of dozen instruments, which is not a screener.
--
-- NOT a TimescaleDB hypertable: timescaledb is not actually installed on this
-- instance (only pgcrypto is available), despite CLAUDE.md's Stack section claiming
-- it. Plain Postgres is entirely adequate at this size — a few thousand instruments
-- times a few hundred daily bars is low single-digit millions of rows — so this uses
-- a normal table with a covering index rather than pretending an extension is there.
-- If timescaledb is installed later, this table can become a hypertable without a
-- schema change.

create table candle (
  instrument_id uuid not null references instrument(instrument_id),
  -- Kept as text rather than an enum: the canonical CandleInterval union already
  -- constrains this in the application, and an enum would need a migration to add
  -- an interval the broker already supports.
  interval text not null,
  ts timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (instrument_id, interval, ts)
);

-- The screener's only access pattern: "latest N closes for this instrument at this
-- interval", newest first.
create index candle_lookup_idx on candle (instrument_id, interval, ts desc);

-- What the cache actually holds, per instrument. Without this, "no candles" is
-- ambiguous between "never fetched", "fetched and genuinely empty" and "fetch
-- failed" — three different answers that must not be collapsed, and the difference
-- between an honest coverage report and one that implies a full-market scan that
-- never happened.
create table candle_coverage (
  instrument_id uuid not null references instrument(instrument_id),
  interval text not null,
  first_ts timestamptz,
  last_ts timestamptz,
  candle_count integer not null default 0,
  last_fetch_at timestamptz,
  -- OK | EMPTY | FAILED — EMPTY is a successful fetch that returned no bars (a
  -- suspended or newly listed scrip), which is a real answer, not a failure.
  last_fetch_status text,
  last_fetch_detail text,
  primary key (instrument_id, interval)
);

-- Lets the backfill worker resume: "what haven't we tried recently", cheaply.
create index candle_coverage_staleness_idx on candle_coverage (interval, last_fetch_at nulls first);

-- Cached market data is refreshed in place — the same trading day's bar can be
-- re-fetched and corrected by the exchange, so unlike audit_log or trade this is
-- deliberately NOT append-only and does need UPDATE.
grant select, insert, update on candle, candle_coverage to app_user;
