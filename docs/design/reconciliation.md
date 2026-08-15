# Reconciliation engine (spec §13, §14; .claude/rules/reconciliation.md)

Status: implemented for holdings, orders, and trades; verified against the real
`trading_platform` database with clearly-marked fixture scenarios (no real Angel One
session available — same boundary as every other piece so far).

Files: [`src/reconciliation/reconciliation-engine.ts`](../../src/reconciliation/reconciliation-engine.ts)
(pure classification logic),
[`src/reconciliation/reconciliation-service.ts`](../../src/reconciliation/reconciliation-service.ts)
(orchestration + the actual "never silently overwrite" enforcement),
[`migrations/0003_reconciliation.sql`](../../migrations/0003_reconciliation.sql).

## What "never silently overwrite" actually means here

`reconciliation.md` says a mismatch "surfaces as `RECONCILIATION_REQUIRED`," but doesn't
specify the mechanism. This implementation's choice: reconciliation runs **before** any
write to `holding`/`broker_order`/`trade`, not after. If any finding is classified
`REQUIRES_ATTENTION`, the sync write for the whole cycle is skipped — stored state is
left exactly as it was, the run is logged `RECONCILIATION_REQUIRED`, and the account
needs that resolved before its state moves forward. Only a `CLEAN` run proceeds to
`AccountSyncService`'s writes.

This is an **account-level gate**, not row-level — one disputed holding blocks the whole
account's sync cycle, not just that holding. Simpler to reason about correctly at Phase
1's scale; a row-level gate (block only the disputed instrument, sync everything else)
would be more surgical and is a reasonable future refinement, not built here.

## Severity classification — a judgment call, not a spec quote

`reconciliation.md` lists the difference types to classify (missing order, unexpected
order, quantity mismatch, price mismatch, missing fill, stale status, external trade)
but doesn't say which ones should block a sync vs. just get logged. This implementation
splits them:

- **`REQUIRES_ATTENTION`** (blocks the sync): `MISSING_HOLDING`,
  `HOLDING_QUANTITY_MISMATCH`, `MISSING_ORDER`, `PRICE_MISMATCH`, `MISSING_FILL`. Each
  of these contradicts something already believed to be true — a holding that should
  still exist doesn't, an order's price changed after the fact, a filled order has no
  corresponding trade. Could be a real event or a broker glitch; reconciliation's job is
  to say "these disagree," not guess which.
- **`INFORMATIONAL`** (logged, doesn't block): `NEW_HOLDING`, `UNEXPECTED_ORDER`,
  `STALE_STATUS`, `EXTERNAL_TRADE`. None of these contradict prior state — they're new
  information (a new holding, an order glimpsed for the first time, a status that
  legitimately progressed, a trade that — since Phase 1 places no orders itself — is
  *always* external by construction; spec §14's "detect, flag, don't absorb silently"
  is satisfied structurally by `Order.origin` already being hardcoded `'EXTERNAL'`).

Worth revisiting once real usage shows whether this split is too strict (blocking sync
on things that turn out to be routine) or too loose.

## What isn't reconciled yet

- **Positions.** The same "does disappearance mean closed, or broker glitch?" question
  applies to `position` exactly as it does to `holding`, but only holdings got this
  treatment in this pass. `ReconciliationService.reconcile` still syncs positions
  unconditionally every cycle — a real gap, not hidden.
- **Funds.** No reconciliation concept applies in the same way (funds are a live figure,
  not compared against a prior expectation); synced unconditionally.
- **Scheduling and reconnect-triggering.** `reconciliation.md`: "runs on a schedule AND
  on reconnect after any disconnect." `ReconciliationService.reconcile` takes a
  `trigger` parameter (`SCHEDULED` / `RECONNECT` / `MANUAL`) and records it, but nothing
  calls it on either trigger yet — no scheduler, no disconnect-detection exists.

## Verified

Ran three fixture scenarios (clearly marked, not real Angel One data) against the real
database:
1. **Clean run**: fresh state matches stored state exactly → `CLEAN`, writes proceed.
2. **Holding quantity mismatch**: stored holding shows quantity 10, fresh fetch shows a
   different quantity with no corresponding trade to explain it → `RECONCILIATION_REQUIRED`,
   sync writes skipped, stored holding unchanged, finding recorded with both quantities.
3. **New holding only** (no contradiction): → `CLEAN` despite a new `NEW_HOLDING`
   finding being logged, confirming informational findings don't block.

Also confirmed the `pg` NUMERIC-as-string gotcha: reading `quantity` back from Postgres
without explicit `Number(...)` coercion made every stored-vs-fresh holding comparison
report a false mismatch (string `"10"` !== number `10`). Fixed in
`reconciliation-service.ts`'s read methods; worth remembering for any future code that
reads numeric columns back out of this schema.
