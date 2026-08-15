# Account sync service (spec §4 persistence, precursor to §13 reconciliation)

Status: schema and service implemented, verified against the real `trading_platform`
database with clearly-marked fixture data (no real Angel One session was available to
test the live HTTP path — see "What this doesn't verify" below).

Files:
[`migrations/0002_account_data.sql`](../../migrations/0002_account_data.sql),
[`src/sync/account-sync-service.ts`](../../src/sync/account-sync-service.ts).

## What this is, and deliberately isn't

`AccountSyncService` drives a `BrokerAdapter` with an already-established session and
writes the results into Postgres. It is **not** reconciliation. `.claude/rules/reconciliation.md`
is explicit: "Compare our state against broker state and classify every difference...
Never silently overwrite. A mismatch surfaces as `RECONCILIATION_REQUIRED`." That's a
distinct process this doesn't attempt.

**A design mistake caught and reverted during this pass, worth recording:** the first
version deleted `holding`/`position` rows absent from a fresh fetch, reasoning that a
successful `AdapterResult` means every record resolved, so the fetch must be the
complete current set. That reasoning has a hole: `AdapterResult.ok: true` guarantees
every *returned* record resolved through the Security Master — it says nothing about
whether the broker's response was itself complete. A transient partial response that
still reports `status: true` (nothing in the verified Angel One error codes rules this
out) would cause the sync service to delete real holdings the user still owns. Whether a
holding's absence from one sync means "sold" or "broker glitch" is exactly the
classification spec §13 requires reconciliation to make deliberately, not something a
sync layer should decide by default. Every write in the final version is upsert-only;
nothing is ever deleted here.

## Table design choices

- `holding`/`position`: one row per `(account, instrument)` (position also keyed by
  `product`), overwritten in place as values change. This is a normal snapshot update,
  not the "mismatch" spec §13 is about — the distinction is *why* a value changed
  (broker confirms a new value vs. we detected a discrepancy), not whether the row gets
  written.
- `funds_snapshot`: append-only, one row per sync, never updated. Funds are cheap to
  store in full and matches the point-in-time posture already used for
  `instrument_version` — no reason to throw away history here just because nothing
  currently reads it.
- `broker_order`: upsert by `(account, broker_order_id)` — an order has one current
  status, so overwriting in place is correct, not a "never lose the original" violation
  (`broker_native` still preserves the raw response every time).
- `trade`: upsert with `ON CONFLICT DO NOTHING`, not `DO UPDATE` — a fill is an
  immutable historical fact once it exists. This is the one table where "do nothing" is
  correct behavior, not laziness.

## What this doesn't verify

No real Angel One session exists in this environment (no live API key / registered
app), so the actual HTTP path through `AngelOneAdapter` was not exercised end-to-end.
What was verified: the persistence logic itself, using clearly-marked fixture data (not
live broker data, not presented as real) fed directly into `AccountSyncService`'s
methods via a fake `BrokerAdapter` — confirming the SQL is correct, upserts behave as
designed, and the funds-history/order-upsert/trade-insert-only distinctions hold up
against the real schema. This is the same boundary as always: schema and persistence
logic can be verified without a live broker; the broker HTTP path itself cannot be,
without real credentials.

## What's still missing

- The HTTP layer for `getLoginUrl` → `completeLogin` (no framework chosen yet).
- Reconciliation itself — comparing this stored snapshot against a fresh broker read,
  classifying differences, and surfacing `RECONCILIATION_REQUIRED` rather than acting.
- Scheduling — nothing currently calls `AccountSyncService` on any cadence.
- A real Angel One session to test the actual broker HTTP calls, not just the
  persistence layer.
