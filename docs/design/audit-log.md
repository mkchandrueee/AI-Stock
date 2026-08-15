# Hash-chained audit log (spec §96.3)

Status: implemented, verified against real Postgres — including finding and fixing a
real bug in the hash design itself, not just testing happy-path behavior.

Files: [`src/audit/audit-log.ts`](../../src/audit/audit-log.ts),
[`migrations/0004_audit_log.sql`](../../migrations/0004_audit_log.sql).

Closes a commitment made early in this project: the original stack decision in
`CLAUDE.md` named "audit/consent ledger as a hash-chained append-only Postgres table"
as the design, but nothing had implemented it until now.

## Scope: security events, not business outcomes

`reconciliation_run`/`reconciliation_finding` already log business-logic outcomes
(what was compared, what was found) as their own append-only tables. `audit_log` is
deliberately separate — it covers security-relevant *events*: session lifecycle
(`SESSION_SAVED`, `SESSION_LOADED`, `SESSION_DELETED`) and account connections
(`ACCOUNT_CONNECTED`, `ACCOUNT_RECONNECTED`). Not duplicating reconciliation's own log,
which already serves its purpose well.

## Where the logging calls live

Inside `SessionStore` itself, not at each call site that uses it. `CLAUDE.md` rule 4
says redaction should be "automated... not code review" — if logging depended on every
caller remembering to log a secret-adjacent operation, that's exactly the code-review
dependence the rule argues against. `SessionStore.save`/`load`/`delete` each log their
own outcome; a caller can't forget.

## A real bug this verification pass found, not just exercised

The first version hashed `JSON.stringify(details)` directly — computed once at write
time, recomputed identically-seeming at verify time. Running `verifyAuditChain()`
against real stored rows immediately failed at row 1, before any tampering. Cause,
confirmed directly against Postgres (not inferred): the `jsonb` column type normalizes
key order and whitespace on storage. `{"jwtToken":"x","nested":{...}}` round-trips as
`{"nested": {...}, "jwtToken": "x"}` — different key order, added spacing. Hashing
`JSON.stringify()` output made every row's hash depend on Postgres's internal
serialization choices, not just the logical content, so recomputation after a
round-trip never matched — even for completely untampered data.

Fixed with `canonicalJson()` — recursively sorts object keys before serializing,
used identically whether `details` just came from a caller or was just read back from
the database. This is the kind of bug that's essentially invisible from reading the
code (`JSON.stringify(details)` looks obviously correct) and only surfaces by actually
running the verification against real stored data, which is exactly why this pass
tested tamper-detection rather than stopping at "the hash function runs without error."

## Verified

Against the real database:
- **Redaction**: `jwtToken`, `password`, and a nested `totpSecret` were all replaced
  with `[REDACTED]` before reaching SQL; an unrelated field survived untouched.
- **Chain validity**: a sequence of logged events recomputes as valid from genesis.
- **Concurrency**: 20 events logged in parallel via `Promise.all` — the chain stayed
  valid, confirming the advisory-lock serialization (`pg_advisory_xact_lock`) actually
  prevents the race it's meant to prevent, not just in theory.
- **Tamper detection**: directly modifying a stored row's `details` via a manual
  `UPDATE` (bypassing the application entirely) was correctly detected —
  `verifyAuditChain()` identified the exact row.

## Explicitly not solved

- **No database-level append-only enforcement.** The table has no `UPDATE`/`DELETE`
  restriction at the Postgres role/permission level — the tamper-evidence property
  relies on the hash chain making tampering *detectable*, not on anything preventing
  it. A real deployment needs a role that can `INSERT` but not `UPDATE`/`DELETE` on
  this table; not built, since no role separation exists in this local-dev setup at all.
- **No automated periodic verification.** `GET /audit-log/verify` exists and works, but
  nothing calls it on a schedule — tampering would only be caught if someone thinks to
  check.
