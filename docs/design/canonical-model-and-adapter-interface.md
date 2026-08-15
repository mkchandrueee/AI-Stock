# Canonical account model + broker adapter interface (spec §4)

Status: **DRAFT — contract only, no implementation.** This is the interface; Angel One's
implementation of it is the next step, not this one, so the interface can be reviewed on
its own merits before anything is built against it (per `SETUP.md`: "the interface first,
with one broker's implementation second, so the abstraction isn't shaped by a single
broker's quirks").

Files: [`src/core/types.ts`](../../src/core/types.ts) (canonical entities),
[`src/core/broker-adapter.ts`](../../src/core/broker-adapter.ts) (the adapter contract).

## Scope boundary held deliberately

Phase 1 is read-only (`CLAUDE.md`). The adapter interface has no `placeOrder`,
`modifyOrder`, or `cancelOrder` — not even as unimplemented stubs — because `CLAUDE.md`
explicitly forbids scaffolding or "preparing for" order placement. `getOrderBook` and
`getTradeBook` exist because reading orders/trades already placed (by any channel) is
required for reconciliation (§13) and external-trade detection (§14), which *are* in
scope — that's a read of broker state, not a write.

## Why the canonical model doesn't mirror Angel One's response shapes

Angel One's `getPosition` response, for example, mixes day/net positions, board lot size,
and buy/sell amounts in one broker-specific shape (see
[angel-one-verification.md](angel-one-verification.md)). None of that shape is allowed to
cross the adapter boundary (spec §4). The canonical types below are named and structured
from the spec's own vocabulary (§4's `Account → Cash Balance → Holdings → Positions →
Orders → Trades → Funds`), not from Angel One's field names, specifically so a second
broker's adapter doesn't have to fight the first one's assumptions.

Every canonical entity carries a `brokerNative: unknown` field holding the untouched
original broker response for that record. This isn't optional decoration — it's
non-negotiable rule 6 ("preserve broker-native state alongside canonical state, never lose
the original") and spec §11 ("never lose the original broker status"), given real shape.

## Canonical entities (`src/core/types.ts`)

- `Account` — one per connected broker account. Holds `brokerAccountRef` (an opaque
  broker-assigned identifier, never interpreted by the rest of the platform) rather than
  any broker-specific account structure.
- `FundsSnapshot` — cash + margin together, because that's what brokers actually return
  as one unit (Angel One's RMS endpoint doesn't separate them) — not modeled as two
  entities speculatively.
- `Holding` — references `instrument_id` from the Security Master
  ([security-master.md](security-master.md)), never a broker symbol directly.
- `Position` — same instrument reference; separate from `Holding` because brokers
  distinguish delivery holdings from open positions and collapsing them loses that
  distinction the reconciliation engine needs.
- `Order` — canonical status is the state machine from spec §11
  (`CREATED → VALIDATING → APPROVED → SUBMITTED → ACKNOWLEDGED → OPEN →
  PARTIALLY_FILLED → COMPLETE`, or `REJECTED/CANCEL_PENDING/CANCELLED/FAILED/EXPIRED`).
  `brokerNativeStatus: string` sits alongside it, unmapped, because collapsing broker
  status strings into the canonical enum is lossy and the original must survive (rule 6).
  Every `Order` Phase 1 will ever see has `origin: 'EXTERNAL'` — there is no platform
  order-placement path yet, so this field exists to be honest about that, not to imply
  a `'PLATFORM'` path is coming.
- `Trade` — a fill against an order; kept separate from `Order` because a single order can
  have multiple trades (partial fills) and the journal (§34, Phase 2+) needs each fill.

## Canonical errors (broker-adapters.md)

`broker-adapters.md` requires each of these to be a **distinct** canonical error, not a
generic "API error": `TOKEN_EXPIRED`, `MARKET_CLOSED`, `RATE_LIMITED`, `NETWORK_TIMEOUT`,
`PARTIAL_DATA`, `MALFORMED_RESPONSE`, `UNEXPECTED_STATUS`. Defined as a discriminated union
in `types.ts` so an adapter can't return a broker-specific error code or message string in
place of one of these — the type system rejects it, not just a review comment.

## The adapter interface (`src/core/broker-adapter.ts`)

`BrokerAdapter` is intentionally small for Phase 1: `authenticate`, `refreshSession`,
`getProfile`, `getHoldings`, `getPositions`, `getFunds`, `getOrderBook`, `getTradeBook`.
Every method returns canonical types only.

`BrokerAdapterMetadata` is a separate, required property on every adapter — not optional —
because broker-adapters.md requires adapters to *declare* their own API version, capability
map, auth version, `last_verified_date`, and doc URL (§40), rather than that information
living only in a doc that can drift from the code. The `capabilityMap` covers the full
capability list from spec §1/§5 (not just what Phase 1 uses), each marked `SUPPORTED`,
`LIMITED_SUPPORT`, `NOT_CURRENTLY_SUPPORTED`, or `UNVERIFIED` — so a future second broker
slots into the same matrix without redefining it.

## Changes made while implementing `AngelOneAdapter`

Writing the implementation surfaced three problems with the interface as first
committed, fixed in place rather than worked around:

1. **Auth flow reshaped.** `authenticate(credentials)` assumed a direct call, which
   fits `loginByPassword` but not the `publisher-login` redirect flow the platform
   chose specifically to keep raw PIN/TOTP out of this codebase. Replaced with
   `getLoginUrl()` + `completeLogin(callbackParams)`. Further discovery:
   Angel One's own SDK source confirms the redirect flow returns no refresh token —
   only `loginByPassword` gets one — so `AuthSession` has no `refreshToken` field.
   There is no silent renewal path; session expiry is monitored via `expiresAt` and
   renewal means sending the user through `getLoginUrl()` again.
2. **`accountId` moved to a method parameter.** The original interface had adapters
   return a full `Account`/`Holding`/etc with `accountId` populated, but an adapter has
   no business minting the platform's own canonical id — that belongs to whatever
   service persists the account when the user connects a broker. Every data-fetching
   method now takes `accountId: string` from the caller; `getAccount` returns an
   `Account` with `accountId: ""` for the caller to fill in.
3. **`InstrumentResolver` needed two identifier fields, not one.** Angel One's trade
   book has no instrument token at all — only `(exchange, tradingSymbol)` — and its
   order book can have a null token on some rows too. The first version of
   `BrokerNativeInstrumentRef` only had `brokerInstrumentToken`, which would have
   forced a trading symbol into a field typed as a token. Both fields are now present
   and nullable; a resolver implementation looks up by whichever is populated.

See [`src/brokers/angel-one/adapter.ts`](../../src/brokers/angel-one/adapter.ts),
[`mappers.ts`](../../src/brokers/angel-one/mappers.ts), and
[`raw-types.ts`](../../src/brokers/angel-one/raw-types.ts) for the implementation.
Error-code mapping is grounded in the verified table at
`smartapi.angelbroking.com/docs/Exceptions` (2026-08-15) — see the adapter file for
which codes map to which canonical error, and which broker "not found" codes are
treated as a valid empty result rather than a failure (e.g. a user with zero holdings
isn't an error case).

## What's deliberately not here yet

- No dependency-injection wiring, no persistence layer for these types (how `Holding`
  rows get stored) — that's the Postgres schema, a separate design step.
- No real `InstrumentResolver` implementation — only the interface. It depends on the
  Security Master existing as running code, which it doesn't yet.
- Rate-limit governance and the daily-reauth monitoring/alerting service are explicitly
  platform-side concerns, not part of the adapter — see the comment on the
  `AngelOneAdapter` class.
- Several assumptions made during implementation are flagged inline rather than
  resolved: the `X-Client*`/`X-MACAddress` header semantics for a server-side
  multi-user platform, HTTP 403 as the rate-limit signal, and IST as the session's
  implied timezone. All are called out in `adapter.ts`'s file-level comment.
