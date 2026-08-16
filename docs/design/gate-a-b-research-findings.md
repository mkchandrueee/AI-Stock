# Gate A / Gate B research findings

Status: **research to inform, not resolve.** Both gates remain decisions only you
can make — Gate A because it's a business/regulatory-positioning call with real
compliance consequences, Gate B because actually licensing data means a commercial
negotiation this document doesn't have access to. No code changed. This doesn't
move either gate to "resolved."

## Gate A — regulatory position

### The current framework, as it actually stands (not as spec §70 described it when written)

- **Research Analyst (RA)** registration: required to "share investment calls (buy,
  sell, hold)" — recommendations, not just data/filters. Requires NISM Series XV
  certification, a post-graduate qualification, 2 years relevant experience, a
  principal analyst, and documented compliance/record-keeping.
- **Investment Adviser (IA)** registration: required specifically for *personalized*
  advice based on individual circumstances (goals, risk tolerance, portfolio fit) —
  a stricter bar than RA. This is the one spec §23 (portfolio-aware recommendations)
  and the blueprint's "options-directional/options-neutral" signals sit closest to,
  since they're explicitly framed as reacting to *this user's* holdings.
- **Algo Provider**: requires exchange empanelment (NSE/BSE), a technical audit, and
  due diligence review by every partner broker. **Black-box logic (hidden from the
  user) makes RA registration mandatory in addition to empanelment** — there is no
  "black box, no registration" path anymore under the current framework.

### PaRRVA is now live — this is a material update to the spec's own framing

Spec §70 described PaRRVA as a framework moving toward full operation. As of this
research pass: **it's operational.** SEBI recognized Care Ratings as the first
PaRRVA and NSE as the data centre in an April 29, 2026 circular; the platform went
live May 4, 2026; the enrolment deadline for IAs/RAs has already been extended once
(from Aug 3 to Sept 3, 2026); and **only PaRRVA-verified performance numbers may be
shown to clients from May 3, 2028.** Practically: if this project ever displays a
verified track record to users under an RA/IA registration, PaRRVA enrolment is not
optional future-proofing — it's a dated, binding requirement with a real clock
already running.

### Real-world precedent — both paths are actually walked, at different scales

- **IntradayScreener/CashFlow** (spec's own reference point): confirmed still
  unregistered, still explicitly "no buy/sell recommendations," still positioned as
  a technical filter, as of this research pass. The "stay a tool" path is real and
  currently viable at meaningful scale (spec cited ~900k users).
- **Sensibull** — India's largest options-analytics-plus-execution platform — **is a
  registered Research Analyst.** This is the concrete counter-example: the market
  leader in exactly this product category (options analytics, strategy building,
  broker-linked execution) chose registration rather than staying in the
  unregistered-tool lane. This is real evidence the RA path is a viable, walked road
  for a product at real scale, not just a compliance burden that kills a business.

**What this means for your decision, not deciding it for you**: the "AI-powered
Options + Intraday + Delivery analysis" feature set as described leans toward RA
territory at minimum (it's issuing directional ideas, not just filtering), and
toward IA territory if it stays genuinely portfolio-aware (per spec §23's own
design). Both a Sensibull-style registered path and an IntradayScreener-style
unregistered-tool path are real options with real market precedent — this isn't a
binary "impossible vs. free," it's a real choice with a real cost on one side.

## Gate B — historical options data licensing

### The vendors

**TrueData** and **Global Datafeeds (GDFL)** are the two authorized NSE/BSE/MCX
market data vendors that came up consistently, both offering real-time and
historical options data including option Greeks.

### The finding that matters most — confirmed, not inferred

**Standard licenses from both vendors are for individual/institutional *internal
use only*.** Direct finding: *"Redistribution, resale, or public sharing of data is
not allowed without prior written permission, and redistribution requires separate
licensing and exchange documentation."*

This is the exact mechanism spec §93.2 warned about in the abstract — *"market data
obtained through a broker API is generally licensed for that authenticated user's
own use... not licensed for redistribution, for building a platform-wide dataset,
for serving other users"* — except it turns out the same restriction applies to the
*licensed commercial vendors* this project would need to use instead of broker
feeds, not just to broker feeds themselves. **A standard retail/algo-trader
subscription to TrueData or GDFL would not, by itself, license the kind of
research corpus a multi-user backtest engine needs to serve other users' signals
from.** That requires a separate, presumably negotiated, redistribution license —
no public pricing was found for that tier, which is typical for B2B data licensing
of this kind.

### Retail-tier pricing observed (for context — NOT the tier this project would need)

TrueData's public pricing: live-data tiers (`Velocity`) ₹1,440–₹2,796/month per
segment; short-window historical tick-data add-ons (5/10/20 days only) ₹299–999/month.
These are personal/algo-trader tiers, not a research-corpus license, and the gap
between them is informative on its own — the product this project would need isn't
a bigger version of what's publicly priced, it's a different commercial category.

### A signal worth weighing on its own

**Sensibull — a well-funded, SEBI-registered, market-leading options platform —
does not offer historical options backtesting at all**, per their own FAQ. AlgoTest
claims 7.5+ years of historical options data for its own consumer backtesting
product, but whether that reflects a licensable data source or a captive one built
for their own product wasn't established in this pass. Taken together: even the
best-resourced player in this exact space appears not to have solved (or not to
have prioritized solving) full options backtesting — the spec's own framing,
*"historical options data in India is the hard one,"* holds up under this check,
not just as a caution but as something the market leader's own product gap seems to
confirm.

## What this doesn't do

Doesn't recommend a regulatory posture. Doesn't recommend a data vendor or a
budget. Doesn't change Phase 1's scope or `CLAUDE.md`. Both gates stay open,
now with more grounded information behind them than "no wait, don't design around
an assumed outcome" — which remains the operative instruction until you decide.
