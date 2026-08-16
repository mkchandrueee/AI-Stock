# Product classification — review package for external counsel/compliance advisor

Purpose: a self-contained briefing to hand to whoever provides the professional
opinion named in `gate-a-resolution-path.md`. Written for someone with no prior
context on this project — no internal jargon, no spec-section references without
explanation, no assumption they've read anything else in this repository. If
they want the full technical detail behind any item below, the underlying design
document is named, but nothing here depends on them opening it.

## 1. What the product is

A software platform where an individual connects their own Indian brokerage
account (currently: Angel One, via its official SmartAPI) and the platform:

- **Displays** that user's own holdings, positions, funds balance, and order/trade
  history — data the platform reads from the broker on the user's behalf, using
  credentials the user supplies directly to the broker's own login page, never to
  this platform.
- **Computes** derived figures from that data and from market data: technical
  indicators (e.g. moving averages, momentum measures) on prices, options-related
  metrics (Greeks, open interest, implied volatility, put-call ratios) on options
  chains, and portfolio-composition figures (sector/asset concentration, a
  diversification score broken into named sub-factors).
- **Explains**, in natural language via an AI model, the figures it has already
  computed — e.g. "Your portfolio is 40% concentrated in the IT sector, versus a
  target of 25%" — strictly limited to describing numbers the platform's own
  deterministic calculation logic produced. The AI model is never permitted to
  generate a number itself; it can only reference and describe numbers handed to
  it by the computation layer.

## 2. What the product does not do, under any circumstance in its current design

- Does not place, modify, or cancel any brokerage order, in any form.
- Does not issue a buy, sell, or hold recommendation for any security.
- Does not propose a specific trade, options structure, or hedge tailored to a
  user's own holdings.
- Does not display any performance track record, win rate, or return figure —
  neither the platform's own, nor any strategy's, to any user.
- Does not operate anything resembling an algorithmic trading strategy — no
  backtesting, no automated signal generation, no automated order execution.

## 3. The question

> Given the feature set described in Sections 1–2 and detailed further in Section
> 4 below, does this product remain a software/analytics tool, or does any
> portion of it constitute investment research, investment advice, portfolio
> management, or algorithmic trading activity that would require registration or
> authorization under current SEBI regulations?

Please treat Section 4's individual items as the actual scope of the question —
a general opinion on "AI trading apps" is not what's being asked for here; this
is a review of this specific, bounded feature list.

## 4. The specific features, one by one

Marked with our own working view and reasoning, offered as context for review —
not as a substitute for it. Items marked "requires judgment" are the ones where
we're least confident and most want a professional view; items marked "our view:
in scope as description" or "excluded entirely" are included so the harder cases
aren't reviewed in isolation from the boundary we've tried to draw around them.

| Feature | Description | Our working view |
|---|---|---|
| Holding-level factual commentary | "This holding is down 8% over 30 days; the sector average is -2% over the same period" | In scope as description — states facts about the position, does not suggest an action. |
| Portfolio health scores | Separate, independently displayed scores for concentration risk, diversification, and similar dimensions — never combined into one overall "score" | In scope as description — comparable to a factual metric like a credit-utilization percentage. |
| Allocation gap display | If a user states their own target allocation, showing the arithmetic difference between that target and their current holdings | **Requires judgment.** We intend to show only the gap, never a suggestion of what to do about it — but want a view on whether showing the gap itself is close enough to advisory territory to require registration. |
| Options chain analytics | Open interest, put-call ratios, implied volatility, Greeks, computed and displayed for the options a user is looking at | In scope as description — a direct computation from public/market data, not a directional call. |
| Options structure education | Generic explanation of how common options structures behave (e.g. "a bull call spread involves buying one call and selling another at a higher strike"), without reference to any specific user's holdings or a specific recommended trade | In scope as description — textbook-style explanation, not personalized. |
| Options structure suggestion tied to a held position | "Given your bullish view on this specific holding, a structure like X could reduce your risk" | **Excluded entirely from the current design** — we consider this advisory regardless of how it's computed, since it's personalized to a specific user's specific position. |
| Portfolio-aware trade ideas | Any AI-generated suggestion of a specific trade based on a user's portfolio | **Excluded entirely from the current design.** |
| Rebalancing/addition recommendations | Explicit suggestions like "consider adding X" or "this is a rebalancing opportunity" | **Excluded entirely from the current design.** |
| Technical screening/filtering | Letting a user filter stocks by technical criteria they define (e.g. "RSI below 30") | In scope as description — the user defines the criteria; the platform applies them mechanically. A directly comparable product (a stock-screening tool with ~900,000 users) already operates in the Indian market on this basis without SEBI registration, to our knowledge, as of this year — happy to share that reference if useful. |
| Scenario/what-if analysis | "If NIFTY fell 3%, your portfolio's estimated value would change by approximately X" | In scope as description, always labelled as an estimate/simulation, never a prediction. |

## 5. Technical/operational context, briefly

- Currently connects to one broker (Angel One) for one account, technically
  verified working. Whether the platform is permitted to connect *other* users'
  accounts is a separate, commercial question being pursued directly with the
  broker — not part of this request.
- No AI-generated figure is ever shown to a user without first being computed by
  deterministic, non-AI code. The AI's only role is describing figures it's
  handed, in natural language — never calculating or inventing them.

## 6. What we are not asking

- Not asking about the SEBI Research Analyst registration *process* — asking
  whether registration is required *at all*, for this specific feature list.
- Not asking about algorithmic-trading or order-execution rules — this product
  places no orders and has no execution path in its current design.

## Deeper technical detail, if wanted

Full architecture: `ai-analytics-options-intraday-delivery.md` (same directory).
Not required reading for this opinion — everything needed is above.
