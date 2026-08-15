# Schedulers

Status: implemented, verified against real Postgres and OpenBao with fixture data
(no real Angel One session exists in this environment to test the live broker path).

Two independent schedulers live under `src/scheduler/` — different scope, different
cadence, started and stopped separately in `server.ts`'s `main()`.

## Reconciliation scheduler

Files: [`src/scheduler/reconciliation-scheduler.ts`](../../src/scheduler/reconciliation-scheduler.ts).

## What this closes

The last honest gap named in `session-store.md`: `SessionStore` made unattended
reconciliation *possible* within a session's remaining lifetime; nothing called it.
`startReconciliationScheduler` does, on an interval (default 15 minutes, tunable via
`RECONCILIATION_INTERVAL_MS` — a judgment call, `reconciliation.md` doesn't specify a
number). Each cycle: list every account, try to load its session, reconcile if one
exists and hasn't expired, skip (and log the skip) if not. One account's failure
doesn't stop the rest of the cycle.

Still bounded by the same hard constraint as everything else in this area: if nobody
has logged in recently enough for a session to still be valid, the scheduler can't do
anything about that account. It skips it visibly rather than failing loudly or
pretending to have fresh data.

`/connect/callback` now also distinguishes a first-time connection from a reconnect
(checked via existence lookup before the upsert) and passes the correct trigger
(`MANUAL` vs `RECONNECT`) to `reconcile()` — so `reconciliation_run`'s log actually
reflects `reconciliation.md`'s "runs on a schedule AND on reconnect" language, rather
than every login recording as generic `MANUAL`.

## A real bug this verification pass caught

Testing the scheduler against a fixture adapter with a call counter revealed that
`ReconciliationService.reconcile()`'s clean path called `AccountSyncService.syncHoldings`
/`syncOrders`/`syncTrades`, which each re-fetched from the broker — duplicating calls
`reconcile()` had already made moments earlier to run the comparison. Confirmed via the
counter: 2 calls per clean cycle where 1 was correct. Fixed by splitting
`AccountSyncService` into fetch-and-persist (`syncX`) and persist-only (`persistX`)
variants; `reconcile()`'s clean path now calls `persistHoldings`/`persistOrders`/
`persistTrades` with the data it already has. Re-verified: exactly 1 call per cycle.

This matters beyond tidiness — Angel One's real rate limits on these exact endpoints
are 1 request/second per client code (`angel-one-verification.md`). Silently doubling
every call was burning real rate-limit headroom for no reason, on every single
reconciliation cycle, for as long as it went unnoticed.

## Verified

Using a fixture `BrokerAdapter` (call-counting, clearly not real Angel One data) against
the real database and OpenBao instance:
- An account with a valid stored session gets reconciled; an account with none is
  skipped, and neither outcome is silent — both are logged, and only the reconciled
  account produces a `reconciliation_run` row.
- The interval scheduler fires on schedule (2 cycles observed in ~2.5s at a 1s test
  interval) and `stop()` genuinely halts it — confirmed by checking the call count
  didn't grow in the 2s after stopping.
- Exactly one broker call per account per clean cycle after the fetch/persist split,
  down from two.

## Still not built (reconciliation scheduler)

- Multi-instance safety — if this process ever runs more than one replica, nothing
  prevents two instances from reconciling the same account concurrently. Not a concern
  yet (this is one process, one machine), but worth remembering before any horizontal
  scaling.
- Backoff/retry policy for a broker call that fails mid-cycle — currently just logged
  and moved on to the next account; the failed account waits for the next scheduled tick.

## Audit chain verification

Files: [`src/scheduler/audit-verification-scheduler.ts`](../../src/scheduler/audit-verification-scheduler.ts).

Closes the gap named in `audit-log.md`: `GET /audit-log/verify` existed but nothing
called it automatically. This does, on an interval (default 1 hour — longer than
reconciliation's default since it's a whole-table integrity scan, not a per-account
check, tunable via `AUDIT_VERIFICATION_INTERVAL_MS`). On failure, logs loudly
(`console.error`, not swallowed) with the exact row where the chain broke.

Verified end-to-end, together with the same pass's `app_user` least-privilege role
(`migrations/0005_app_role.sql`): with the app connected as the restricted role that
can no longer `UPDATE`/`DELETE` `audit_log` itself, a *direct* admin-level `UPDATE`
(simulating a DBA or compromised superuser credential — the only way tampering could
still happen given the role restriction) was correctly caught on the next scheduled
check. The two pieces work together: the role change makes the app itself incapable of
tampering; the scheduler catches tampering from outside the app.

No alerting/paging exists — a real deployment needs the failure case to notify someone,
not just print to stdout.
