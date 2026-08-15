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

## Both gaps below are now closed

- **Database-level append-only enforcement**: see
  [`migrations/0005_app_role.sql`](../../migrations/0005_app_role.sql) — the app now
  connects as a least-privilege `app_user` role with only `SELECT`/`INSERT` on
  `audit_log` (and the other genuinely append-only tables: `funds_snapshot`, `trade`,
  `reconciliation_finding`). Verified directly: `app_user` can `INSERT`/`SELECT` on
  `audit_log`, and a real Postgres permission error is thrown on `UPDATE`/`DELETE` —
  the app itself is now physically incapable of rewriting its own audit history, not
  just disciplined not to.
- **Automated periodic verification**: see
  [`scheduler.md`](scheduler.md#audit-chain-verification) —
  `audit-verification-scheduler.ts` calls `verifyAuditChain()` on an interval and logs
  loudly (not silently) if the chain is ever found broken. Verified end-to-end,
  including a real tamper: with the app connected as the restricted `app_user`, a
  *direct* admin-level `UPDATE` (simulating a DBA or compromised superuser credential
  bypassing the application entirely — the only way tampering could still happen given
  the role restriction above) was correctly detected on the next scheduled check.

No alerting/paging exists yet — a real deployment needs the failure case to actually
notify someone, not just print to stdout. Flagged, not solved.
