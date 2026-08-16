# AI-powered holding analysis — focused blueprint

## STATUS: design document only, not for implementation

Same footing as `ai-analytics-options-intraday-delivery.md`, of which this is a
narrower, deeper pass — that document covers options/intraday/delivery broadly;
this one goes deep specifically on **holding-level and portfolio-composition AI
capabilities** (spec §19–22), since that's what was asked for. Gated the same
way: Gate A (regulatory position) is a working position, not a decision;
building any of this before that resolves risks designing around an assumed
outcome, the thing this project has repeatedly guarded against. Nothing here
should be implemented without an explicit, separate decision to do so.

## A contradiction this pass surfaced — not resolved here, needs your call

Spec §19 (Portfolio AI Analyst) asks the AI to answer *"What is performing?
What is underperforming? Why?"* — inherently a returns question, not just a
holdings-listing question. Spec §15 (Unified Portfolio) lists `TOTAL REALIZED
P&L`, `TOTAL UNREALIZED P&L`, `CAGR`, `XIRR` as fields the portfolio view
should show. `CLAUDE.md`'s own permanent OUT rule says: *"Performance display.
No win rates, no returns, no statistics shown to a user — ever, under this
position, not only in Phase 1."*

These don't fit together. Two readings, with materially different
consequences:

- **Narrow reading**: "no returns/statistics" means no *P&L-vs-cost-basis*
  framing (the platform's own performance claim about the user's position) and
  no *track-record* statistics (win rate, CAGR, XIRR — the things a
  registered-advisor-style performance claim would use). A holding's *market*
  price movement over a period ("down 8% over 30 days") is a public technical
  fact about the instrument, not a claim about the platform's or the user's
  performance, and would stay in scope — same category as the intraday
  technical screening already treated as in-scope. This is the reading
  `gate-a-professional-review-package.md`'s "Holding-level factual commentary"
  example implicitly assumed (`"down 8% over 30 days; sector average -2%"`) —
  written before this contradiction was explicitly noticed.
- **Broad/literal reading**: *any* return or statistical figure is out, full
  stop — no CAGR, no XIRR, no P&L, but also no "down 8% over 30 days," since
  that's still a return. Under this reading, spec §19's actual central
  question ("what's performing, why") has no answerable form at all under
  Option B — the AI Portfolio Doctor feature as spec'd is fundamentally
  incompatible with the working position, not just a feature needing careful
  wording. Concentration/exposure analysis (below) would still be fine, since
  it's not a return figure — but "performance" as such would be off the table
  entirely, permanently, even after Gate A resolves in Option B's favor.

Not picking one of these — flagging it because it changes what's actually
buildable, and picking the convenient reading without saying so would be
exactly the thing `CLAUDE.md`'s "How I want you to work" asks not to do.

## What's holding-related in spec §19–22, and where each one lands

| Spec item | Depends on the contradiction above? | Where it lands |
|---|---|---|
| "What do I own?" | No | **In**, already built (Phase 1 portfolio views) |
| "What is performing / underperforming? Why?" | **Yes — this is the open question itself** | Narrow reading: in, as market-price description. Broad reading: out, permanently. |
| "Which holdings are over-concentrated?" | No | **In** — concentration is a weight computation (holding value ÷ portfolio value, grouped by sector/instrument-type/broker), no return involved at all |
| "Which holdings are correlated?" | Partially — correlation is usually computed *from* a return series, even if never displayed as a return | **Requires judgment** — the input data is returns even if the output (a correlation coefficient) isn't labelled as one; same shape of question as the allocation-gap item already flagged in `gate-a-professional-review-package.md` |
| "Which holdings have deteriorating fundamentals / weakening technical structure / negative news / upcoming earnings / are overvalued" | No, but... | **Blocked on data, not regulation** — Phase 1 has no fundamentals, news, or earnings-calendar feed at all. A different gap than Gate A: this needs its own data-source research (Gate B-shaped, not yet done for these data types — see `gate-b-data-source-matrix.md`'s own "not researched this pass" rows for Corporate actions / News) |
| "Which holdings have excessive downside risk?" | Depends on how "risk" is operationalized | If it means volatility/max-drawdown of the holding's own price series: same shape as the correlation question above. If it means concentration-based risk (too much in one name/sector): same as concentration, no dependency |
| Portfolio Health Score dimensions (§20): FUNDAMENTAL QUALITY, TECHNICAL HEALTH, VALUATION, MOMENTUM, NEWS RISK, EVENT RISK, CONCENTRATION RISK, LIQUIDITY RISK, VOLATILITY, DRAWDOWN, CORRELATION, DIVERSIFICATION | Mixed — see individual dimensions above | **Split**: CONCENTRATION RISK and DIVERSIFICATION are computable now, data-available, no contradiction. VOLATILITY/DRAWDOWN/CORRELATION inherit the judgment call above. FUNDAMENTAL/TECHNICAL/VALUATION/MOMENTUM/NEWS/EVENT need data sources Phase 1 doesn't have at all |
| Portfolio Recommendations (§21) | No | **Out entirely**, not ambiguous — named and framed as recommendations, exactly what Option B forecloses |
| Rebalancing gap display (§22) | No | **Partially in** — already resolved in `gate-a-professional-review-package.md`: show the arithmetic gap between stated target and current allocation, never suggest what to do about it. Marked "requires judgment" there for a different reason (is showing the gap itself advisory-adjacent), independent of the returns question here |

## What's unambiguously buildable-later regardless of the open question

Concentration and exposure analysis needs no return data, no P&L, no
performance framing — just current holding value grouped by a dimension.
This is arithmetic over data Phase 1 already syncs and stores, not a new data
requirement:

- **Sector exposure** — needs a sector field on the instrument, which the
  Security Master doesn't currently carry (spec §18's mapped fields are
  identity/contract fields — ISIN, tokens, lot size — not GICS/sector
  classification). A real gap, not a regulatory one: sourcing sector
  classification data is its own small research item, undone.
- **Asset-type exposure** — already computable today from `instrument_type` on
  every holding row (`portfolio-service.ts` already reads this field; just
  isn't aggregated into a percentage anywhere yet).
- **Broker exposure** — already computable today from `holding.account_id` /
  the `byAccount` breakdown `HoldingAggregate` already carries in
  `portfolio-service.ts`.
- **Concentration risk (single-position weight)** — `holding.currentValue ÷
  totalCurrentValue`, already-stored fields, zero new data needed.

Worth noting: **this deterministic layer isn't gated by Gate A at all.**
Computing "40% of the portfolio is in one holding" involves no AI and no
recommendation — it's the same kind of aggregation Phase 1's own
`portfolio-service.ts` already does for `totalCurrentValue`. It was left out
of Phase 1 by a scope-minimalism choice (`portfolio-service.ts`'s own file
header: *"kept deliberately minimal given the strictest scope option was
chosen"*), not by the regulatory question. If wanted, this specific piece
could be proposed as a Phase 1 UI/API extension on its own terms — a separate
decision from the AI layer, and not what was asked for here, so not built in
this pass either.

## The AI explanation layer, if any of the "in" items above get built

Unchanged from `ai-analytics-options-intraday-delivery.md`'s architecture,
restated for this narrower scope:

```
NEW — ANALYTICS (deterministic, T1, no AI)
  ConcentrationEngine (sector/asset-type/broker weight, single-position weight)
  PortfolioHealthEngine (per-dimension scores, §20 — only the dimensions
    resolved "in" above; dimensions needing unavailable data stay
    UNAVAILABLE, not estimated)

NEW — AI EXPLANATION LAYER (T0 read + T1 analyze only, same rules as before)
  Every number the model references must trace to ConcentrationEngine /
  PortfolioHealthEngine, never invented or estimated by the model itself
  (NumericGroundingValidator, spec §75)
  AI_ANALYSIS labelled visually distinct from COMPUTED fact (spec §87)
  Prohibited-language filter (spec §60) still applies even to descriptive
  text with no performance claim attached
```

## What this document does not do

Doesn't decide the returns-vs-no-returns question above. Doesn't implement
anything. Doesn't resolve the sector-classification data gap or the
fundamentals/news/earnings data gap. Doesn't reopen Phase 1's frozen code —
the "deterministic layer isn't gated by Gate A" observation above is noted as
a fact, not acted on. All still blocked on Gate A for the AI explanation layer
specifically, and on Gate C for serving anyone but the one already-connected
account.
