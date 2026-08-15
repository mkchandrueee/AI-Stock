# Angel One (SmartAPI) — capability verification, Phase 1

Status: **DRAFT — capabilities technically verified against current public docs below.
Commercial/regulatory usability is NOT resolved by this document** (see "Not resolved
by this pass" at the end) — per spec §1, that requires the broker's partnership team,
not documentation.

Source: official docs at `smartapi.angelbroking.com/docs`, browsed directly, 2026-08-15.
Root API endpoint: `https://apiconnect.angelone.in`.

## Auth & session

- **Two login paths exist:**
  - `POST /rest/auth/angelbroking/user/v1/loginByPassword` — takes the user's raw
    client code, PIN/password, and TOTP code directly.
  - `publisher-login` redirect flow (`smartapi.angelone.in/publisher-login?api_key=...`)
    — OAuth-style: user authenticates on Angel One's own page, we receive `auth_token`
    and `feed_token` back as redirect query params.
  - **For a multi-user platform, the redirect flow is the only one that doesn't require
    us to collect and transmit each user's actual trading PIN and TOTP code ourselves.**
    That's a materially different secrets posture than `loginByPassword`, and non-negotiable
    rule 4 (secrets never touch application code) favors it strongly. Flagging this as a
    design decision, not yet made — worth confirming before any adapter code is written.
- Session (JWT) is valid until **12 midnight**, regardless of when it was issued.
- `POST /rest/auth/angelbroking/jwt/v1/generateTokens` refreshes the JWT using a
  refresh token — but per Angel One's own Python SDK source (`smartConnect.py`), that
  refresh token is only issued by `generateSession` (the `loginByPassword`-equivalent
  call). **The `publisher-login` redirect callback does not include a refresh token at
  all**, only `auth_token` and `feed_token`. Resolved: this platform uses the redirect
  flow (keeps raw PIN/TOTP out of this codebase), which means **no silent token
  refresh is possible** — daily re-authentication via the redirect flow is the only
  renewal path. See [canonical-model-and-adapter-interface.md](canonical-model-and-adapter-interface.md).
- 2FA is TOTP-based (authenticator app), confirmed.
- **Error codes verified** at `smartapi.angelbroking.com/docs/Exceptions`: token/session
  problems are `AG8001` (Invalid Token), `AG8002` (Token Expired), `AG8003` (Token
  missing), `AB1010` (AMX Session Expired), `AB1011` (Client not login). No error code
  corresponds to a rate limit — that's signalled by plain HTTP 403, per earlier
  research, unconfirmed against a live response. No code corresponds to "market
  closed" either. `AB1013`–`AB1016` (Order/Trade/Holding/Position not found) are
  empty-result codes, not failures — a user with zero holdings gets `AB1015`, which is
  the correct answer, not an error.

## Portfolio / read endpoints (what Phase 1 actually needs)

| Endpoint | Method | Rate limit | Notes |
|---|---|---|---|
| `portfolio/v1/getHolding` | GET | 1 req/sec | Long-term equity delivery holdings only. |
| `portfolio/v1/getAllHolding` | GET | 1 req/sec | Same + portfolio-level totals (`totalholdingvalue`, `totalprofitandloss`, etc). |
| `order/v1/getPosition` | GET | 1 req/sec | Returns both `net` and `day` positions; includes derivatives fields (`strikeprice`, `optiontype`, `expirydate`, `lotsize`). |
| `user/v1/getRMS` | GET | 2 req/sec | Funds/margin/cash — labelled "RMS Limit," not "funds," in the API itself. |
| `order/v1/getOrderBook` | GET | 1 req/sec | Full order objects incl. `orderstatus`, `symboltoken`, `uniqueorderid`, `exchangeorderid`. |
| `order/v1/getTradeBook` | GET | 1 req/sec | **"Provides the trades for the current day"** — see risk note below. |
| `order/v1/details/{UniqueOrderID}` | GET | 10 req/sec | Individual order status. |

**Risk — trade book appears to be current-day only.** If confirmed, this directly affects
spec §13/§14 (reconciliation, external trade detection): a trade placed outside the
platform is only visible via this endpoint on the day it happened. Missing a sync cycle
(extended disconnect spanning a day boundary) could mean that trade is permanently
unrecoverable from this endpoint, not just delayed — reconciliation would need to reconcile
*positions/holdings deltas* as a fallback for anything older than the current day, since
the trade book can't be replayed retroactively. **Needs explicit confirmation** — the docs
state this in one line with no elaboration on retention window.

**All portfolio-read rate limits are 1 request/second per client code** (RMS is 2/sec).
That's the real constraint on sync frequency and directly informs the platform-side rate
governor required by broker-adapters.md ("stricter than the broker's published limits") —
there's very little headroom to be stricter than 1 req/sec without polling less than once
a second, which is already the ceiling.

## Instrument master (bootstraps the Security Master, spec §18)

- `GET https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`
  — full instrument dump across all exchanges, **regenerated once daily**.
- Fields present: `token` (Angel One's `symboltoken`), `symbol`, `name`, `expiry`, `strike`,
  `lotsize`, `instrumenttype` (`EQ`/`FUT`/`CE`/`PE`), `exch_seg`, `tick_size`,
  `is_cas_enabled`.
- **ISIN is not in this dump.** ISIN only appears in the `getHolding`/`getAllHolding`
  response, per-instrument, for instruments the user actually holds. This changes the
  Security Master design in [security-master.md](security-master.md): the instrument
  master bootstrap (daily dump) populates identity + `instrument_version` for the whole
  exchange universe, but `isin` on the canonical `instrument` row can only be backfilled
  incrementally, from holdings sync, for instruments the connected user(s) actually own —
  not from a single upfront import.
- **Type inconsistency observed across endpoints:** `symboltoken` appears as a string in
  the holdings/instrument-dump responses (`"3499"`) but as a numeric value in the LTP quote
  response example (`3048`). Coerce to string canonically rather than trusting either
  representation — this is exactly the "broker responses are untrusted input" rule
  (`CLAUDE.md` non-negotiable rule 3) in practice, not a hypothetical.

## Infrastructure requirements (spec §93.7)

- **Static IP is NOT mandatory for portfolio/read endpoints** — the docs explicitly scope
  the static-IP requirement to place/modify/cancel order requests only ("For APIs other
  than Orders & GTT, using a static IP is not mandatory"). Since Phase 1 places no orders,
  Angel One's own rules don't technically force fixed egress for Phase 1's actual traffic.
  **This doesn't change the platform-wide policy** — `CLAUDE.md` rule 7 already commits to
  fixed egress for anything touching a broker API, independent of what any one broker
  currently requires, because the requirement is broker- and feature-dependent and the
  policy needs to hold as scope grows. Recording this as a fact, not a reason to relax it.
- Up to 5 static IPs per API key; one static IP maps to exactly one client at a time;
  IP changes limited to once per calendar week.
- Required request headers on every call: `X-UserType`, `X-SourceID`, `X-ClientLocalIP`,
  `X-ClientPublicIP`, `X-MACAddress`, `X-PrivateKey` (API key), plus `Authorization: Bearer`.
  The client IP/MAC headers being mandatory on every request (not just order placement)
  is itself an infra fact worth designing around early.

## Pricing

SmartAPI itself carries no subscription fee — access requires an Angel One trading account,
and API-placed trades incur normal brokerage. **Not independently verified by me** —
sourced from third-party summaries, not the primary docs pages I browsed. Worth a direct
check before relying on it, since broker-adapters.md requires primary-source verification.

## A regulatory signal surfaced during this pass, not asked for but material

Searches for Angel One's third-party/multi-user API policy surfaced that SEBI's
"Safer participation of retail investors in Algorithmic trading" framework became fully
mandatory April 1, 2026 (already in effect as of this pass) and that Angel One's SmartAPI
changed in response: **only one API key is permitted for non-registered, client-generated
algos**, and retail algo strategies generally must be hosted on the broker's servers unless
self-hosted from a registered static IP.

I have **not** determined whether this framework applies to Phase 1 as scoped — it appears
to govern automated order placement ("algo trading"), and Phase 1 places no orders at all.
But it's squarely the kind of finding Gate A (regulatory position, spec §94.2) and Gate C
(broker commercial terms, spec §1) exist to catch, and it wasn't visible before this
verification pass. Flagging it into the record rather than either asserting it blocks
Phase 1 (I don't think it does) or silently sitting on it. Worth surfacing to whoever is
running the Phase 0 feasibility pack.

## Not resolved by this pass

- **The two commercial gating questions from spec §1** (do Angel One's terms permit a
  third party to connect other users' accounts; what algo-provider status this creates) —
  explicitly not answerable from documentation per the spec itself. Angel One remains
  `COMMERCIAL TERMS UNRESOLVED` regardless of the technical findings above.
- WebSocket streaming, EDIS, GTT, historical data, margin calculator, option Greeks — not
  reviewed, since none are in Phase 1 scope.
- Whether the refresh token itself expires at midnight or only the JWT does.
- Trade-book retention window beyond "current day" (see risk note above).
- SmartAPI pricing, independently.
