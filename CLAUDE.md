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

Marked below where the regulatory decision makes the boundary **permanent** (never, under
this position, not just "not yet") versus still just a **Phase 1 sequencing** boundary
(legitimate later, once Phase 1 ships).

- **Order placement of any kind.** *(Phase 1 sequencing — Option B explicitly permits
  "execution convenience," i.e. user-initiated order placement with no AI proposal
  attached. Not foreclosed, just not now.)* No order APIs, no order UI, no dry-run order path.
- **Any AI feature beyond read/explain.** *(Permanent above T1.)* T0 (read) and T1 (analyze,
  no side effects — spec §67/§74) remain legitimate later. Anything that proposes, scores,
  or suggests a trade (T2+) is foreclosed by the regulatory decision, not just deferred.
- **Signals, strategies, backtesting, paper trading.** *(Permanent.)* These only exist to
  support recommendations — spec §94.2 Option B rules out what they're for, not just their
  timing.
- **Performance display.** *(Permanent.)* No win rates, no returns, no statistics shown to a
  user — ever, under this position, not only in Phase 1.
- **A second broker.** *(Phase 1 sequencing.)* The adapter interface must support one, proven,
  first.
- **Options Greeks/IV/chain analytics.** *(Phase 1 sequencing, not permanent — corrected from
  earlier framing.)* Spec §94.2 Option B's own wording permits "portfolio analytics," and
  spec §92.2's Greeks/IV computation is explicitly T1 (ANALYZE), not a recommendation. Options
  *positions* display is already in Phase 1; deeper chain analytics is legitimate later, same
  as order placement above — just not built yet.
- **Alerts and notifications** beyond operational/system health. *(Phase 1 sequencing.)*

If a task seems to require something on this list, stop and ask — for the permanent items,
the answer is that the task is out of scope by design, not misscoped; for the sequencing
items, the answer is usually "not yet," not "never."

## Regulatory position — DECIDED (2026-08-16)

**Option B — Analytics tool** (spec §94.2), the same position `IntradayScreener`
holds at real scale (~900k users), confirmed still viable as of
`docs/design/gate-a-b-research-findings.md`.

**This is a structural decision, not a Phase 1 boundary — the spec's own words:**
*"These are not points on a spectrum you can slide along later... B and C are
different products with different data models, different UI copy, different
obligations and different economics. Choosing between them after the codebase
exists means rewriting the parts of it that matter most."*

**Concrete, permanent consequence**: no recommendations, no signals, no performance
claims — ever, not just in Phase 1. This forecloses spec Sections 56–65 (strategy
certification, signal objects, performance evidence bundle) and most of the AI
action catalogue in §67/§74 — anything at tier T2 (PROPOSE) or above assumes a
recommendation is being made, which this position rules out by choice, not by
current scope. What remains buildable under this position: T0 (READ) and T1
(ANALYZE, no side effects) — data, scanners, portfolio analytics, explanation.
"AI-powered analysis" under this decision means the AI can explain and analyze; it
cannot suggest, propose, or score a trade idea.

The current blueprint for this feature area, scoped to what this decision actually
permits (T0 read + T1 analyze only — explanation, never recommendation), is
`docs/design/ai-analytics-options-intraday-delivery.md`. The original
`docs/design/ai-options-intraday-delivery-blueprint.md` is superseded and kept only
as a historical record of pre-decision thinking — not a current design.

Considered and set aside: **Option C — registered Research Analyst** (Sensibull's
actual position, confirmed viable at real scale, but with the NISM certification,
principal-analyst, and now-live PaRRVA obligations from the same research doc) and
**Option A — personal tool only** (would leave the multi-user architecture already
built — OpenBao, per-account isolation — as more than the product needs).

## Other blocking gates — still not cleared

- **B. Research data licensing** — historical options data availability and cost
  (spec §93.2). Research done (`docs/design/gate-a-b-research-findings.md`):
  standard vendor licenses (TrueData, GDFL) are confirmed internal-use-only;
  redistribution requires a separate, unpriced license. Not resolved — narrowed.
- **C. Broker commercial terms** — whether third-party multi-user integration is
  permitted (spec §1). Still requires Angel One's own partnership/API team, not
  documentation research. Unaffected by the regulatory-position decision above.
  Outreach brief prepared and ready to send: `docs/design/gate-c-broker-outreach.md`
  — the specific questions to ask, reflecting the decided (not the original fuller)
  product scope. Not sent yet; sending it is the user's action, not this repo's.

Given the regulatory decision above, Gate B now matters less than it did — an
analytics-tool position doesn't need a backtest engine or certified strategy
performance claims, which were the main things Gate B's data licensing was blocking.
Gate C remains a real, unresolved blocker for any multi-user product regardless of
regulatory position. Do not design around an assumed outcome on Gate C.

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
- Broker (Phase 1): Angel One (SmartAPI) — adapter implemented and live-verified against a
  real account (`docs/design/angel-one-live-verification.md`): authentication, profile,
  holdings, positions, funds, order book, trade book all confirmed working, no static IP
  required for any of them. Commercial terms remain unresolved (Gate C, above) — technical
  verification is not the same as permission to serve other users.

## Commands

<!-- Add as they're established. -->
