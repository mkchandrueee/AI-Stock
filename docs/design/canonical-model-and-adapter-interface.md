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

## What's deliberately not here yet

- No `AngelOneAdapter` class implementing this interface — that's the next step, after
  this contract is reviewed.
- No dependency-injection wiring, no HTTP client choice, no retry/backoff policy — those
  belong to the implementation, not the contract.
- No persistence layer for these types (how `Holding` rows get stored) — that's the
  Postgres schema, a separate design step.
