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

Marked below where the current regulatory working position makes the boundary **permanent**
(never, under this position, not just "not yet") versus still just a **Phase 1 sequencing**
boundary (legitimate later, once Phase 1 ships). See the Gate A section below — this working
position is informed, not yet decided.

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
items, the answer is usually "not yet," not "never." **"Permanent" below means "permanent
under the current working position" — see the correction just below. It constrains design
now; it isn't yet backed by qualified legal/compliance review.**

## Gate A (regulatory position) — corrected: working position, not decided

**2026-08-16 correction, from the owner, and it matters:** this was recorded as
"DECIDED." It isn't. Research and reasoning in this repo produced a working
position — **Option B, analytics tool** (spec §94.2), the same position
`IntradayScreener` holds at real scale, per `docs/design/gate-a-b-research-findings.md`
— but that's this project's own analysis, not qualified regulatory review. Gate A
stays formally **OPEN**, on the same footing as Gates B and C, until real legal/
compliance review validates it. **What that review actually requires — who to
engage, realistic cost/timeline, the specific question to ask — is in
`docs/design/gate-a-resolution-path.md`.** Not sent/engaged yet; same as Gate C,
that's the owner's action. The OUT-of-scope list above is designed against
this working position because designing against nothing isn't better — but it's a
working position under active review, not a closed decision the way a technical
architecture choice would be.

**What the working position implies, if it holds**: no recommendations, no
signals, no performance claims. This is why spec Sections 56–65 (strategy
certification, signal objects) and the AI action catalogue above T1 are treated as
out of scope in this document — not because it's certain, but because designing
for the more permissive reading first and discovering it doesn't hold would cost
more than designing conservatively and loosening later.

The current blueprint for this feature area, scoped to the working position (T0
read + T1 analyze only — explanation, never recommendation), is
`docs/design/ai-analytics-options-intraday-delivery.md`. The original, fuller
`docs/design/ai-options-intraday-delivery-blueprint.md` is kept as a historical
record, not a current design — not because Option B is certain, but because it's
still the more likely direction pending review.

A narrower, deeper pass on holding-level/portfolio-composition AI capabilities
specifically (spec §19–22) is `docs/design/ai-holding-analysis-blueprint.md` —
it also surfaces an unresolved contradiction between spec §19/§15 (which want
return/performance figures) and this file's own permanent "no returns, ever"
rule, not yet decided.

Considered and not currently favored: **Option C — registered Research Analyst**
(Sensibull's actual position, confirmed viable at real scale, but with real cost:
NISM certification, principal-analyst appointment, now-live PaRRVA obligations) and
**Option A — personal tool only** (would leave the multi-user architecture already
built — OpenBao, per-account isolation — as more than the product needs). Qualified
review could still land on either.

## Gates B and C — open

- **B. Research data licensing** — historical options data availability and cost
  (spec §93.2). Research done (`docs/design/gate-a-b-research-findings.md`):
  standard vendor licenses (TrueData, GDFL) are confirmed internal-use-only;
  redistribution requires a separate, unpriced license. If the Option B working
  position holds, this matters much less than it did — no backtest engine, no
  certified strategy performance, which were the main things it was blocking.
- **C. Broker commercial terms** — whether third-party multi-user integration is
  permitted (spec §1). Requires Angel One's own team, not documentation research.
  **Outreach prepared, questions and confirmed destination
  (`smartapi@angelone.in`, from Angel One's own FAQ page) in
  `docs/design/gate-c-broker-outreach.md`. Sending it is the owner's action.**

Do not design around an assumed outcome on any of the three.

## Operating mode while Gates A/B/C are open (updated 2026-08-16)

Decision-gated, not stopped. **Only the AI/multi-user layer waits on the gates —
everything gate-independent keeps moving.**

- **Gate C outreach is prepared, questions plus confirmed destination
  (`smartapi@angelone.in`) in `docs/design/gate-c-broker-outreach.md`.** Sending
  it is the owner's action, not something to do from inside this repo. Priority:
  send this one — it's the thing most fully in the owner's own control.
- **Gate A has a ready professional-review package**:
  `docs/design/gate-a-professional-review-package.md` (self-contained brief for
  external counsel/compliance advisor — no repo context assumed) plus
  `docs/design/gate-a-resolution-path.md` (who to engage, realistic cost/timeline).
  Engaging someone is the owner's action.
- **Gate B has a Data Source Matrix**: `docs/design/gate-b-data-source-matrix.md`
  — narrows what a real vendor conversation would need to confirm, doesn't
  replace one. No purchase made.
- **Stop implementation work that depends on Gate C.** No multi-user broker
  architecture code, even scaffolding.
- **Don't keep expanding the multi-user architecture spec while the answer is
  pending.** The blueprints that exist are enough to resume from; more design
  before the answer risks designing around an assumed outcome, the exact thing
  this file has said not to do since before Phase 1 started.
- **Phase 1 code stays stable.** Frozen means frozen — don't revisit it looking
  for work to do. **The one narrow exception that used to sit here — re-running
  the historical-candle verification on a real trading day — is now DISCHARGED
  (2026-08-29).** The endpoint is confirmed returning real candles, the accepted
  datetime format is pinned, and a silent `fromdate` boundary trap is documented:
  see the "Historical candles" section of
  `docs/design/angel-one-verification.md`. It needed no credentials in the end —
  the JWT already stored in OpenBao by the app's own login was used locally and
  never surfaced. Nothing else about Phase 1 reopens.
- **Parallel work is fine wherever it's genuinely independent of Gate C** —
  Gate A/B research and documentation, the above verification item. Not live AI
  trading or recommendation implementation under any framing.
- **When an Angel One response arrives**, analyze it against the specific
  questions already in `docs/design/gate-c-broker-outreach.md` and record, for
  each one, whether the response confirms it, rejects it, or leaves it
  unresolved — don't just summarize the reply, map it back to what was asked.

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

- **`start.cmd` — the normal way to run everything locally.** Checks the Postgres
  service, starts OpenBao if it isn't already up, builds, then runs the app.
  Dashboard at `http://localhost:$PORT`.
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — compiles `src/` to `dist/`
- `npm start` — runs `dist/http/server.js` with `.env` loaded; dashboard at
  `http://localhost:$PORT` (static files in `public/`, served by the same Fastify
  app as the JSON API — see `src/http/server.ts`). Assumes Postgres and OpenBao are
  already running — `start.cmd` is what handles that.

`OPENBAO_TOKEN` in `.env` must be a **plain** value (a UUID is fine), not one with
OpenBao's own `s.` prefix: `start.cmd` pins the dev-mode root token to it via
`-dev-root-token-id`, and OpenBao rejects an `s.`-prefixed ID with `invalid request`.
Pinning is what stops dev mode's fresh-random-token-per-restart from silently
invalidating `.env` (which surfaced as `SessionStore.save failed: HTTP 403`).
