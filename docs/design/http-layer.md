# HTTP layer (Fastify)

Status: implemented, verified against the real database and against Angel One's login
URL construction. Not verified against a real Angel One session — no registered
SmartAPI app / API key exists in this environment.

Files: [`src/http/server.ts`](../../src/http/server.ts), [`src/http/config.ts`](../../src/http/config.ts).

## Endpoints

- `GET /health` — queries the database, confirms the server can actually reach it
  (not just that the process is alive).
- `GET /connect` — redirects to Angel One's `publisher-login` page. No credentials
  pass through this server.
- `GET /connect/callback` — the redirect target. Completes login, fetches the profile,
  upserts the `account` row, runs one reconciliation cycle inline (trigger `MANUAL`),
  and returns the result.
- `GET /accounts` — connected accounts.
- `GET /accounts/:accountId/reconciliation-runs` — recent reconciliation history for
  an account.

## The decision this pass deliberately didn't make: session persistence

The broker session (`jwtToken`/`feedToken`) is used only in-memory, for the duration of
the `/connect/callback` request, then discarded. It is never written to the database.

This was a live option to build differently — an encrypted `sessions` table would let a
background job re-run reconciliation later without a human clicking through the login
flow each time. Not built, for two reasons:
1. `CLAUDE.md` rule 4: "Secrets never touch application code... Never in config, env
   files, source, DB columns, logs, traces, or error messages." A broker JWT is exactly
   this kind of secret. Building session storage — even encrypted — means making real
   decisions about key management, rotation, and access control that nobody has
   reviewed yet. Doing that silently while "just adding an HTTP layer" would be scope
   creep on a security-sensitive decision.
2. Even if storage were built, Angel One's redirect flow has no refresh token (see
   `angel-one-verification.md`) — a stored session would still go stale at midnight IST
   with no way to renew it silently. Storage alone doesn't solve scheduled reconciliation.

**Practical consequence:** right now, reconciliation only ever runs when a user
completes the login flow. `reconciliation.md`'s "runs on a schedule AND on reconnect"
requirement is not met — there is no schedule, and "reconnect" here just means "logged
in again." A real scheduled path needs either a proper secrets-management decision
(who owns the encryption key, where it lives) or a different auth flow — not something
to resolve by default inside an HTTP routing pass.

## Config

`src/http/config.ts` requires `DATABASE_URL`, `BASE_URL`, `ANGEL_ONE_API_KEY`,
`ANGEL_ONE_CLIENT_LOCAL_IP`, `ANGEL_ONE_CLIENT_PUBLIC_IP`, `ANGEL_ONE_MAC_ADDRESS` at
startup and fails loudly if any are missing, rather than defaulting to a fabricated
value. The `.env` in this environment uses clearly-marked placeholder values for the
Angel One fields (`ANGEL_ONE_API_KEY=placeholder-not-a-real-key`, etc.) — enough to
start the server and verify every endpoint that doesn't call Angel One; `/connect` and
`/connect/callback` will not work against the real broker until a real SmartAPI app is
registered and those values are replaced.

## Verified

Started the server against the real `trading_platform` database and confirmed:
- `/health` actually queries the database, not just returns a static response.
- `/accounts` and `/accounts/:accountId/reconciliation-runs` return real seeded data.
- `/connect` redirects (302) to a correctly constructed Angel One login URL, with the
  configured API key and a properly URL-encoded `redirect_url`.
- `/connect/callback` with no query params correctly returns 400 with the same
  `MALFORMED_RESPONSE` error `AngelOneAdapter.completeLogin` produces for a missing
  `auth_token`/`feed_token` — confirming the adapter's error path reaches the HTTP
  layer intact rather than being swallowed or reshaped.

Not verified: the actual `/connect` → Angel One login → `/connect/callback` round trip
against a real account, since no real API key exists in this environment.
