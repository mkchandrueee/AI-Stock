# Angel One live capability matrix — existing Trading API app

Status: **desk research and code review only — no live API call was made, no
credentials were requested or received.** This report answers what's determinable
from current official SmartAPI documentation, official-forum admin/moderator posts,
and this project's own existing adapter code. Several rows genuinely require you to
observe your own account (which app-creation path it was made through, whether a
static IP is already registered on it) — those are marked accordingly rather than
guessed at. No code changed.

## Why no live test happened

You have an existing app and its API key, but per your own stated constraint this
conversation never receives it, and per the earlier auth-architecture security gate,
credential handling is a reviewed decision, not something to improvise around
mid-verification. Everything below is therefore documentation- and code-derived. A
real live test — even a one-off, local-only one — needs a decision from you first;
see "Authentication decision" below for what that would actually require.

## 1–2. Authentication mechanism the existing app is expected to use / old vs. New Login

**Cannot be determined from documentation — only from your own account.** Two things
are true simultaneously and don't resolve this by themselves:

- **Official docs, unchanged across both verification passes**: `loginByPassword`
  (client code + PIN + TOTP, direct) is documented as available to any Trading API
  key, with no old/new distinction mentioned anywhere in the reference docs.
- **Official forum**: static-IP-based keys are created via "New Login"; the admin
  statement was *"both types of API keys — with static IP and without static IP —
  will continue to work."* This implies old-style keys (created via the original
  "login," not "New Login") still function today, but doesn't establish which kind
  your existing app is.

**What would actually answer this**: opening "My Apps" on the SmartAPI portal and
checking whether your existing app has a Primary Static IP already registered on it
(the field the Add-App screenshot showed as likely-mandatory for *new* apps). If it
does, it was very likely created under the newer flow. If it predates that field
existing, it wasn't. This is something only you can check by looking.

## 3. Capability matrix

| Capability | Supported? | Authentication required | Static IP required? | Endpoint/SDK method | Evidence | Phase 1 relevance |
|---|---|---|---|---|---|---|
| Profile | Yes | Any valid session | No | `GET .../user/v1/getProfile` | Official docs, unchanged both passes | Used — resolves `brokerAccountRef`, exchanges, products |
| Holdings | Yes | Any valid session | No | `GET .../portfolio/v1/getHolding` | Official docs; official forum: *"a registered Static IP address is only mandatory for tech-savvy investors who use APIs to place orders"* | Used — core Phase 1 data |
| Positions | Yes | Any valid session | No | `GET .../order/v1/getPosition` | Official docs, unchanged | Used — core Phase 1 data |
| Funds | Yes | Any valid session | No | `GET .../user/v1/getRMS` | Official docs, unchanged | Used — cash/margin totals |
| Order book | Yes | Any valid session | No | `GET .../order/v1/getOrderBook` | Official docs, unchanged | Used — reconciliation, external-trade detection |
| Trade book | Yes, but retention window unconfirmed beyond "current day" | Any valid session | No | `GET .../order/v1/getTradeBook` | Official docs say *"provides the trades for the current day"* — no elaboration found in either pass | Used — same caveat already recorded in `angel-one-verification.md` |
| Market quotes (LTP) | Yes | Any valid session | No | `POST .../order/v1/getLtpData` | Official docs, unchanged | **Not used in Phase 1** — no live-quote feature in scope |
| Historical candles | Yes, per Trading API key specifically | Any valid session | Unconfirmed for this endpoint specifically (not in the verified static-IP-scope statements, which named "Orders/GTT" only) | Historical API (path not re-verified this pass) | **Official forum, moderator direct quote**: *"you can create a trading API key to get the market data. Please use the same key"* — confirms a single Trading API key now covers what used to be separate Market/History key types | **Not used in Phase 1** — no historical charting in scope |
| WebSocket market data | Unverified in either pass | Unknown | Unverified | `WebSocket Streaming 2.0` (docs page exists, not opened) | Not researched — genuinely out of scope, not silently assumed | **Not used in Phase 1** — no live streaming in scope |

## 4. What authentication returns

- `loginByPassword`: **JWT + refresh token + feed token** — documented, unchanged,
  confirmed again this pass via the official-forum refresh-token thread: *"In login
  response you'll get refresh token... With that refresh token you can generate JWT
  token & refresh token"* using `POST .../jwt/v1/generateTokens`.
- `publisher-login` redirect: **JWT (`auth_token`) + feed token only, no refresh
  token** — confirmed against Angel One's own SDK source in the original pass, not
  contradicted by anything found since.
- Whatever "New Login"/OAuth actually is under the hood: **still undocumented**, per
  the prior re-verification report. Not re-checked this pass since it wasn't the
  focus.

## 5. Exact token/session expiry behavior

**Unchanged from both prior passes, reconfirmed again this pass.** Official-forum,
direct quote (SEBI-compliance announcement): *"Authentication token will be expired
at 00:00 hours everyday."* No source in any pass has stated a precise TTL in hours
from issuance — only the fixed midnight cutoff, regardless of login time. A direct
follow-up question in the refresh-token thread (*"till when a generated access token
remains valid?"*) went unanswered in what's visible there.

## 6. Whether read-only APIs require the registered static IP

**No — reconfirmed a third time across three separate passes**, each with an
independent official-forum quote naming order execution specifically. This is the
most solidly corroborated finding in this whole report.

## 7. Whether the existing app can authenticate without the redirect/publisher-login flow

**Yes.** `loginByPassword` has been documented, unchanged, this entire project's
research history, and is not gated behind app type, "New Login" status, or anything
else found in any source. This is really the headline finding of this report: the
redirect-flow uncertainty that motivated the whole Tailscale detour applies to *one
specific login path*, not to authentication with your existing app in general.

## Authentication decision

**Existing app authentication flow**: Unknown without your direct observation (see
§1–2). Doesn't block the conclusion below, though — it doesn't need to be known.

**Whether redirect authentication is actually required**: **No.** `loginByPassword`
works today, per official docs unchanged across every pass, regardless of the
redirect-flow ambiguity. The Tailscale/Funnel work solved a real problem for the
*production, multi-user* auth path this project already chose (Option B) — it was
never actually required just to prove Phase 1's read-only capabilities against your
own account.

**Whether the current `AuthSession` abstraction remains valid**: **Partially.**
`AuthSession` currently has no `refreshToken` field — a deliberate choice, made
because the redirect flow never returns one. `loginByPassword` does return one.
Using `loginByPassword` for anything beyond a one-off manual check would mean either
adding that field (straightforward) or accepting the same "single-day session,
refresh token unused" posture this project already has for the redirect flow (also
fine, just leaves a capability on the table). Everything downstream of `AuthSession`
— `ReconciliationService`, `AccountSyncService`, the portfolio views — is unaffected
either way; they only ever consume the session, never construct it.

**What, if anything, must change**: Two genuinely different things, worth keeping
separate rather than conflating, since they have very different stakes:

1. **A one-off local capability check, run only by you, right now, entering
   credentials only into your own terminal — never into this chat, never logged,
   never committed.** This would need a small standalone script calling
   `loginByPassword` directly and printing (not storing) the responses from
   holdings/positions/funds/order-book/trade-book. This is *not* a production
   auth-flow decision — it's closer to `curl`-ing the API yourself to see what comes
   back, just via a script instead of by hand. Nothing about this touches
   `AngelOneAdapter`, `AuthSession`, the HTTP layer, or any committed code, and
   nothing about it needs to survive past the check itself.
2. **Whether production ever adopts `loginByPassword` for real users** is a separate,
   larger question — it means the platform receiving real users' PIN and TOTP, the
   exact tradeoff Option B was built to avoid. Nothing in this report argues for that.
   The redirect-flow ambiguity from the earlier reports is still open and still
   matters for *that* decision; this report just establishes it isn't blocking today's
   narrower question of "does the existing app work at all for Phase 1's data."

Not implemented — per instruction, this stops here for your review.
