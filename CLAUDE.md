# Project: Multi-Broker Portfolio Platform (Indian markets)

## What this repo is

Phase 1 of a multi-broker portfolio and trading platform for Indian markets.

**Phase 1 is read-only portfolio aggregation for a single broker.** Nothing else.

The full product specification lives at `docs/MASTER-SPEC.md` (~135KB, 96 sections). It is the
constitution — the thing we check decisions against. **Do not read it in full unless asked.**
Read the specific sections named in a task. Ask me if you think a section applies and you
haven't been pointed at it.

## Phase 1 scope — IN

- Security master: canonical instrument identity, broker symbol/token mapping (spec §18)
- Broker adapter for ONE broker, behind a common interface (spec §4, §40)
- Sync: holdings, positions, orders, trades, funds, margin
- Canonical account model — no broker-specific structures leak past the adapter (spec §4)
- Reconciliation engine: our state vs broker state, mismatch detection, no silent overwrite (spec §13)
- External trade detection (spec §14)
- Unified + per-broker portfolio views (spec §15, §16)
- Duplicate holding aggregation across accounts (spec §17)
- Secrets handling, encryption, audit logging from day one (spec §96.3)

## Phase 1 scope — OUT. Do not build, scaffold, stub, or "prepare for" these.

- **Order placement of any kind.** No order APIs, no order UI, no dry-run order path.
- **Any AI or LLM feature.** No chat, no analysis, no explanations, no model calls.
- **Signals, strategies, backtesting, paper trading.** None of it.
- **Performance display.** No win rates, no returns, no statistics shown to a user.
- **A second broker.** The adapter interface must support one, proven, first.
- **Options analytics.** Options *positions* display, yes. Greeks, IV, chain analytics, no.
- **Alerts and notifications** beyond operational/system health.

If a task seems to require something on this list, stop and ask. The answer is usually that
the task is misscoped, not that the boundary should move.

## Blocking gates — not yet cleared

Three questions are unresolved and are being answered outside this repo
(`docs/PHASE-0-FEASIBILITY-PACK.md`):

- **A. Regulatory position** — analytics tool vs registered advisory vs algo provider (spec §94.2)
- **B. Research data licensing** — historical options data availability and cost (spec §93.2)
- **C. Broker commercial terms** — whether third-party multi-user integration is permitted (spec §1)

Phase 1 as scoped above is valid under every outcome of all three. **Anything beyond Phase 1
is blocked until they are answered.** Do not design around an assumed outcome.

## Non-negotiable rules

These come from the spec and are not subject to convenience.

1. **No fabricated data, ever.** No mock market data, no sample holdings, no placeholder
   prices, no invented API responses outside clearly-marked test fixtures. If real data is
   unavailable, the feature shows an explicit unavailable state. A UI that looks like it
   works but is showing invented numbers is the single worst outcome in this project.

2. **No invented broker APIs.** If an endpoint or field isn't in the current official docs,
   it does not exist. Say so and mark the capability unavailable (spec §52). Don't infer an
   endpoint from another broker's API.

3. **Broker responses are untrusted input.** Validate everything crossing that boundary.

4. **Secrets never touch application code.** Broker tokens, API keys, TOTP seeds live in the
   secrets store. Never in config, env files, source, DB columns, logs, traces, or error
   messages (spec §96.3). Automated redaction at the logging layer, not code review.

5. **Never silently overwrite on reconciliation mismatch.** Surface it (spec §13).

6. **Preserve broker-native state alongside canonical state.** Never lose the original
   (spec §11).

7. **Static IP / fixed egress** is assumed for anything touching a broker API (spec §93.7).
   Don't design the broker path around ephemeral serverless.

## How I want you to work

- **Plan before building.** For anything beyond a single file, show me the approach first.
- **Small, reviewable changes.** I'd rather review five focused diffs than one large one.
- **Ask when the spec is ambiguous.** Don't resolve ambiguity by picking the convenient reading.
- **Tests for the reconciliation and security master logic specifically** — those are where
  correctness actually matters in Phase 1.
- **Tell me when you're uncertain.** "I think X but haven't verified" is more useful than a
  confident wrong answer. This applies especially to broker API behaviour.
- If you notice something in the spec that looks wrong or contradictory, say so. It has been
  through several revisions and is not sacred.

## Stack

- Language / runtime: Node.js / TypeScript
- Database: Postgres + TimescaleDB extension for time-series; audit/consent ledger as a
  hash-chained append-only Postgres table (spec §93.3, §43)
- Broker (Phase 1): Angel One (SmartAPI) — capability coverage, order types, WebSocket depth,
  and rate limits are UNVERIFIED and require the full broker-adapter verification pass before
  any adapter code is written (spec §1, §52)

## Commands

<!-- Add as they're established. -->
