# Security Master — design (spec §18)

Status: **Verified end-to-end against a real PostgreSQL 18 instance and the real Angel
One instrument dump**, 2026-08-15. Migration
[`migrations/0001_security_master.sql`](../../migrations/0001_security_master.sql)
applies cleanly. Full ingestion of all 155,399 dump rows completed in ~195s: 98,851
instruments/versions/mappings created, 56,547 rows correctly skipped (out-of-scope
exchanges + unclassifiable rows), zero silent data corruption. Re-running the same
ingestion is fully idempotent (confirmed: zero new rows on a second pass over an
already-ingested subset). Resolution by broker token and by (exchange, tradingSymbol)
both confirmed to reach the same `instrument_id`; resolving a nonexistent instrument
correctly returns the not-found result rather than throwing.

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
| `broker_instrument_token` | text, nullable | Angel One's `symboltoken`. Nullable because it's genuinely absent on some records — the trade book has no token field at all, and some order-book rows carry `null` (both confirmed against live doc examples during adapter implementation). |
| `broker_trading_symbol` | text | Broker's own symbol string. Always present — the fallback lookup key when the token isn't. |
| `broker_native_attributes` | jsonb | Catch-all for the rest: `exch_seg`, `instrumenttype`, `tick_size`, `is_cas_enabled`. |
| `effective_from` | timestamptz | Broker-side mappings can themselves change (token reassignment) independent of the instrument. |
| `effective_to` | timestamptz, nullable | |
| `last_verified_date` | date | |

**Revision from the original design:** the first version of this table kept the broker's
instrument identifier inside `broker_native_attributes` entirely, deferring the exact
shape until verification happened. Implementing `AngelOneAdapter` against it exposed why
that doesn't work: `InstrumentResolver` needs to look up by token *or* by
`(exchange, tradingSymbol)`, depending on which broker endpoint produced the record — a
lookup key buried inside jsonb can't be indexed sanely. Both are now real, indexed
columns (see the two unique indexes in the migration); jsonb is reserved for genuinely
incidental fields only.

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
  coerce to string canonically), `tradingsymbol`, `exch_seg`, `instrumenttype`,
  `tick_size`, `is_cas_enabled`.
- **`isin` cannot be bootstrapped from the instrument master dump** — Angel One's daily
  `OpenAPIScripMaster` dump has no ISIN column. ISIN is only present in the
  `getHolding`/`getAllHolding` response, per instrument, and only for instruments the
  connected user actually holds. Practically: the daily instrument-master job populates
  `instrument` + `instrument_version` for the whole exchange universe with `isin` left
  null, and holdings sync backfills `isin` incrementally, per instrument, as holdings are
  observed — never all at once.

## Update from actually downloading and inspecting the instrument master dump

The dump is a public, unauthenticated URL, so it was pulled directly (155,399 rows,
2026-08-15) rather than trusted from the docs' example — which turned out to matter:
the docs example and the real file disagree on two load-bearing details. See
[`src/security-master/angel-one-instrument-ingestion.ts`](../../src/security-master/angel-one-instrument-ingestion.ts)
for the implementation this fed into.

- **`exch_seg` is uppercase and matches `exchange` elsewhere** (`NSE`, `BSE`, `NFO`,
  `BFO`, plus `MCX`/`CDS`/`NCDEX`/`NCO` which are out of Phase 1 scope). The docs'
  example showed lowercase `"nse_cm"` — stale or wrong. Trusted the live data.
- **`instrument_type` is nothing like the docs' claimed `EQ, FUT, CE, PE`.** Real
  values: equities/ETFs/bonds are `""` (empty string — matching what
  `getHolding`/`getPosition` actually return, not a literal `"EQ"`), and derivatives
  use a much larger taxonomy (`FUTSTK`, `OPTIDX`, `OPTCUR`, `FUTIRC`, 20+ values total).
  Only `FUTSTK`/`FUTIDX`/`OPTSTK`/`OPTIDX` on NFO/BFO are ingested for Phase 1.
- **`strike` is the rupee value × 100** — confirmed against multiple option symbols
  where the strike embedded in the symbol string matched `strike / 100` exactly
  (e.g. token 100068 `DIVISLAB29SEP267200CE`, `strike: "720000.000000"` → 7200).
  Not documented anywhere found; would have been a 100× pricing bug if missed.
- **No `contract_multiplier` field exists in the dump.** Defaulted to 1 for every
  instrument, which is a standard Indian-market convention (multiplier is folded into
  lot size, unlike US-style options), not a guess at broker-specific data.
- **`instrumenttype: ""` isn't purely "equity."** The same empty value also covers
  Sovereign Gold Bonds and similar cash-market instruments (e.g. token 1004,
  `679AP34-SG`) — nothing in the dump distinguishes them from equities. Flagged, not
  solved: they get classified as `EQUITY` too.
- **Running the classifier against all 155,399 real rows caught a real bug before any
  database existed to catch it in production:** `MIDCPNIFTY` (an index reference row,
  not a tradeable equity) has `instrumenttype: ""` on `NSE` — indistinguishable from a
  real equity by that field — but `lotsize: "-1"`. The classifier now rejects any row
  with a non-positive lot size. Re-running after the fix: 98,852 rows classified
  (22,690 equity, 74,870 options, 1,292 futures), zero anomalies.

## Update from running the full ingestion against a real database

**Angel One's own instrument dump has a genuine token collision:** `broker_instrument_token
"1"` is assigned to two entirely different instruments — `GOLDSTAR-SM` (lot size 11250)
and `BSX` (lot size 1) — both NSE equities in the same dump. The first version of the
ingestion job didn't catch this: since both rows share a token, the second one looked
exactly like a legitimate revision of the first (same shape as a lot-size change), so it
silently closed out `GOLDSTAR-SM`'s version and opened one for `BSX` under the *same*
`instrument_id` — quietly merging two unrelated securities into one canonical identity.
This is exactly the "never silently overwrite, surface it" failure mode `CLAUDE.md`
non-negotiable rule 5 exists to prevent, just encountered in ingestion rather than
reconciliation.

Fixed by tracking tokens seen within a single ingestion run: if the same token appears
twice in one run with a different trading symbol, the second occurrence is treated as a
conflict, left unprocessed, and reported in `IngestionSummary.tokenConflicts` — never
silently folded into the first instrument's identity. Confirmed after the fix:
`GOLDSTAR-SM` keeps a single, untouched version row; `BSX` doesn't appear in the
Security Master at all, and the conflict is visible in the run summary rather than
buried. See `ingestRows` in
[`angel-one-instrument-ingestion.ts`](../../src/security-master/angel-one-instrument-ingestion.ts).

Whether this reflects a real Angel One data error, an instrument that was delisted and
had its token reassigned within the same daily snapshot, or something else — not
determined. Worth a look before deciding what a *recurring* daily ingestion should do
with a persistent conflict like this (today it's silently skipped every run, which is
safe but not necessarily the final answer for cross-day conflicts).

## Explicitly not decided here

- Whether `instrument_type` needs `INDEX` in Phase 1 (depends on whether Angel One's
  positions/holdings responses ever reference an index directly, e.g. for margin/benchmark
  display) — unverified.
- What should happen when a token conflict persists or changes across daily runs (today:
  silently skipped every time, which is safe but unexamined for the multi-day case).
- Scheduling/orchestration for the daily ingestion job — it exists as a callable
  function, not a cron job or worker.
