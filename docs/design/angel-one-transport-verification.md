# Angel One redirect transport — verified (Tailscale Funnel)

Status: **transport verification complete.** This resolves only the HTTPS
redirect-URL requirement found in
[`angel-one-auth-reverification.md`](angel-one-auth-reverification.md) — it does
**not** resolve that report's open question of whether a newly-created Trading API
app actually supports the publisher-login redirect flow at all. Two separate
questions; only the first is closed here.

## What was verified

With `AngelOneAdapter`'s login flow requiring an HTTPS callback URL (localhost/HTTP
confirmed rejected by Angel One per the auth re-verification report), and no code
or `BASE_URL` change made to accommodate that yet, a real HTTPS path to the local
dev server was proven end-to-end using Tailscale Funnel (free Personal plan):

- Device hostname `desktop-hvfuecs`, tailnet `tail281e2e.ts.net` — assigned by
  Tailscale on install, not chosen.
- `tailscale funnel 3000` forwarded `https://desktop-hvfuecs.tail281e2e.ts.net` →
  `http://127.0.0.1:3000`.
- `GET /health` over the tunnel → `200 OK` — confirms the tunnel reaches the real
  app, and the app reaches the real database, not just that the tunnel itself is up.
- `GET /` over the tunnel → `404`, Fastify's own `"Route GET:/ not found"` JSON —
  meaningful evidence, not a formality: a tunnel misconfiguration would produce a
  connection error or a Tailscale-level error page, not a clean JSON 404 from the
  application's own router.
- `GET /connect/callback` over the tunnel → `400`,
  `{"error":{"kind":"MALFORMED_RESPONSE","detail":"publisher-login callback missing
  auth_token or feed_token"}}` — the exact same error `AngelOneAdapter.completeLogin`
  produces locally, reached over the public HTTPS path. Proves the callback route
  itself, not just the server, is reachable at an HTTPS address Angel One's stated
  rules would accept.

**The candidate redirect URL, if this Tailscale setup is used going forward:**
```
https://desktop-hvfuecs.tail281e2e.ts.net/connect/callback
```

## Deliberately not done

- **Not left running.** The Funnel was torn down (`tailscale funnel reset`)
  immediately after verification, and confirmed genuinely unreachable afterward
  (connection failure, not an error page). Nothing about this project should assume
  a local dev machine stays reachable from the public internet between sessions —
  it's brought up only for an active test.
- **`.env`'s `BASE_URL` was not changed.** Still `http://localhost:3000`. Changing
  it is a decision for whenever the Angel One app is actually being created, not
  before — no reason to point the app at a public URL it isn't using yet.
- **No Angel One app created, no API key requested or held.** This test used only
  this project's own server and Tailscale's infrastructure.
- **Does not resolve which authentication flow a new app actually gets.** See
  `angel-one-auth-reverification.md` — that question needs the actual "Create App"
  portal flow, observed directly, not more transport testing.

## Why this matters going forward

Whenever the redirect-flow question above does get resolved and it's time to
register an app, the sequence is now: bring the Funnel back up
(`tailscale funnel 3000` — hostname is stable, already assigned, doesn't need
rediscovering), register `https://desktop-hvfuecs.tail281e2e.ts.net/connect/callback`
as the redirect URL, complete the login, then tear the Funnel back down. Nothing
about this setup needs to be re-derived; it's a known-working, repeatable path.
