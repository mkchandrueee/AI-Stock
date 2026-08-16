# AI-powered Options + Intraday + Delivery analysis — architecture blueprint

## SUPERSEDED (2026-08-16) — kept as a historical record, not a current design

`CLAUDE.md` decided Gate A as **Option B (analytics tool)** — no recommendations,
no signals, no performance claims, ever, under this position. Everything below
assumes the fuller signal-generation architecture from spec Parts B/C (strategy
certification, the Signal object, AI action tiers T2/PROPOSE and T3/STAGE), which
that decision forecloses. This document is **not deleted**, on the same principle
this project has applied to broker-native data and audit history throughout: never
silently discard prior work. It's preserved in case the regulatory position is ever
deliberately revisited — the spec itself is explicit that would mean rebuilding the
parts of the product that matter most, not a small toggle.

**The current, buildable blueprint for this feature area is
[`ai-analytics-options-intraday-delivery.md`](ai-analytics-options-intraday-delivery.md)**
— scoped to what Option B actually permits (T0/T1: read and explain, never propose).

## STATUS (original, pre-decision): BLUEPRINT ONLY. NOT FOR IMPLEMENTATION.

This document is architecture and contracts for review, per the master spec's own
instruction: *"Produce architecture, contracts and matrices for review and then
stop... The correct response to this document is a blueprint and a set of
questions, not a codebase."* Nothing in this document should be built until the
blocking conditions in **"What has to happen before this leaves blueprint status"**
are resolved. Where this doc uses the word "would," it is describing a design, not
announcing work in progress.

This also does not modify `CLAUDE.md`'s Phase 1 scope. Phase 1 (read-only portfolio
aggregation, single broker, no AI, no signals, no options analytics beyond position
display) remains what's actually being built and shipped. This blueprint exists
alongside it, not instead of it.

## Why this is gated, restated precisely

Three things from `CLAUDE.md`, unresolved, all directly implicated by this specific
request:

- **Gate A (regulatory position)** — spec §94.2 is explicit that portfolio-aware
  recommendations, certified strategies emitting directional signals, and displayed
  performance metrics sit "materially closer to research/advisory activity" than a
  technical filter. "AI-powered analysis" generating options/intraday/delivery ideas
  is precisely this category, not adjacent to it.
- **Gate B (data licensing)** — spec §93.2 is blunt that broker-sourced market data
  is licensed for that user's own use, not for building the historical research
  corpus a backtest engine needs, and that "historical options data in India is the
  hard one." This blueprint's backtest/validation layer (§57–58) cannot be built
  before this is resolved — implementation instruction #10 says so directly:
  *"Resolve data sourcing before building the backtest engine... an engine that
  assumes data you cannot buy is wasted work."*
- **Gate C (broker commercial terms)** — unchanged since the very first session
  finding: Angel One remains `COMMERCIAL_TERMS_UNRESOLVED`. This blueprint assumes
  nothing about whether the eventual product can legally serve multiple third-party
  users at all.

Additionally, this blueprint depends on a production authentication decision this
project has deliberately not made: whether the platform ever collects real users'
PIN/TOTP (`angel-one-live-capability-matrix.md`'s open question). A multi-user
signal/advisory product needs *someone's* session to check portfolio-aware
eligibility (§83) against — that's a harder requirement than Phase 1's own
single-account read path.

## What "AI-powered Options + Intraday + Delivery analysis" maps to in the spec

Not one feature — a categorization spanning spec §56's own strategy taxonomy:

| Requested capability | Spec strategy category | Primary governing sections |
|---|---|---|
| Intraday analysis | `intraday` | §56 (strategy object), §59 (certification ladder), §61 (signal schema) |
| Delivery analysis | `swing` / `positional` | Same as above |
| Options analysis | `options-directional` / `options-neutral` | §92 (options intelligence engine) in addition to the above |

All three share the same underlying machinery — a strategy must be certified before
it may speak (§59), every signal it emits is immutable, expiring and evidenced
(§61), and every number it produces to a user must trace to a deterministic source,
never a language model (§75). Options-specific structures layer §92 on top of that
shared foundation; they don't replace it.

## Target architecture — layered, and what's already built vs. new

```
┌─────────────────────────────────────────────────────────────────┐
│ EXISTING (Phase 1, built and verified against real infrastructure) │
├─────────────────────────────────────────────────────────────────┤
│ Security Master  │ Canonical Account Model  │ BrokerAdapter        │
│ AccountSyncService │ ReconciliationEngine    │ Hash-chained AuditLog│
│ SessionStore (OpenBao) │ Portfolio Views (no P&L)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                    reused as-is, unchanged
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ NEW — DATA LAYER (§92.1, §93)                                     │
├─────────────────────────────────────────────────────────────────┤
│ OptionsChainIngestion │ HistoricalDataProvider (licensed, NOT      │
│ (per §92.1 fields)    │ broker-sourced — Gate B)                   │
│ MarketDataProvider    │ CorporateActionsProvider                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ NEW — STRATEGY & SIGNAL LAYER (§56–65)                             │
├─────────────────────────────────────────────────────────────────┤
│ StrategyRegistry (versioned, immutable — §56)                     │
│ BacktestEngine (point-in-time, no look-ahead — §57)  ← Gate B       │
│ ValidationProtocol (OOS/walk-forward/Monte Carlo — §58)            │
│ CertificationLadder (L0→L5 — §59)                                  │
│ PerformanceEvidenceBundle (win-rate rule — §60)                    │
│ SignalObjectStore (immutable, TTL'd — §61)                         │
│ SetupQualityEngine (strategy prior vs. instance quality — §62)     │
│ StrategyHealthMonitor (decay detection, auto-demotion — §63)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ NEW — OPTIONS INTELLIGENCE (§92)                                   │
├─────────────────────────────────────────────────────────────────┤
│ DerivedMetricsEngine (OI, PCR, max pain, buildup — §92.2)          │
│ GreeksEngine (deterministic, never the LLM — §75, §92.2)           │
│ StrategySelectionEngine (thesis → structure, never model-picked)  │
│ PayoffScenarioEngine (§92.4) │ PositionManagementEngine (§92.5)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ NEW — AI ACTION LAYER (§67, §74–91)                                 │
├─────────────────────────────────────────────────────────────────┤
│ AIActionCatalogue (T0–T3 only; T4 absent from tool surface — §74)  │
│ NumericGroundingValidator (blocks any model-authored ₹/qty — §75)  │
│ Agent roles: ANALYST │ PORTFOLIO │ RISK │ CRITIC (mandatory — §76) │
│ ConversationalSafetyLayer (referent/unit/negation resolution — §77)│
│ ProactivityBudget (§78) │ AbstentionEngine ("NO_SIGNAL" — §79)     │
│ BehaviouralCoach (§80) │ EvalSuite (§86, gates every release)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ NEW — GOVERNANCE, RUNNING ACROSS EVERY LAYER ABOVE                  │
├─────────────────────────────────────────────────────────────────┤
│ CompliancePolicyService (§70 — runtime gate, not launch checklist)│
│ EventDrivenRuntime: hot/warm/cold/batch tiers, NO model calls on   │
│   hot or warm path (§95)                                          │
│ ApprovalService + ApprovalRequest object (§65) — reuses the        │
│   secrets/session boundary already built (SessionStore), extends  │
│   it with the T3/T4 tier wall (§67)                                │
└─────────────────────────────────────────────────────────────────┘
```

Everything in the top box exists today, is committed, and is verified against real
Postgres/OpenBao/Angel One infrastructure. Everything below it is new design, not
new code — and per the gates above, stays that way for now.

## Non-negotiables carried forward from what's already been learned this project

These aren't new principles invented for this blueprint — they're the same
discipline already applied to Phase 1, now extended to a much higher-stakes surface:

- **"Never silently overwrite" (already built into `ReconciliationService`) becomes
  "never silently invent a number."** §75's numeric grounding rule is the AI-layer
  version of the exact same instinct that made `AccountSyncService` refuse to guess
  whether a vanished holding was sold or a broker glitch. Same posture, higher
  stakes: a model-generated risk figure is worse than a silently-dropped holding.
- **T4 (execute) must be architecturally unreachable from the model**, the same way
  `AngelOneAdapter`'s interface has no `placeOrder` method at all — not a permission
  check, an absence. §67/§74 ask for exactly the boundary-by-omission already
  practiced in this codebase.
- **The audit log's hash-chain discipline extends naturally to §71's lineage
  requirement** — every signal, approval and (eventually) order needs to trace back
  through strategy version, certification record and evidence, the same tamper-evident
  posture `audit_log` already has for session events.
- **The Compliance Policy Service (§70) is the AI-era equivalent of `SessionStore`'s
  least-privilege `app_user` role** — a runtime gate that makes a category of mistake
  structurally impossible, not a code-review reminder. Both exist because this
  project's own retrospectives (the sync-service delete bug, the audit-log hash bug)
  showed that "be careful" doesn't survive contact with real complexity — enforcement
  has to be structural.

## What has to happen before this leaves blueprint status

In the order the spec itself prioritizes (implementation instructions #10, #11, #14):

1. **Gate A resolved or explicitly accepted** — a documented decision on regulatory
   identity (analytics tool / registered advisory / algo provider), not an assumption.
2. **Gate B resolved** — a Data Source Matrix (§93.2) actually filled in from real
   vendor contracts, establishing what historical options data is obtainable at all,
   since it caps what §58's validation protocol can ever certify.
3. **Gate C resolved** — real commercial terms from Angel One (or whichever broker),
   not just technical capability (already proven working).
4. **A production authentication decision** — resolving the still-open question from
   `angel-one-live-capability-matrix.md` about whether/how the platform authenticates
   real users at scale, since portfolio-aware signal eligibility (§83) requires it.
5. Only then: build in the order implementation instruction #1 specifies — *"the
   strategy registry, backtest engine and validation protocol before any
   signal-generation feature. A signal without certification infrastructure is a
   liability."*

Until then, this stays a blueprint.
