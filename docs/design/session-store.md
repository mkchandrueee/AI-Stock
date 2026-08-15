# Session store — OpenBao integration (Option B)

Status: implemented, verified against a real local OpenBao dev-mode instance.

Files: [`src/vault/session-store.ts`](../../src/vault/session-store.ts) — not
`src/secrets/`, deliberately: this repo's `.gitignore` has a `secrets/` pattern meant to
block a directory of literal secret files, which was also silently swallowing this
source module (the client code, not a secret itself) until it got renamed.

Resolves the open items from
[`auth-session-architecture.md`](auth-session-architecture.md): secrets backend is
OpenBao (self-hosted, your choice), tier is Option B (encrypted persistence bounded by
the broker's own midnight-IST expiry, not indefinite automation).

## Design calls made here, not re-litigated with another review cycle

These are one level down from "which secrets backend" — documented with reasoning
rather than opened as another decision, consistent with how other implementation-level
architecture calls were handled earlier in this project (e.g., promoting
`broker_instrument_token` to a real column). Flag if any should have gotten a fuller review:

- **KV v2, not Transit.** OpenBao's Transit engine does encryption-as-a-service while
  the ciphertext lives elsewhere (Postgres); KV v2 stores the secret itself. Since
  nothing else needs to query, join, or index on session data — the only two operations
  are "save this session" and "get me the current session for this account" — splitting
  storage across two systems would add complexity (data in two places) without a
  matching benefit. Stored at `secret/data/broker-sessions/<accountId>`.
- **No native TTL relied on.** KV v2 doesn't auto-expire arbitrary secrets the way
  leased/dynamic credentials do — that mechanism is for secrets OpenBao itself
  generates, not for storing an externally-issued token like Angel One's JWT. So
  "bounded by the broker's own expiry" (Option B's whole point) is enforced at the
  application boundary instead: `SessionStore.load()` checks `expiresAt` after
  fetching, and treats an expired session as if it didn't exist — deleting it from
  OpenBao rather than returning stale data.
- **Auth to OpenBao: root token via env var, for now.** The dev-mode server generates
  a root token with full access to everything — appropriate for a single local dev
  instance, wrong for anything beyond that. Production would need a scoped policy
  (read/write/delete only under `broker-sessions/*`) and AppRole or similar
  machine-to-machine auth, not a standing root token. Not built, because there's no
  production OpenBao deployment to scope a policy against yet.
- **Raw `fetch` against OpenBao's HTTP API, no client library.** Same choice already
  made for `AngelOneAdapter` — OpenBao's API is plain REST, and a dependency whose
  OpenBao-specific (vs Vault-specific) maintenance status is unclear isn't worth adding
  for a handful of endpoints.

## What this changes about the rest of the system

`ReconciliationService`/`AccountSyncService` still just take an `AuthSession` — they
don't know or care whether it came from a fresh login or from `SessionStore`. The HTTP
layer's `/connect/callback` now saves the session to `SessionStore` after a successful
login (previously: used once, discarded). A new path becomes possible that wasn't
before: a scheduled job could call `SessionStore.load(accountId)` and run reconciliation
without a human present, **as long as the last-saved session hasn't hit its own expiry**.
That's the actual, bounded win Option B promised — not indefinite automation, same-day
automation after a login.

## Explicitly still not built

- **The scheduler itself.** `SessionStore` makes unattended runs *possible* within a
  session's remaining lifetime; nothing calls it on a cadence yet.
- **`/connect/disconnect`** (spec §2's Broker Connect Center `[Disconnect]` action) —
  `SessionStore.delete()` exists and works, but no HTTP route calls it yet.
- **Production OpenBao deployment, scoped policies, AppRole auth** — everything here
  is verified against one local dev-mode instance whose own startup banner says not to
  use it in production.
