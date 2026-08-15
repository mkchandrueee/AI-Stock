# Angel One Authentication & API Capability Verification Report

Status: **research only — no code changed, no credentials requested.** Produced in
response to an explicit stop-and-reverify instruction, before creating any SmartAPI app
or providing an API key. Supersedes the authentication-flow assumptions in
`angel-one-verification.md` and `canonical-model-and-adapter-interface.md` where they
conflict with what's found below; does not touch the architecture those docs describe
(Security Master, adapter interface, sync, reconciliation, OpenBao, audit — all
unaffected, per the point raised alongside this instruction).

**Source tiers, kept separate throughout:**
- **Official docs** — `smartapi.angelbroking.com/docs` (the API reference).
- **Official forum, admin/moderator posts** — SmartAPI's own forum, posts explicitly
  from Angel One staff accounts (`admin`, `Moderator_1`, `algo_trading_50`). Not the
  reference docs, but the closest thing to an official statement where the docs are
  silent or stale.
- **Third-party** — community integration guides (OpenAlgo, stocksdeveloper.in). Not
  Angel One material at all; included only where they show what a currently-maintained
  real integration actually does, as a practical corroborating signal.

## Headline finding

**The official API reference docs are unchanged from the original verification pass** —
`/docs/User` still describes only `loginByPassword` and the `publisher-login` redirect
flow, with no mention of OAuth, "New Login," or static-IP-scoped API keys. Everything
below that contradicts this project's original assumptions comes from forum/admin posts
and third-party guides, **not** from the reference docs being updated. That gap between
"what the reference docs say" and "what the forum says is actually happening" is itself
the main finding, and is exactly the kind of drift a periodic re-verification is meant
to catch.

## 1–2. Current supported authentication mechanism / which app type is needed

**Unresolved with certainty from documentation alone — needs direct portal
verification, which requires your login.** What's known:

- Official docs describe exactly one mechanism, unchanged: `loginByPassword` (direct
  client code + PIN + TOTP) and the `publisher-login` redirect (this project's Option
  B). No OAuth-specific doc page found despite being promised.
- **Official forum (admin, SEBI-compliance thread):** *"The authentication process will
  be updated to use OAuth for improved security and compliance"* — documentation
  promised by 30 Jul 2025. A later admin reply to a direct question: *"OAuth will be
  live soon, and for some time, it will be live along the current login process."* No
  firm date. No dedicated OAuth docs page was found in this pass, months after the
  promised date, suggesting either it shipped without ever getting indexed/discoverable,
  or it hasn't shipped.
- **Official forum (moderator `algo_trading_50`, on a different thread):** *"Publisher
  APIs are no longer supported in the 'New Login' API apps"* — developers creating a
  new app under "New Login" are told to *"do login authentication via code as per the
  documentation. Make sure the API app is created from 'New Login'."* Read literally,
  this says the redirect flow this project built on is not available for apps created
  today.
- **Third-party (stocksdeveloper.in), contradicting the above at face value:** describes
  two still-live paths for Angel Broking specifically — `SMART_API` (direct
  credential/TOTP-based) and `SMART_API_M`, described as *"Also uses Smart API, but with
  OAuth login... does not store your trading account credentials... you will be
  redirected to the Angel website."* This reads exactly like the redirect flow, still
  functioning, under different branding.
- **Most likely reconciliation (a hypothesis, not confirmed):** "Publisher API" may be
  a specific Angel One app *category* (historically for embedding trade-execution
  buttons in third-party UIs — see the original app-type list: Publisher, Trading,
  Market Feed, Historical Data) that's blocked under "New Login," while a
  redirect-style login tied to the **Trading API** app type may still work. This isn't
  confirmed by any source found — it's a plausible reading of conflicting posts, not a
  verified fact. **Resolving this requires actually opening "Create App" on the portal
  and seeing what's offered**, which needs your own login and is exactly the kind of
  step this report is meant to happen before, not substitute for.

## 3. Re-verify current supported authentication mechanism

Covered above — genuinely unresolved from documentation. Two live candidates
(direct-credential `loginByPassword`-style, or a still-functioning redirect/OAuth-style
flow possibly gated to a specific app type), no source confirms which one a
freshly-created app gets by default.

## 4. Which app type: Trading API, Publisher/API Provider, or other

Not confirmed. Original app-type list (Publisher, Trading, Market Feed, Historical
Data) is from the general SmartAPI intro material and predates the "New Login" changes.
Whether "New Login" preserves this same category list, or introduces new ones, wasn't
found in any source. Needs direct portal observation.

## 5. Whether redirect authentication is currently available for the intended app type

Not confirmed either way with certainty — see §1–2. Genuinely contested between
sources; the honest answer is "unknown until tested against the real portal."

## 6. Whether HTTPS is mandatory, and what's supported for local development

**Confirmed, official forum, direct moderator quote:** *"Only URLs secured with HTTPS
are allowed in the redirect URL. HTTP, localhost, IPs are not allowed as redirect URL
anymore."* This project's current `.env` (`BASE_URL=http://localhost:3000`) and the
guidance already given in this conversation to register
`http://localhost:3000/connect/callback` are **both wrong under this rule** and should
not be registered as-is.

A user on that same thread asked the practical follow-up — how to test locally — and no
resolution is visible in what was fetched. Practical options observed elsewhere (not
official Angel One guidance): a public HTTPS tunnel to a local port (e.g. ngrok-style),
or a dummy redirect URL with the direct-credential flow instead of redirect (the
OpenAlgo guide explicitly tells developers to put `https://google.com` as the redirect
URL and never actually use it, because their flow doesn't rely on the redirect). Neither
is confirmed as *the* correct approach — just observed patterns from third parties
working around the same constraint.

## 7. Capabilities available without static IP

**Reconfirmed, consistent with the original verification pass.** Static IP is scoped to
order placement/modification/cancellation only. Fresh search result: *"a registered
Static IP address is only mandatory for tech-savvy investors who use APIs to place
orders for self-coded algorithms."* This project's adapter never calls those endpoints.
Holdings, positions, funds, order-book/trade-book reads: not gated by static IP, per
every source checked (original and this pass). WebSocket and historical/quote data:
**still unverified** in either pass — genuinely out of Phase 1's scope so never checked,
not silently assumed safe.

## 8. Current session expiry behavior

**Reconfirmed, unchanged.** Official docs and a fresh official-forum quote agree:
*"Authentication token will be expired at 00:00 hours everyday"* (IST, per the original
pass's context). No change found.

## 9. Whether the current authentication method provides a refresh token

**Depends entirely on which mechanism from §1–2 actually gets used — this is the crux
of why that ambiguity matters, not a side detail.**
- `loginByPassword`: still documented as returning `jwtToken` + `refreshToken` +
  `feedToken`, unchanged from the original pass.
- `publisher-login` redirect: still documented as returning only `auth_token` +
  `feed_token` — no refresh token, exactly as found originally (and independently
  confirmed against Angel One's own SDK source in the original pass).
- Whatever "OAuth"/"New Login" actually is: **undocumented**. The SEBI-compliance forum
  thread that introduced OAuth contains, per this pass, *no discussion of refresh
  tokens at all*. Cannot be answered without either finding real OAuth documentation
  (not located in this pass) or testing it directly.

## 10. Whether third-party/multi-user usage requires a separate commercial agreement

**Reconfirmed, unchanged, and still the same non-negotiable finding as the original
pass:** this is explicitly not a documentation question. Per fresh search results: algo
providers must empanel with exchanges and enter commercial agreements with brokers
separately; algorithms must be hosted on the broker's own server; multi-user hosting of
third-party logic is restricted under NSE/SEBI rules. Angel One remains
`COMMERCIAL TERMS UNRESOLVED` exactly as before — nothing in this pass changes that,
and nothing in this pass resolves it either. Still requires the broker's own
partnership/API team, not more research.

## What this means for the project, concretely

1. **Do not register `http://localhost:3000/connect/callback`.** Confirmed wrong under
   current rules by direct moderator quote.
2. **The redirect-flow assumption baked into `AngelOneAdapter.getLoginUrl`/
   `completeLogin` and the whole Option B session-architecture decision may not apply
   to a freshly-created app at all.** Not confirmed broken — genuinely unresolved — but
   confirmed *uncertain* enough that building further against it, or asking for
   credentials to test it, would be building on an assumption this pass could not
   verify either way.
3. **Nothing about the architecture downstream of authentication needs to change.**
   Security Master, canonical model, sync, reconciliation, OpenBao, audit log,
   portfolio views — none of this depends on which login mechanism eventually gets
   used; they all consume an `AuthSession`, however it's obtained. That boundary held.
4. **The only way to fully resolve §1–2, §4, §5, and §9 is to actually open the "Create
   App" flow on the real portal and see what's offered** — no combination of search and
   forum-reading available in this pass resolved it further. That's a step only you can
   take (it's tied to your Angel One login), and it's worth doing *before* deciding
   whether an API key is even worth generating yet, exactly as instructed.
