# AI-powered Options + Intraday + Delivery analysis — current blueprint

## STATUS: blueprint for review. Supersedes the pre-decision version.

Scoped to what `CLAUDE.md`'s decided regulatory position (Option B — analytics
tool, spec §94.2) actually permits: **T0 (read) and T1 (analyze, no side effects)
only — spec §67/§74.** No signal, no recommendation, no proposal, no performance
claim, anywhere in this document. Where the original blueprint
(`ai-options-intraday-delivery-blueprint.md`) leaned on spec Parts B/C's
certification/signal apparatus, this one deliberately doesn't — that apparatus only
exists to support recommendations, which this position rules out.

Still gated on **Gate C (broker commercial terms)** — unaffected by anything in
this document, still unresolved, still a hard blocker for serving any user other
than the account this project has already live-tested against. Gate B (data
licensing) matters far less here than in the original blueprint — see "Data
sourcing" below for why, and where it still applies.

## The line, drawn precisely — this is the part worth the most scrutiny

"Explain" and "recommend" look similar on the page and are regulatorily very
different. Getting this wrong isn't a style problem, it's the whole reason Gate A
existed. Per spec section, explicitly marked:

| Spec section | What it describes | In or out under Option B, and why |
|---|---|---|
| §19 Portfolio AI Analyst | "What's underperforming, why" | **In, if framed as description.** "This holding is down 8% over 30 days, sector average is -2%" is a fact. "You should review this position" is not — the line is the imperative, not the observation. |
| §20 Portfolio Health Score | Per-dimension risk scores (concentration, diversification, etc.) | **In.** A labelled, inspectable score on a defined dimension is analysis, not advice — same category as a credit-utilization percentage. Must stay per-dimension, never collapse into one opaque number (spec's own instruction, independent of the regulatory question). |
| §21 Portfolio Recommendations | "POTENTIAL ADDITION," "REBALANCING OPPORTUNITY" | **Out.** Named and framed as recommendations. No reframing rescues this — it's the thing Option B rules out. |
| §22 Portfolio Rebalancing Engine | Current vs. target allocation gap, "potential rebalance actions" | **Partially in.** Showing the *gap* between a user's own stated target and current allocation is arithmetic, not advice — spec itself notes potential actions need compliance classification (§70), which this document resolves as: show the gap, never suggest what to do about it. |
| §23 AI Trade Recommendation Engine | Portfolio-aware trade ideas | **Out entirely.** This is the section spec §94.2 names directly as advisory-adjacent. No version of this belongs in an analytics-tool product. |
| §24 Portfolio-Aware Options Strategies | Hedge suggestions against a specific held position | **Out.** Same reasoning as §23 — a hedge *suggestion* tied to *this user's* position is personalized advice regardless of how it's computed. |
| §92.2 Derived Metrics (OI, PCR, max pain, buildup, IV, Greeks) | Options chain analytics | **In, fully.** This is Option B's own wording — "portfolio analytics" — almost verbatim. Compute and display; never caption it with a directional call. |
| §92.3 Strategy Selection ("thesis drives structure") | Maps a stated market view to an options structure | **Out as specified, in if re-scoped to generic/educational.** "Given a bullish view, structures commonly used include X/Y/Z, here's how each behaves" (textbook-style, no reference to the user's specific position or account) is explanation. "Given *your* bullish view *on this holding*, we suggest X" is a proposal. Same line as §23/§24, just easy to miss because it's framed as "thesis-driven," not "AI-driven." |
| §92.4 Payoff & Scenario | Payoff diagrams, breakevens, scenario sensitivity for a structure the *user* specifies | **In.** The user picks the structure; the tool computes its properties. No suggestion embedded. |
| §45 Scenario Analysis | "What if NIFTY falls 3%?" | **In**, already partially precedented by spec's own labelling requirement (`SIMULATION/ESTIMATE`, not prediction) — same discipline extends cleanly here. |
| Intraday/technical screening (IntradayScreener's actual product) | User-defined or preset technical filters | **In.** This is literally the precedent product's whole business, confirmed still viable at scale in `gate-a-b-research-findings.md`. |

## Data sourcing — Gate B's relevance narrows, doesn't disappear

The original blueprint's Gate B concern was about licensing a **historical research
corpus** to certify strategies (spec §57–58). That requirement is gone — there's
nothing to certify. What's left:

- **Per-user, on-demand analysis** (explain this holding, compute this option's
  Greeks right now, chart this stock's technicals) can be served from the
  connected user's *own* broker session — already proven working end-to-end in
  `angel-one-live-verification.md`: LTP quotes, historical candles, and (per
  `angel-one-verification.md`'s original capability check) options-adjacent fields
  on positions, all confirmed live against a real account, no static IP required,
  no additional data license needed beyond what's already licensed to that user for
  their own use (spec §93.2's own framing).
- **A shared, cross-user feature** — a market-wide screener ranking many
  instruments for many users simultaneously, the way IntradayScreener actually
  works — is a different data-engineering problem. Hitting each user's own
  rate-limited broker session per screen isn't how that scales; a shared dataset
  refreshed on a schedule is. That reintroduces a licensing question, but at a much
  smaller scope than a multi-year options-history corpus: current/recent market-wide
  quotes and technicals, not deep historical options chains. Worth its own,
  narrower Data Source Matrix pass (spec §93.2) when this feature is actually being
  built — not resolved here.

## Architecture — what's reused vs. new

```
REUSED, UNCHANGED (Phase 1, frozen)
  Security Master · Canonical Account Model · BrokerAdapter
  AccountSyncService · ReconciliationEngine · AuditLog · SessionStore

NEW — DATA
  Per-user: reuses AngelOneAdapter's already-verified getLtpData/getCandleData
  paths directly — no new provider needed for the per-user case.
  Shared/cross-user (if built): MarketDataProvider, per spec §96.6's abstraction
  symmetry — same adapter-boundary discipline already applied to brokers.

NEW — ANALYTICS (T1 only, per spec §92.2 + the table above)
  DerivedMetricsEngine (OI/PCR/max pain/buildup)
  GreeksEngine (deterministic — spec §75, same rule as everywhere else in this
    project: no financial number ever comes from a language model)
  TechnicalScreeningEngine (indicators, filters — the IntradayScreener precedent)
  PortfolioHealthEngine (per-dimension scores — spec §20)

NEW — AI EXPLANATION LAYER (T0 read + T1 analyze only)
  AIActionCatalogue — T0/T1 actions ONLY; nothing above that tier exists in the
    catalogue at all (same "absence is a stronger control than refusal" principle
    as T4 in the original blueprint — spec §74)
  NumericGroundingValidator — unchanged requirement even here: an AI-generated
    *explanation* that states a wrong number is exactly as dangerous as a wrong
    trade proposal. Every number the model references must trace to
    DerivedMetricsEngine/GreeksEngine/PortfolioHealthEngine, never itself.
  ProvenanceLabelling (spec §87) — AI_ANALYSIS visually distinct from COMPUTED fact,
    same as the original blueprint's version of this rule.
```

## What still can't be built, restated plainly

No signal, no strategy object, no certification ladder, no approval-to-trade flow,
no performance evidence bundle, no win rate, no "this looks like a good setup." The
prohibited-language filter from spec §60 (`guaranteed`, `sure shot`, `accuracy
XX%`, etc.) applies here too, even without performance claims attached — the reason
those phrases are banned is the *implication* of certainty, not just the specific
metric they'd otherwise attach to.

## Still blocked on Gate C

Everything above assumes a session for one connected user, which is exactly what's
proven to work. Serving this to other users — the actual product — is still
unresolved: Angel One remains `COMMERCIAL_TERMS_UNRESOLVED`, and nothing in this
document changes that. This blueprint answers "what could Phase 2 analysis features
look like, if we could serve users" — it doesn't answer "can we serve users."
