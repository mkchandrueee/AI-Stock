# Security Master — design (spec §18)

Status: **DRAFT — for review.** Not implemented. No broker-specific field names below
have been verified against Angel One's current docs (that's a separate, later step);
this schema is deliberately broker-agnostic so it doesn't have to change once verification
happens — only the adapter's mapping population does.

## Why three tables, not one

§18 requires two things that pull in different directions:

- A **stable identity** for an instrument that adapters, orders, positions and journal
  entries can all reference without caring which broker sourced it.
- **Point-in-time correctness** for attributes that change over time without the
  instrument itself changing — lot size revisions, symbol changes, contract spec
  amendments (§18, §59 "Certification expires ... lot size revision").

A single flat table can't do both: if `lot_size` lives directly on the instrument row,
a lot-size revision either silently rewrites history (a past trade now shows the wrong
lot size) or forces a new instrument identity for something that didn't actually change
identity. So identity and time-varying attributes are split.

## 1. `instrument` — immutable identity

One row per distinct tradeable instrument, forever. Never updated except to correct a
data-entry error; never deleted.

| Column | Type | Notes |
|---|---|---|
| `instrument_id` | UUID, PK | Internal canonical ID. This is the only ID the rest of the platform ever sees (spec §4). |
| `instrument_type` | enum | `EQUITY`, `ETF`, `FUTURES`, `OPTIONS`, `INDEX`. Phase 1 populates whatever Angel One's holdings/positions endpoints actually return — likely `EQUITY` at minimum; `FUTURES`/`OPTIONS` if F&O positions sync is in scope. |
| `isin` | text, nullable | Equities/ETFs only. Derivatives contracts don't have an ISIN in the Indian market structure — this is null for `FUTURES`/`OPTIONS`, not "unknown." |
| `exchange` | enum | `NSE`, `BSE`, `NFO`, `BFO`, `MCX`, ... — populate only exchanges Angel One actually serves. |
| `underlying_instrument_id` | UUID, nullable, FK → `instrument.instrument_id` | For derivatives: points at the underlying equity/index instrument. Null for equities. |
| `expiry` | date, nullable | Derivatives only. |
| `strike` | numeric, nullable | Options only. |
| `option_type` | enum, nullable | `CE` / `PE`. Options only. |
| `created_at` | timestamptz | |

**Open question, not resolved here:** the natural key that makes two instrument rows
"the same instrument" — `(exchange, isin)` for equities is solid; for derivatives it's
`(exchange, underlying, expiry, strike, option_type)`, which is stable within a contract's
life but says nothing about exchange-side token reuse after very long periods. Flagging
as a risk for the corporate-action pipeline (§93.4) to own later, not solving it in Phase 1.

## 2. `instrument_version` — point-in-time attributes

One row per period during which a set of attributes was valid for a given instrument.
This is what makes `lot_size`, symbol, etc. point-in-time queryable per §93.1.

| Column | Type | Notes |
|---|---|---|
| `instrument_version_id` | UUID, PK | |
| `instrument_id` | UUID, FK → `instrument` | |
| `trading_symbol` | text | Canonical/exchange trading symbol, not any broker's internal symbol. |
| `lot_size` | integer | |
| `contract_multiplier` | numeric | |
| `tick_size` | numeric | |
| `effective_from` | timestamptz | |
| `effective_to` | timestamptz, nullable | Null = currently in effect. |
| `source` | text | Where this attribute set was verified (doc URL or feed), per the broker-adapter rule that nothing is asserted without a source. |
| `last_verified_date` | date | |

Querying "what was the lot size on trade date X" is `WHERE instrument_id = ? AND
effective_from <= X AND (effective_to IS NULL OR effective_to > X)`.

## 3. `broker_instrument_mapping` — per-broker identifiers

One row per (broker, instrument) pair. This is the adapter boundary artifact — the only
place broker-native identifiers are allowed to exist (spec §4: "no broker-specific type,
field name, or error code may cross the adapter boundary").

| Column | Type | Notes |
|---|---|---|
| `mapping_id` | UUID, PK | |
| `instrument_id` | UUID, FK → `instrument` | |
| `broker` | enum | `ANGEL_ONE` for Phase 1; enum leaves room for future brokers without a schema change. |
| `broker_trading_symbol` | text | Broker's own symbol string. |
| `broker_native_attributes` | jsonb | Catch-all for whatever else the broker keys instruments by (token, security ID, or other field — **names intentionally not fixed yet**, since Angel One's actual field names haven't been verified against current SmartAPI docs). Gets tightened into named columns once verification happens and the shape is actually known. |
| `effective_from` | timestamptz | Broker-side mappings can themselves change (token reassignment) independent of the instrument. |
| `effective_to` | timestamptz, nullable | |
| `last_verified_date` | date | |

## What Phase 1 actually needs

Given Phase 1 is read-only aggregation for one broker with no order placement and no
options analytics beyond position display: populate `instrument` and
`instrument_version` for whatever `instrument_type`s Angel One's holdings/positions
endpoints return, and one `broker_instrument_mapping` row per instrument for Angel One.
The versioning machinery (`effective_from`/`effective_to`) is designed in now because
retrofitting it later means migrating live data — but Phase 1 doesn't need to backfill
history, just start writing versioned rows from day one.

## Update from the Angel One verification pass (see [angel-one-verification.md](angel-one-verification.md))

- `broker_native_attributes` for Angel One is now known: `symboltoken` (Angel One's
  instrument identifier — observed as both string and numeric across different endpoints;
  coerce to string canonically), `tradingsymbol`, `exch_seg`, `instrumenttype`
  (`EQ`/`FUT`/`CE`/`PE`), `tick_size`, `is_cas_enabled`.
- **`isin` cannot be bootstrapped from the instrument master dump** — Angel One's daily
  `OpenAPIScripMaster` dump has no ISIN column. ISIN is only present in the
  `getHolding`/`getAllHolding` response, per instrument, and only for instruments the
  connected user actually holds. Practically: the daily instrument-master job populates
  `instrument` + `instrument_version` for the whole exchange universe with `isin` left
  null, and holdings sync backfills `isin` incrementally, per instrument, as holdings are
  observed — never all at once.

## Explicitly not decided here

- Whether `instrument_type` needs `INDEX` in Phase 1 (depends on whether Angel One's
  positions/holdings responses ever reference an index directly, e.g. for margin/benchmark
  display) — unverified.
- Any DDL/migration — this is a schema *design*, not yet a migration file.
