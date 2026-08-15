# MASTER PROMPT — MULTI-BROKER AI TRADING & PORTFOLIO INTELLIGENCE PLATFORM

**Version 4.1.** Changelog — 4.1: corrected INDmoney/INDstocks capability (API verified as supporting order lifecycle, portfolio, WebSocket and option chain with Greeks); added the two commercial gating questions to Section 1; added the live-versus-research data class separation to Section 93.2. This specification is closed to feature additions. Subsequent changes are issued as 4.1, 4.2, … with a changelog entry stating what changed and why. The next deliverable is a build blueprint, not more specification.

* **Part A (1–55)** — platform, broker ecosystem, unified portfolio and execution architecture.
* **Part B (56–73)** — signal provenance, strategy validation, performance integrity, alerting, permissioned execution.
* **Part C (74–91)** — the AI action layer: action catalogue, numerical grounding, agent decomposition, conversational safety, proactive behaviour, abstention, behavioural guardrails, evaluation.
* **Part D (92–96)** — options intelligence, data architecture and infrastructure, market positioning and regulatory identity, runtime topology, non-functional requirements and security architecture.

Amendments are applied inline throughout.

**STOP CONDITION — read before anything else.** This document is a specification, not a work order. Produce architecture, contracts and matrices for review and then **stop**. Do not begin application code, do not create placeholder implementations that imitate working functionality, and do not proceed from one phase to the next without explicit written approval. The correct response to this document is a blueprint and a set of questions, not a codebase.

---

## CRITICAL PRODUCT REQUIREMENT

The platform must not be only an AI market-analysis application.

It must become a:

# MULTI-BROKER AI TRADING + PORTFOLIO INTELLIGENCE PLATFORM

Users must be able to connect one or multiple supported Indian brokerage accounts and use the platform as a unified interface for:

* Market analysis
* AI research
* Trade discovery
* Trade recommendations
* Portfolio analysis
* Risk analysis
* Order placement
* Order monitoring
* Position management
* Trade management
* P&L analysis
* Trade journaling
* AI portfolio coaching
* AI trading coaching

The platform must support multiple broker accounts simultaneously.

**Governing principle:** the platform's authority to say anything about a trade is earned by evidence, and its authority to place a trade is granted by the user. Neither is assumed. Sections 56–73 define how both are established.

---

# 1. REQUIRED BROKER ECOSYSTEM

The initial broker integration target list is:

1. Angel One
2. m.Stock
3. Dhan
4. Zerodha
5. PL Capital / PL India
6. Upstox
7. INDmoney
8. Paytm Money

Do not assume that all brokers expose identical APIs.

For every broker, independently verify:

* Official API availability
* Authentication method
* OAuth/login flow
* API key requirements
* Access-token lifecycle
* 2FA requirements
* Static IP requirements
* Webhook/postback support
* Order placement
* Order modification
* Order cancellation
* Order status
* Trade book
* Holdings
* Positions
* Funds
* Margin
* P&L
* Market data
* WebSocket
* Historical data
* Options data
* GTT/conditional orders
* Basket/multi-leg orders
* Auto-slicing
* Broker-specific restrictions
* API rate limits
* API pricing
* Developer-account requirements
* User-consent requirements
* Regulatory requirements
* Commercial/partner requirements

**Two questions decide whether a broker is usable for this product, and neither is answered by reading API documentation:**

1. **Do the broker's API terms permit a third party to connect other users' accounts and place orders on their behalf?** An API that works for your own account may be prohibited for a multi-user platform. This is a terms-and-agreement question for the broker's API/partnership team, not a technical one.
2. **What algo provider status does this arrangement create?** Under Section 70, a platform providing algo trading facility to other users through broker APIs is an algo provider — implying exchange empanelment, routing through a partner broker, broker due diligence, and registration obligations where strategy logic is not disclosed.

A broker is not usable until both are answered in writing. Mark the broker `COMMERCIAL TERMS UNRESOLVED` until then, regardless of how complete its API surface is.

Do not claim support merely because a broker has a website or mobile application.

Only mark a broker:

**SUPPORTED**

after the required API functionality is technically verified.

If API support is unavailable or restricted, mark it:

**LIMITED SUPPORT**

or:

**NOT CURRENTLY SUPPORTED**

rather than creating a fake integration.

---

# 2. BROKER CONNECT CENTER

Create a dedicated:

# BROKER CONNECT CENTER

Users should see:

CONNECTED BROKERS

AVAILABLE BROKERS

CONNECTION STATUS

DATA STATUS

TRADING STATUS

AUTHENTICATION STATUS

LAST SYNC

TOKEN STATUS

API HEALTH

For each broker:

[Connect] [Reconnect] [Disconnect] [Refresh] [View permissions] [View API health]

---

# 3. MULTIPLE BROKER ACCOUNTS

Allow users to connect multiple brokerage accounts.

Example:

```
Zerodha      ₹4.2L portfolio
Dhan         ₹2.8L portfolio
Angel One    ₹1.6L portfolio
Upstox       ₹90K portfolio
```

The platform should provide:

# UNIFIED PORTFOLIO

and:

# BROKER-SPECIFIC PORTFOLIO

views.

---

# 4. UNIFIED ACCOUNT MODEL

Create a canonical internal account model.

Every broker must map into a common schema.

```
Broker Account
→ Account
→ Cash Balance
→ Holdings
→ Positions
→ Orders
→ Trades
→ Funds
→ Margin
→ P&L
```

Never expose broker-specific API structures directly to the rest of the platform.

Create adapters:

```
AngelOneAdapter
MStockAdapter
DhanAdapter
ZerodhaAdapter
PLCapitalAdapter
UpstoxAdapter
INDmoneyAdapter
PaytmMoneyAdapter
```

All adapters must implement a common interface.

---

# 5. BROKER CAPABILITY MATRIX

Build an internal capability registry.

| Capability      | Angel One | m.Stock | Dhan | Zerodha | PL  | Upstox | INDmoney | Paytm |
| --------------- | --------- | ------- | ---- | ------- | --- | ------ | -------- | ----- |
| Login           | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Holdings        | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Positions       | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Orders          | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Modify Order    | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Cancel Order    | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Funds           | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Margin          | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| WebSocket       | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Historical Data | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Options         | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| GTT             | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |
| Multi-leg       | ✓/—       | ✓/—     | ✓/—  | ✓/—     | ✓/— | ✓/—    | ✓/—      | ✓/—   |

Do NOT hard-code these values.

Populate the matrix from verified current broker documentation, with a `last_verified_date` per cell.

---

# 6. UNIFIED ORDER MANAGEMENT SYSTEM

Create:

# AI TRADE EXECUTION CENTER

When the AI identifies a setup, the user should be able to move directly from:

```
AI ANALYSIS
→ TRADE SETUP
→ RISK CALCULATION
→ BROKER SELECTION
→ ORDER PREVIEW
→ USER CONFIRMATION
→ ORDER PLACEMENT
→ ORDER STATUS
→ EXECUTION
→ POSITION MONITORING
```

Note: "AI ANALYSIS" is not an unconstrained starting point. A setup may only enter this flow if it originates from a certified strategy (Section 59) and carries a valid, unexpired Signal object (Section 61).

---

# 7. ORDER PREVIEW

Before placing any live order, display:

BROKER

ACCOUNT

EXCHANGE

SYMBOL

INSTRUMENT

BUY/SELL

PRODUCT

QUANTITY

ORDER TYPE

PRICE

TRIGGER

STOP LOSS

TARGET

ESTIMATED CAPITAL

ESTIMATED MARGIN

ESTIMATED CHARGES

MAXIMUM LOSS

RISK %

EXPECTED RISK/REWARD

SLIPPAGE ASSUMPTION

AI SETUP ID

STRATEGY ID

MARKET REGIME

THESIS

DATA FRESHNESS

USER CONFIRMATION

**Additionally required (amendment from Section 60/62/65):**

PERFORMANCE EVIDENCE BUNDLE — the full bundle, on this screen, not one tap away

SETUP QUALITY CHECKLIST — per-factor pass/fail/caution

STRATEGY VERSION + CERTIFICATION LEVEL

STRATEGY HEALTH STATE

INVALIDATION CONDITION — what makes this trade wrong

SIGNAL EXPIRY COUNTDOWN

PRICE TOLERANCE BAND — beyond which the approval voids

The user must explicitly confirm before live order placement unless the user has explicitly configured an approved automated execution workflow satisfying Sections 66 and 68.

---

# 8. AI → ORDER TRANSLATION

The AI should be able to generate a structured order proposal.

Example:

```
AI SETUP            NIFTY bullish breakout
↓
Instrument          NIFTY weekly option
↓
Strategy            Bull Call Spread
↓
Leg 1               BUY  NIFTY 25,000 CE
↓
Leg 2               SELL NIFTY 25,200 CE
↓
Entry condition     NIFTY sustains above defined breakout level
↓
Risk                ₹X
↓
Maximum loss        ₹X
↓
Target              ₹X
↓
Recommended broker  User selected broker
↓
Order preview
↓
USER CONFIRM
↓
PLACE ORDER
```

The AI must NOT directly turn natural-language reasoning into an irreversible order without validation and explicit authorization.

Every instrument in a proposal must resolve through the Security Master (Section 18). A model-generated symbol string is never sufficient to identify a tradeable instrument. Every proposal must pass deterministic validators (Section 67) before it can be staged.

---

# 9. MULTI-LEG OPTIONS EXECUTION

The system must understand that an options strategy can contain multiple legs.

Represent:

```
Strategy
→ Leg 1
→ Leg 2
→ Leg 3
→ Leg 4
```

Each leg must have:

* broker instrument ID
* exchange
* expiry
* strike
* option type
* quantity
* transaction type
* product
* order type
* price
* trigger
* execution status

Track the entire strategy as one:

# STRATEGY ORDER

while tracking each broker order separately.

---

# 10. ATOMICITY / PARTIAL EXECUTION

This is critical.

Multi-leg orders cannot always be assumed to execute simultaneously.

Handle:

* leg 1 filled
* leg 2 rejected
* leg 3 pending
* partial fill
* broker rejection
* margin failure
* network timeout
* stale quote
* order modification
* user cancellation

The system must immediately calculate:

# CURRENT EXPOSURE

and:

# UNHEDGED RISK

Example: if a bull call spread's BUY leg executes but the SELL leg fails, display:

> **WARNING: PARTIAL EXECUTION — POSITION CURRENTLY UNHEDGED**

Then provide appropriate actions:

* Retry failed leg
* Cancel/reverse filled leg
* Recalculate risk
* Close strategy

Never assume all legs executed.

Unhedged-leg alerts are CRITICAL severity (Section 64) and must not be mutable by the user under any notification setting.

---

# 11. ORDER STATE MACHINE

Every order must have a lifecycle:

```
CREATED
→ VALIDATING
→ APPROVED
→ SUBMITTED
→ ACKNOWLEDGED
→ OPEN
→ PARTIALLY_FILLED
→ COMPLETE
```

or:

```
REJECTED
CANCEL_PENDING
CANCELLED
FAILED
EXPIRED
```

Maintain broker-native state and canonical internal state.

Never lose the original broker status.

---

# 12. ORDER IDEMPOTENCY

Prevent accidental duplicate orders.

Every order request must have:

* internal request ID
* strategy ID
* signal ID
* approval ID
* client order ID / correlation ID where supported
* broker order ID
* timestamp

If the network times out after submission, DO NOT blindly retry.

First reconcile the broker order book. A retry after reconciliation requires a fresh approval (Section 65) — an approval is single-use.

---

# 13. ORDER RECONCILIATION ENGINE

Continuously compare:

**OUR DATABASE** vs **BROKER**

and identify:

* missing orders
* unexpected orders
* mismatched quantities
* mismatched prices
* missing fills
* stale statuses
* external trades
* manually placed broker orders

If mismatch occurs:

# BROKER RECONCILIATION REQUIRED

Do not silently overwrite data. An unreconciled state halts automation (Section 69).

---

# 14. EXTERNAL ORDER DETECTION

Users may place trades directly in Zerodha, Dhan, Angel One, Upstox, etc.

The platform must detect external broker activity where APIs permit.

Then update:

* portfolio
* positions
* risk
* journal
* P&L
* AI analysis

External trades must be flagged as external in the journal and excluded from strategy performance statistics (Section 60) unless the user explicitly attributes them to a strategy.

---

# 15. UNIFIED PORTFOLIO

Aggregate connected brokers into one:

# TOTAL PORTFOLIO

Show:

TOTAL CAPITAL

TOTAL INVESTMENT

TOTAL CURRENT VALUE

TOTAL REALIZED P&L

TOTAL UNREALIZED P&L

TODAY P&L

OVERALL P&L

CAGR where meaningful

XIRR where meaningful

MAX DRAWDOWN

PORTFOLIO BETA

VOLATILITY

SECTOR EXPOSURE

ASSET EXPOSURE

BROKER EXPOSURE

OPTIONS EXPOSURE

CASH

MARGIN

OPEN RISK

---

# 16. BROKER-SPECIFIC PORTFOLIO

Allow: ALL ACCOUNTS / ZERODHA / DHAN / ANGEL ONE / MSTOCK / PL / UPSTOX / INDMONEY / PAYTM MONEY

Each should show independent:

* holdings
* positions
* orders
* trades
* funds
* margin
* P&L

---

# 17. DUPLICATE HOLDING DETECTION

If a user owns RELIANCE — Zerodha: 100, Dhan: 50, Angel One: 25 — the unified view should show:

```
RELIANCE
TOTAL QUANTITY = 175
  Zerodha    100
  Dhan        50
  Angel One   25
```

Do not double-count the position.

---

# 18. SECURITY MASTER

Build a canonical security identity system.

Map:

ISIN · Exchange · Trading symbol · Broker symbol · Broker instrument token · Broker security ID · Instrument type · Expiry · Strike · Option type · Lot size · Contract multiplier · Broker-specific identifiers

Example:

```
RELIANCE
→ NSE
→ ISIN
→ Zerodha instrument token
→ Dhan security ID
→ Angel symbol token
→ Upstox instrument token
→ m.Stock identifier
```

This is critical for multi-broker trading.

Never assume broker symbols are identical.

The Security Master is the single source of instrument truth. No order may be constructed from an instrument identifier that did not resolve through it — including identifiers produced by an AI model.

---

# 19. PORTFOLIO AI ANALYST

Create:

# AI PORTFOLIO DOCTOR

The AI should analyze the user's connected portfolio and answer:

* What do I own?
* What is performing?
* What is underperforming?
* Why?
* Which holdings have deteriorating fundamentals?
* Which holdings have weakening technical structure?
* Which holdings have negative news?
* Which holdings have upcoming earnings?
* Which holdings are overvalued?
* Which holdings are over-concentrated?
* Which holdings are correlated?
* Which holdings have excessive downside risk?
* Which holdings have improving fundamentals?
* Which holdings have improving momentum?
* Where am I taking unnecessary risk?

---

# 20. PORTFOLIO HEALTH SCORE

Create separate dimensions:

FUNDAMENTAL QUALITY · TECHNICAL HEALTH · VALUATION · MOMENTUM · NEWS RISK · EVENT RISK · CONCENTRATION RISK · LIQUIDITY RISK · VOLATILITY · DRAWDOWN · CORRELATION · PORTFOLIO DIVERSIFICATION

Do NOT collapse everything into one meaningless score.

Provide an overall portfolio health assessment only if it can be transparently explained, with each contributing dimension inspectable.

---

# 21. PORTFOLIO RECOMMENDATIONS

The AI may generate:

HOLDING REVIEW · WATCH · REDUCE RISK · INVESTIGATION REQUIRED · THESIS WEAKENING · THESIS INVALIDATED · POTENTIAL ADDITION · POTENTIAL EXIT REVIEW · REBALANCING OPPORTUNITY

However:

Do not automatically sell or buy based solely on AI reasoning.

Separate clearly:

```
DATA → ANALYSIS → RESEARCH VIEW → POTENTIAL ACTION → USER DECISION
```

---

# 22. PORTFOLIO REBALANCING ENGINE

Allow users to define:

* risk level
* target allocation
* sector limits
* single-stock limits
* cash target
* maximum drawdown
* investment horizon

The AI can then analyze CURRENT vs TARGET and identify:

OVERWEIGHT · UNDERWEIGHT · CONCENTRATION · CORRELATION · RISK

Potential rebalance actions must be clearly labelled as analysis/recommendation according to the applicable compliance classification (Section 70).

---

# 23. AI TRADE RECOMMENDATION ENGINE

The platform must connect:

MARKET × WATCHLIST × PORTFOLIO × RISK × BROKER ACCOUNTS

When the AI identifies an opportunity, it must check:

* Does the user already own the stock?
* Does the user have an open position?
* Is the position correlated with another holding?
* Is the user overexposed?
* Is there available margin?
* Would the proposed trade violate user risk limits?
* Would an options strategy hedge an existing position?
* Would the trade increase portfolio concentration?

This creates:

# PORTFOLIO-AWARE TRADE INTELLIGENCE

rather than generic stock signals.

**Compliance gate:** portfolio-aware, personalised recommendations sit closer to advisory activity than generic research output. This engine must be gated behind the advisory classification determined in Section 70.

---

# 24. PORTFOLIO-AWARE OPTIONS STRATEGIES

Example: user owns RELIANCE 500 shares; AI detects downside risk.

Instead of merely saying SELL RELIANCE, the system may analyze whether a hedge such as an appropriate put/spread could reduce portfolio risk.

The system should show:

CURRENT PORTFOLIO RISK · HEDGED SCENARIO · UNHEDGED SCENARIO · HEDGE COST · MAX LOSS · HEDGE BENEFIT · EXPIRY · IV · GREEKS

But do not recommend a hedge unless the quantitative analysis supports it. Hedge cost must be compared against the risk actually removed — a hedge that costs more than the risk it eliminates is not a recommendation.

---

# 25. BROKER ROUTING ENGINE

If multiple connected brokers are available, the platform may compare execution suitability using:

* available funds
* margin
* instrument availability
* order-type support
* API availability
* rate limits
* estimated charges
* liquidity
* broker-specific constraints
* user preference

Do not automatically route to the cheapest broker unless explicitly configured.

Default: **USER CHOOSES BROKER**

Optional future: **AI BROKER ROUTING**, subject to compliance and explicit user authorization under Section 66.

---

# 26. SMART ORDER PREVIEW

For every proposed trade, show:

```
TRADE                      BUY 100 RELIANCE
BROKER                     Zerodha
PRODUCT                    CNC
ORDER                      LIMIT ₹X
STOP                       ₹X
TARGET                     ₹X
RISK                       ₹X
ESTIMATED CHARGES          ₹X
PORTFOLIO IMPACT           +X%
SECTOR EXPOSURE AFTER      X%
MAX PORTFOLIO LOSS         ₹X
AI THESIS                  ...
INVALIDATION               ...
DATA FRESHNESS             ...

STRATEGY                   <name> v<version>  [CERT LEVEL]  [HEALTH STATE]
PERFORMANCE EVIDENCE       <full bundle — Section 60>
SETUP QUALITY              <per-factor checklist — Section 62>
SIGNAL EXPIRES IN          MM:SS
PRICE TOLERANCE            ₹X – ₹X

[ REJECT ]        [ MODIFY ]        [ CONFIRM & PLACE ORDER ]
```

The performance evidence must be visible on the same screen as the confirm button — never one tap away. Reject and Modify carry equal visual weight to Confirm.

---

# 27. ONE-CLICK TRADE FROM AI

The user should be able to move from AI SIGNAL → TRADE SETUP → RISK → ORDER PREVIEW → BROKER → CONFIRM → PLACE ORDER without manually re-entering symbol, quantity, strike, expiry, side, order type, price, stop or target.

But every critical order parameter must remain visible and editable before execution.

"One-click" refers to the elimination of re-entry, never to the elimination of review. There is no path in this product from a signal to a live order that skips the order preview.

---

# 28. AI SHOULD NOT CONTROL THE BROKER CREDENTIALS

Never give the LLM direct access to:

* API secrets
* access tokens
* refresh tokens
* broker passwords
* TOTP secrets

The AI may request an action through a controlled:

# TRADE EXECUTION SERVICE

The execution service performs:

* authentication
* authorization
* risk validation
* broker validation
* order creation
* broker API call
* reconciliation

The LLM should never directly call raw broker order APIs. See Section 67 for the full tool permission model that enforces this architecturally.

---

# 29. EXECUTION RISK ENGINE

Before order placement, validate:

* trading hours
* exchange
* symbol
* instrument
* expiry
* strike
* quantity
* lot size
* freeze quantity
* available funds
* margin
* user risk limit
* daily loss limit
* maximum position size
* maximum portfolio exposure
* duplicate order
* stale price
* price deviation
* circuit limits
* broker restrictions
* product type
* order type

If validation fails:

# ORDER BLOCKED

with a clear, specific reason.

This entire validation set runs twice: once at proposal time, and again at approval time (Section 65). Passing at proposal time grants nothing.

---

# 30. EMERGENCY CONTROLS

Provide:

# CANCEL ALL PENDING ORDERS
# EXIT ALL POSITIONS
# DISABLE AI EXECUTION
# DISABLE AUTOMATED STRATEGIES
# DISCONNECT BROKER
# GLOBAL TRADING KILL SWITCH

These must be independently controlled from the AI.

The kill switch must not depend on the AI layer, the strategy runner, the signal engine, or any single service being alive. It must be reachable from every screen and must never sit behind a confirmation funnel designed to discourage use.

---

# 31. AUTOMATED EXECUTION MODES

Support four explicit modes:

## MODE 1 — ANALYSIS ONLY
AI can analyze. No order placement. No staging.

## MODE 2 — ASSISTED TRADING *(default)*
AI creates setup. User reviews. User confirms. System places order.

## MODE 2.5 — SEMI-AUTOMATED
The system stages the order automatically when the signal triggers, and alerts the user. A human approval is still required, within the signal's TTL. Nothing executes without a human decision — but the user never has to build the order.

This is the mode most users should actually run, and it is the recommended upgrade path from Mode 2.

## MODE 3 — AUTOMATED STRATEGY EXECUTION
Only for explicitly authorized strategies and accounts, and only after every gate in Section 68 is satisfied, a valid Section 66 authorization grant exists, and all compliance, broker, exchange and regulatory controls in Section 70 are met.

The user must explicitly enable this mode, per strategy, with step-up authentication.

**Default: ASSISTED TRADING.** Auto-execution must never be enabled by default and must never be reachable in fewer than three deliberate steps.

---

# 32. STRATEGY-TO-BROKER EXECUTION

Every strategy must define:

* eligible brokers
* supported order types
* supported products
* supported exchanges
* supported instruments
* maximum quantity
* execution constraints

If a strategy requires a feature unavailable at the selected broker, show:

# BROKER DOES NOT SUPPORT THIS EXECUTION METHOD

and offer a compatible alternative only if it is genuinely equivalent in risk profile. Never silently substitute a different order type — a market order is not a substitute for a stop-limit.

---

# 33. PAPER TRADE → LIVE TRADE

Every strategy progresses through:

```
BACKTEST → PAPER TRADE → LIVE-ASSISTED → OPTIONAL AUTOMATED
```

This progression is governed by the certification ladder in Section 59, with mandatory minimum durations, minimum sample sizes, and automatic demotion. It is not a suggestion and it cannot be skipped by user request.

The platform must continuously compare:

BACKTEST PERFORMANCE vs PAPER PERFORMANCE vs LIVE PERFORMANCE

and detect divergence. Divergence detection is not advisory — it triggers a state change under Section 63.

---

# 34. TRADE JOURNAL AUTOMATION

Every order placed through the platform should automatically create a journal record containing:

* broker
* account
* signal ID
* strategy ID + version
* thesis ID
* approval ID
* instrument
* entry
* stop
* target
* quantity
* risk
* reason
* AI evidence
* market regime
* portfolio state
* outcome

If the user trades outside the platform, import the trade where broker APIs permit, flagged as external.

---

# 35. AI POST-TRADE ANALYSIS

After trade completion, the AI should analyze:

* Was the setup valid?
* Was entry good?
* Was position sizing appropriate?
* Did the thesis work?
* Did the market regime change?
* Was the stop appropriate?
* Was the target realistic?
* Was execution poor?
* Was there excessive slippage?
* Did the user violate their own rules?

Do not judge trades merely by profit/loss.

A profitable trade can be a bad trade. A losing trade can be a good trade.

Evaluate:

# DECISION QUALITY

Post-trade analysis also feeds three systems: the strategy health monitor (Section 63), the confidence calibration tracker (Section 62), and the declined-signal dataset (Section 65).

---

# 36. MULTI-BROKER P&L

Calculate **Broker P&L** and **Unified P&L**.

Break down by: realized · unrealized · intraday · delivery · futures · options · strategy · sector · instrument · broker · month · year

Account for available transaction costs and broker-specific charges.

Do not assume identical brokerage/charges across brokers.

Strategy-attributed P&L must reconcile exactly to the strategy performance statistics in Section 60. Two different numbers for the same strategy is a defect, not a rounding difference.

---

# 37. BROKER COMPARISON

Allow the user to compare:

* charges
* execution availability
* margin
* supported products
* API capabilities
* order types
* data capabilities
* connectivity
* order latency where measurable

Never claim one broker is "best" without defining the criteria.

---

# 38. API HEALTH DASHBOARD

For every connected broker:

API STATUS · AUTH STATUS · MARKET DATA STATUS · ORDER API STATUS · PORTFOLIO API STATUS · WEBHOOK STATUS · LAST SUCCESSFUL REQUEST · LAST ERROR · LATENCY · RATE-LIMIT STATUS · TOKEN EXPIRY

The user should immediately know if their broker connection is healthy.

Token expiry warnings must fire well before expiry, not at expiry — a token that dies mid-session with open automated positions is a serious failure mode.

---

# 39. BROKER OUTAGE HANDLING

If a broker API fails:

DO NOT automatically switch brokers for an already-authorized order unless the user has explicitly configured such behavior and the strategy/risk system permits it.

Display:

# BROKER CONNECTION FAILURE

and preserve the order state. Avoid duplicate execution.

Follow the pre-configured disconnect policy in Section 68.

---

# 40. BROKER API VERSIONING

Each adapter must contain:

* broker
* API version
* supported endpoints
* capability map
* authentication version
* last verified date
* documentation reference
* implementation version

Broker API changes must not break the entire platform.

Each adapter must also declare its **infrastructure requirements** — static IP whitelisting, webhook endpoints, TOTP mechanism, token lifetime, rate limits, sandbox availability, IP registration lead time. These determine deployment topology, not just integration code (Section 93.7).

---

# 41. BROKER INTEGRATION TEST SUITE

For each broker, test:

AUTH · REFRESH · PROFILE · FUNDS · HOLDINGS · POSITIONS · ORDER PLACE · ORDER MODIFY · ORDER CANCEL · ORDER STATUS · TRADEBOOK · WEBHOOK · RECONCILIATION · LOGOUT · ERROR HANDLING · RATE LIMIT · TOKEN EXPIRY · MARKET CLOSED · INSUFFICIENT MARGIN · INVALID SYMBOL · INVALID QUANTITY · PARTIAL FILL · NETWORK TIMEOUT · DUPLICATE REQUEST

---

# 42. REGULATORY / COMPLIANCE RULE

Before implementing live execution, verify current Indian regulatory requirements applicable to:

* API trading
* algo trading
* broker APIs
* registered applications
* order execution
* third-party platforms
* user authorization
* authentication
* audit logging
* data usage
* personalized recommendations
* investment advisory/research classification
* automated execution
* display of past performance and return metrics

Do not assume that an API technically allowing order placement means the proposed product workflow is commercially or regulatorily permitted.

The architecture must support changing compliance rules. See Section 70 for the detailed overlay and the Compliance Policy Service.

---

# 43. LIVE EXECUTION AUDIT

For every live order preserve:

* user
* broker
* account
* IP/device/session where legally appropriate
* signal ID
* strategy ID **and version**
* certification level at execution
* thesis
* AI model + model version + prompt version
* data timestamp + data snapshot hash
* order payload + payload hash
* risk validation record (proposal time)
* **re-validation record (approval time)**
* **approval ID + decision record + auth evidence**
* **authorization grant ID (if automated)**
* **performance evidence snapshot as shown to the user**
* **consent ledger reference**
* user confirmation
* broker response
* broker order ID
* execution
* final result

Make this immutable and auditable. See Section 71 for the full lineage requirement.

---

# 44. AI PORTFOLIO COMMAND CENTER

Create a dedicated screen:

# MY MONEY / PORTFOLIO BRAIN

It should answer:

"How am I positioned?" · "What are my biggest risks?" · "Which stocks are hurting my portfolio?" · "Which positions are strongest?" · "What changed today?" · "What earnings are coming?" · "Which holdings have negative news?" · "Where am I overexposed?" · "What is my options exposure?" · "What is my portfolio beta?" · "What happens if NIFTY falls 5%?" · "What happens if BANKNIFTY falls 5%?" · "Which positions hedge each other?" · "Which holdings are highly correlated?" · "Where should I investigate first?"

---

# 45. SCENARIO ANALYSIS

Allow:

"What happens to my portfolio if NIFTY falls 3%?" · "What if IT falls 5%?" · "What if RELIANCE falls 10%?" · "What if India VIX spikes?" · "What if crude oil rises?" · "What if INR weakens?"

Where sufficient quantitative data exists, estimate scenario impacts.

Clearly label scenario results as:

# SIMULATION / ESTIMATE

not prediction. State the assumptions (beta stability, correlation stability, volatility surface behaviour) that the estimate depends on.

---

# 46. UNIFIED AI EXPERIENCE

The AI should understand the user's connected accounts.

Example — user asks: *"Should I buy TCS?"*

AI should not merely analyze TCS. It should consider:

* TCS fundamentals
* TCS technicals
* sector
* news
* valuation
* market regime
* user's existing TCS exposure
* user's IT exposure
* portfolio concentration
* risk limits
* available capital
* existing correlated holdings

Then produce:

MARKET VIEW · STOCK VIEW · PORTFOLIO IMPACT · RISK · POTENTIAL SETUP · INVALIDATION · ACTION OPTIONS

A conversational "yes, do it" from the user may open an approval sheet. It may never itself constitute the approval (Section 65).

---

# 47. USER CONTROL

The user must be able to choose:

Default broker · Default trading account · Default product · Default risk % · Default order type · Default confirmation behavior · Preferred broker per strategy · Paper/live mode · AI recommendation mode · AI execution mode · Portfolio sync frequency · Notification preferences

Constraint: no user setting may disable CRITICAL alerts (margin, unhedged leg, risk breach, reconciliation failure), reduce a risk limit below the platform floor, or remove the order preview from the execution path.

---

# 48. MULTI-ACCOUNT DASHBOARD

Top-level dashboard should show:

```
TOTAL PORTFOLIO      ₹X
TODAY P&L            ₹X
OPEN POSITIONS       X
OPEN ORDERS          X
TOTAL RISK           ₹X
AVAILABLE CAPITAL    ₹X
BROKERS CONNECTED    X/8
ACTIVE SIGNALS       X        (expiring soon: X)
PENDING APPROVALS    X        (expiring soon: X)
AUTOMATION STATUS    ON / OFF / HALTED
```

Then: BROKER CARDS for Angel One, m.Stock, Dhan, Zerodha, PL, Upstox, INDmoney, Paytm Money.

---

# 49. PRODUCT DIFFERENTIATOR

See Section 73 for the full revised core loop. The shorthand is:

# SEE → UNDERSTAND → DECIDE → EXECUTE → MONITOR → LEARN

preceded by VALIDATE and closed by PROMOTE/DEMOTE.

---

# 50. FINAL ARCHITECTURAL PRINCIPLE

The platform must be:

# BROKER-AGNOSTIC
# DATA-PROVIDER-AGNOSTIC
# AI-MODEL-AGNOSTIC
# STRATEGY-AGNOSTIC
# COMPLIANCE-POLICY-DRIVEN
# AUDITABLE
# RISK-FIRST
# EVIDENCE-GATED

Do not allow any single broker to become deeply embedded into the core product.

The core platform should remain independent. Broker adapters are replaceable integrations.

---

# 51. PRODUCT DEFINITION — FIVE SYSTEMS

## SYSTEM 1 — MARKET BRAIN
NSE/BSE market intelligence.

## SYSTEM 2 — TRADE BRAIN
Options + intraday + swing + delivery opportunities, sourced only from certified strategies.

## SYSTEM 3 — PORTFOLIO BRAIN
Analyze the user's actual investments and risk.

## SYSTEM 4 — EXECUTION BRAIN
Connect brokers and execute authorized orders.

## SYSTEM 5 — LEARNING BRAIN
Backtest → Paper → Live → Journal → Outcome → Strategy certification update.

Together:

AI MARKET INTELLIGENCE × AI TRADING INTELLIGENCE × AI PORTFOLIO INTELLIGENCE × MULTI-BROKER EXECUTION × AI TRADING COACH

---

# 52. BROKER INTEGRATION INSTRUCTION

When implementing broker integrations, do not invent APIs.

For every broker:

1. Locate official current developer documentation.
2. Verify capabilities.
3. Verify authentication.
4. Verify order capabilities.
5. Verify portfolio capabilities.
6. Verify market-data capabilities.
7. Verify rate limits.
8. Verify access requirements.
9. Verify current regulatory restrictions.
10. Implement only verified functionality.
11. Build an adapter.
12. Add integration tests.
13. Add health monitoring.
14. Add reconciliation.
15. Document limitations.

If a broker cannot currently support a requested function:

**DO NOT FAKE IT.**

Implement the adapter interface and mark the capability:

UNAVAILABLE · REQUIRES PROVIDER ACCESS · REQUIRES USER ACTION · REQUIRES REGULATORY / COMMERCIAL APPROVAL

---

# 53. DEVELOPMENT PRIORITY

Do NOT attempt all eight broker integrations on day one.

```
CORE TRADING PLATFORM
↓
SECURITY MASTER
↓
BROKER ABSTRACTION
↓
ONE COMPLETE BROKER INTEGRATION
↓
ORDER RECONCILIATION
↓
PORTFOLIO SYNC
↓
RISK ENGINE
↓
STRATEGY REGISTRY + BACKTEST ENGINE + VALIDATION PROTOCOL
↓
PAPER TRADING
↓
SIGNAL ENGINE + ALERTING
↓
APPROVAL / PERMISSION LAYER
↓
SECOND BROKER
↓
MULTI-BROKER NORMALIZATION
↓
REMAINING BROKERS
```

This ensures the broker architecture is proven before expanding integrations, and that no signal is ever shown before the machinery that justifies it exists.

---

# 54. BROKER SUPPORT ACCEPTANCE CRITERIA

A broker is not "supported" until:

✓ User can authenticate
✓ Account connection is secure
✓ Holdings synchronize
✓ Positions synchronize
✓ Funds synchronize
✓ Orders synchronize
✓ Trades synchronize
✓ Order placement works where permitted
✓ Order modification works where permitted
✓ Order cancellation works where permitted
✓ Status updates work
✓ Reconciliation works
✓ Errors are handled
✓ Rate limits are respected
✓ Duplicate orders are prevented
✓ API outages are handled
✓ Audit trail exists
✓ User can disconnect safely
✓ Tests pass

Only then display:

# SUPPORTED

---

# 55. TARGET USER EXPERIENCE

The user should eventually be able to open one application and say:

> "Analyze the market." → AI responds.
> "Find me the best current setups." → AI responds, from certified strategies only, each with evidence and expiry.
> "Check my portfolio risk." → AI responds.
> "I want to take this NIFTY options trade." → AI prepares the complete setup.
> "Use Dhan." → System prepares the Dhan order.
> "Show me the risk." → AI displays max loss, margin, portfolio impact, Greeks, scenario risk, strategy evidence.
> "Confirm." → System opens the approval sheet with a live countdown and re-validation.

Then:

```
APPROVAL GRANTED → RE-VALIDATION → ORDER SUBMITTED → ORDER FILLED
→ POSITION CREATED → STOP / TARGET MONITORING → THESIS MONITORING
→ POSITION CLOSED → AI POST-TRADE REVIEW → TRADE JOURNAL
→ STRATEGY PERFORMANCE DATABASE → STRATEGY HEALTH UPDATE
→ CERTIFICATION PROMOTE / DEMOTE
```

This complete lifecycle is the target product.

---
---

# PART B — SIGNAL PROVENANCE, PERFORMANCE INTEGRITY & PERMISSIONED AI ACTION

**Sections 1–55 describe how an order is placed safely. Sections 56–73 describe where a signal legitimately comes from, what evidence entitles it to be shown, how the user grants permission, and what a win rate is allowed to mean. Without this part, "AI finds a setup" is an unfalsifiable claim and "win rate %" is a marketing number.**

---

# 56. STRATEGY AS A FIRST-CLASS VERSIONED OBJECT

No signal may exist without a parent strategy. No strategy may exist without a version.

Every strategy must be a stored, immutable, versioned artifact:

```
Strategy
├── strategy_id
├── version                    (semver; any logic or parameter change = new version)
├── name
├── category                   (intraday / swing / positional / options-directional /
│                               options-neutral / event / hedge)
├── universe                   (explicit instrument list or screening rule)
├── timeframe
├── entry_rules                (deterministic, machine-evaluable)
├── exit_rules                 (target, stop, time-stop, trail, thesis-invalidation)
├── filters                    (liquidity, volatility, spread, event blackout)
├── regime_filter              (which market regimes this strategy is valid in)
├── position_sizing_model
├── max_concurrent_positions
├── capacity_limit             (capital beyond which edge degrades)
├── expected_trade_frequency
├── required_broker_capabilities
├── required_data_inputs
├── author                     (human / AI-assisted / AI-generated)
├── logic_disclosure           (white_box / black_box — see Section 70)
├── provider_type              (self_developed / provider_supplied — see Section 70)
├── lifecycle_state            (see Section 59)
├── certification_record
├── created_at / certified_at / certification_expires_at
└── parent_version             (lineage)
```

**Hard rules:**

* Entry and exit rules must be deterministic and machine-evaluable. If a rule cannot be expressed such that two independent runs over the same data produce identical signals, it is not a strategy — it is an opinion, and it must be labelled as such.
* Editing a strategy **never** edits its performance history. A parameter change creates a new version with **zero** trade history. Inherited statistics are prohibited.
* An AI model may *propose* a strategy. It may not *certify* one.

---

# 57. BACKTEST ENGINE — INTEGRITY REQUIREMENTS

A backtest that is not defensible is worse than no backtest, because it manufactures false confidence and that confidence gets converted into real orders.

The backtest engine must enforce:

### DATA INTEGRITY

* Point-in-time data only. Reconstruct what was actually knowable at each timestamp.
* Survivorship-bias-free universe. Delisted, merged, suspended and renamed instruments must be present.
* Corporate action adjustment: splits, bonuses, dividends, rights, demergers, symbol changes, ISIN changes.
* Index reconstitution history where the strategy uses index membership.
* Data gaps, halts, circuit-limit days and settlement holidays handled explicitly, never interpolated.

### LOOK-AHEAD PREVENTION

* No indicator that repaints. Signals computed on a bar may only be executed at or after the next available executable price.
* Fundamental data lagged to actual publication/filing timestamp, not period-end date.
* News and event data lagged to publication time, not event time.
* Any restated financial data must use the original, unrestated figure.

### EXECUTION REALISM

* Fills at realistic prices. Never at the mid, never at the exact high/low, never unlimited size at the touch.
* Slippage model per instrument liquidity tier, explicitly stated, not a global constant.
* Volume participation cap — a backtest may not trade more than a defined share of historical volume.
* Full Indian cost stack: brokerage, STT/CTT, exchange transaction charges, SEBI turnover fee, stamp duty, GST, DP charges where applicable, plus a configurable spread cost.
* Margin and leverage modelled against the applicable margin regime; a strategy that would have been margin-blocked did not take that trade.

### OPTIONS-SPECIFIC REALISM

This is where backtests most often lie.

* Fill against actual bid/ask where available; never mid, never last-traded on an illiquid strike.
* Enforce lot size, freeze quantity and strike availability as they existed on that date.
* Model expiry-day liquidity collapse and settlement mechanics.
* Model IV, not just price, where the strategy depends on volatility.
* Reject any backtested option leg with insufficient historical liquidity — do not silently fill it.
* Model assignment/exercise, STT on exercised options, and physical settlement rules where applicable.

### DETERMINISM & REPRODUCIBILITY

Every backtest run must persist:

```
backtest_run_id, strategy_version, data_snapshot_hash, engine_version,
cost_model_version, slippage_model, random_seed, universe_hash,
date_range, parameter_set, executed_at
```

A backtest that cannot be re-run to bit-identical output is not evidence.

---

# 58. VALIDATION PROTOCOL — WHAT "PROVEN" ACTUALLY REQUIRES

A backtest result alone must never promote a strategy. Promotion requires the full protocol:

1. **In-sample / out-of-sample split.** Development on IS only. OOS is touched once. Repeated OOS peeking converts it into IS — the platform must count and record OOS evaluations per strategy version.
2. **Walk-forward analysis.** Rolling re-fit and forward test across multiple windows. Report each window separately, never only the aggregate.
3. **Purged, embargoed cross-validation** for overlapping-label strategies, to prevent leakage across adjacent samples.
4. **Multiple-testing correction.** Record how many variants were tested. Report a deflated performance statistic that accounts for selection. A strategy found after 400 parameter trials is not the same evidence as one found on the first attempt.
5. **Parameter sensitivity.** The chosen parameters must sit on a plateau, not a spike. Show the performance surface. A cliff-edge optimum is an overfit.
6. **Monte Carlo / bootstrap.** Resample trade sequence and returns to produce distributions — not point estimates — for drawdown, terminal equity and losing streaks.
7. **Regime segmentation.** Report performance separately across bull, bear, range, high-VIX, low-VIX, trending, choppy and event-heavy periods. A strategy that only works in one regime must declare that as a hard filter, not a footnote.
8. **Minimum evidence thresholds** (configurable, enforced, displayed):
   * minimum number of closed trades
   * minimum distinct instruments
   * minimum distinct months / market cycles
   * minimum out-of-sample proportion
9. **Capacity and liquidity test.** State the capital level beyond which the edge measurably degrades.
10. **Cost sensitivity.** Re-run at 1.5× and 2× assumed slippage/cost. If the edge disappears, the strategy is a cost artefact — fail it.

If any check cannot be performed for lack of data, the strategy is marked `INSUFFICIENT_EVIDENCE`. It is never marked "proven with limitations."

---

# 59. STRATEGY CERTIFICATION LADDER

Every strategy carries exactly one lifecycle state. State controls what the platform is permitted to do with it.

| Level | State | Signals visible? | Alerts? | Order staging? | Auto-execution? |
|---|---|---|---|---|---|
| L0 | `DRAFT` | No | No | No | No |
| L1 | `BACKTESTED` | Internal only, watermarked | No | No | No |
| L2 | `VALIDATED` (OOS + walk-forward passed) | Yes, labelled *unproven live* | Optional | No | No |
| L3 | `PAPER_VALIDATED` (min. live-data paper period) | Yes | Yes | Yes | No |
| L4 | `LIVE_ASSISTED` (min. confirmed live trades) | Yes | Yes | Yes | No |
| L5 | `AUTOMATION_ELIGIBLE` | Yes | Yes | Yes | Only with Section 66 grant + Section 68 gates |

**Rules:**

* Promotion is one level at a time. No skipping.
* Promotion requires a persisted certification record: who/what promoted it, against which evidence, on which date.
* Certification **expires**. Re-validation is mandatory on a defined cadence and on any material market-structure change (lot size revision, expiry-day change, margin regime change, tick size change, new segment rules).
* Demotion is automatic and immediate on the triggers in Section 63. Demotion never requires human approval; promotion always does.
* A strategy version change resets to L0. There are no exceptions and the UI must not offer one.

---

# 60. PERFORMANCE METRIC STANDARD — THE WIN-RATE RULE

**Win rate is never displayed alone. Anywhere. Under any circumstance.**

A win rate without sample size, distribution and cost assumptions is not information. A 70% win rate with a 1:0.3 payoff loses money. An 80% win rate over 15 trades has a 95% confidence interval running from roughly 52% to 96% — it tells the user almost nothing.

Wherever a win rate appears — signal card, alert, order preview, strategy page, notification, marketing surface — it must appear inside the **Performance Evidence Bundle**:

```
STRATEGY PERFORMANCE EVIDENCE

  Basis            BACKTEST | PAPER | LIVE       ← mandatory, most prominent field
  Sample           N closed trades
  Period           from – to  (months / market cycles covered)
  Out-of-sample    X% of sample

  Win rate         XX%  (95% CI: XX%–XX%, Wilson)
  Expectancy       +0.XX R per trade
  Profit factor    X.XX
  Avg win / avg loss   X.X R  /  -X.X R
  Payoff ratio     X.XX
  Max drawdown     -XX%   (duration: XX days)
  Max consecutive losses   XX
  Sharpe / Sortino / Calmar
  Return per unit of risk
  Time in market   XX%

  Cost assumption      brokerage + taxes + XX bps slippage
  Live vs backtest     ALIGNED | DIVERGING | INSUFFICIENT DATA
  Regime coverage      bull / bear / range / high-vol / low-vol
  Last recalculated    <timestamp>
```

### MANDATORY DISPLAY RULES

* **Basis label first.** A backtested number may never render in the same visual style as a live number. Backtest = distinct colour, distinct icon, permanent "hypothetical" watermark.
* **Confidence interval is mandatory**, not optional, not a tooltip. Below the minimum sample threshold, suppress the point estimate entirely and show `INSUFFICIENT SAMPLE (n=X)`.
* **Never show a win rate for the current signal.** A single signal has no win rate. Only the strategy has one. The UI must never phrase it as "this trade has an 82% chance of success."
* Never compound a win rate into projected returns.
* Never display a best-window or since-inception cherry-pick. Fixed reporting windows only: last 30d / 90d / 1y / all, all shown together.
* Live statistics must include **all** closed trades. No exclusion of "errors", "test trades", or "abnormal market conditions".
* Where live and backtest diverge beyond tolerance, display the divergence badge on **every** surface that shows the number — not just the strategy detail page.

### PROHIBITED LANGUAGE — block at the content layer, not by convention

`guaranteed` · `assured returns` · `risk-free` · `accuracy XX%` · `sure shot` · `XX% success rate` (unqualified) · `cannot lose` · `proven profitable` · `AI-verified returns` · any projected rupee return derived from a win rate

Implement this as a deterministic output filter over both UI copy and LLM-generated text. Do not rely on the model to remember.

---

# 61. SIGNAL OBJECT — CANONICAL SCHEMA

A signal is an immutable, expiring, attributable proposal. It is not a message.

```
Signal
├── signal_id
├── strategy_id + strategy_version
├── certification_level_at_generation
├── generated_at / valid_from / expires_at        ← mandatory TTL
├── instrument (resolved via Security Master — Section 18)
├── direction / structure (single leg or multi-leg strategy template)
├── entry_type      (market / limit zone / conditional trigger)
├── entry_zone      (price range, not a single number)
├── stop_loss       + stop basis (structural / ATR / % / time)
├── targets[]       (scaled exits permitted)
├── invalidation_condition                        ← what makes this WRONG, stated up front
├── expected_R_multiple
├── max_loss_per_unit
├── suggested_risk_percent
├── regime_at_generation
├── evidence[]      (each item: type, source, timestamp, value)
├── data_snapshot_hash
├── freshness       (age of oldest input that materially affects the signal)
├── conflicts[]     (existing holdings/positions this interacts with)
├── strategy_performance_ref  → Performance Evidence Bundle (Section 60)
├── status          (ACTIVE / TRIGGERED / EXPIRED / INVALIDATED / SUPERSEDED / TAKEN)
└── supersedes / superseded_by
```

**Hard rules:**

* Signals are immutable. A change produces a new signal that supersedes the old one. Never mutate in place — the user may have already acted on the original.
* Every signal has a TTL. An expired signal cannot be executed, cannot be alerted on, and must visibly grey out. Stale signals are a primary cause of real losses.
* Every signal states its invalidation condition **before** entry, not after the trade goes wrong.
* A signal must never be generated from an L0/L1 strategy.
* Every signal must resolve its instrument through the Security Master.

---

# 62. SIGNAL CONFIDENCE — TWO SEPARATE NUMBERS, NEVER ONE

Do not produce a single opaque "confidence: 87%". It is the most dangerous element in the entire product because users read it as probability of profit.

Decompose into two independently displayed components:

**A. STRATEGY PRIOR** — historical, statistical, strategy-level. Comes from Section 60. Backward-looking.

**B. SETUP QUALITY** — instance-specific, current conditions:

* regime match (does today match the regime the strategy was validated in?)
* liquidity and spread at this instrument, right now
* event proximity (earnings, results, policy, expiry, corporate action)
* volatility state vs. validated range
* data freshness and completeness
* correlation with the user's existing exposure
* how far current price sits inside vs. outside the entry zone

Display as a **checklist with pass/fail/caution per factor** — not a blended score. The user must be able to see *which* factor is weak.

### CALIBRATION IS MANDATORY

If any probability-like number is displayed, the platform must track its calibration:

* reliability curve — of all signals shown at 70%, what fraction actually reached target before stop?
* Brier score, tracked per strategy and overall
* published, user-visible calibration page
* if calibration error exceeds tolerance, **stop displaying the probability** until recalibrated

An uncalibrated probability must be labelled a *score*, never a *probability*, and must not carry a % sign.

---

# 63. STRATEGY HEALTH MONITORING & AUTOMATIC DECAY RESPONSE

Edges decay. The platform must assume decay is the default and detect it, not wait for the user to notice.

Continuously compute, per strategy version:

* rolling live win rate, expectancy and payoff vs. backtest baseline
* statistical divergence test (sequential / CUSUM style drift detection) with defined tolerance bands
* rolling drawdown vs. backtested max drawdown
* current losing streak vs. backtested max consecutive losses
* realised slippage vs. modelled slippage
* signal frequency vs. expected frequency (a strategy suddenly firing 5× as often has broken)
* fill quality and rejection rate
* regime mismatch duration

### HEALTH STATES AND AUTOMATIC CONSEQUENCES

| State | Trigger | Automatic consequence |
|---|---|---|
| `HEALTHY` | within tolerance | normal operation |
| `WATCH` | mild divergence | banner on every signal from this strategy |
| `DEGRADED` | sustained divergence, or drawdown > backtest max | auto-execution suspended; signals shown with prominent warning |
| `SUSPENDED` | drawdown breach, losing streak breach, or execution anomaly | no new signals, no alerts; open positions managed to exit only |
| `RETIRED` | manual, or failed re-validation | archived; history retained permanently |

**Rules:**

* Demotion is automatic and instant. Promotion back requires the full Section 58 protocol.
* Circuit breakers are per-strategy **and** portfolio-wide.
* Never silently re-fit parameters to restore performance. A re-fit is a new version at L0 (Section 56).
* The user must be notified of any demotion affecting a strategy they have capital in.

---

# 64. ALERT & NOTIFICATION ENGINE

Alerts are the primary surface where AI meets user attention. An alert engine without discipline becomes noise, and noise causes users to ignore the one alert that mattered.

### ALERT TAXONOMY

| Class | Examples | Default severity |
|---|---|---|
| SIGNAL | new setup, setup approaching entry zone | INFO |
| TRIGGER | entry condition met, signal now actionable | ACTION |
| POSITION | stop hit, target hit, trailing stop moved, partial exit | ACTION |
| THESIS | invalidation condition met, fundamental change, adverse news | ACTION |
| RISK | risk limit breach, concentration breach, daily loss limit approaching | CRITICAL |
| MARGIN | margin shortfall, peak margin, MTM breach, pledge/haircut change | CRITICAL |
| ORDER | rejected, partially filled, **unhedged leg** (Section 10), cancelled | CRITICAL |
| RECONCILIATION | broker mismatch, external trade detected | CRITICAL |
| CONNECTIVITY | token expiry, API down, WebSocket dropped, data stale | CRITICAL |
| EVENT | earnings, expiry, corporate action, index rebalance on a held name | INFO |
| STRATEGY HEALTH | demotion, suspension, divergence | ACTION |
| PORTFOLIO | drawdown threshold, rebalancing drift | INFO |

### ENGINE REQUIREMENTS

* **Every alert carries:** what happened, why it matters, what the user's realistic options are, what happens if they do nothing, and an expiry.
* **Deduplication and coalescing.** Ten signals from one strategy in one minute is one digest alert, not ten pushes.
* **Throttling and quiet hours** — except CRITICAL, which always delivers. Users must never be able to mute margin or unhedged-leg alerts.
* **Market-hours awareness.** No actionable trade alert outside tradeable hours; queue it and mark it clearly.
* **Delivery guarantee tiering.** CRITICAL alerts require acknowledgement and retry across channels; log delivered/read state.
* **Channel design is first-class, not an afterthought.** In this market WhatsApp is a primary alert channel alongside push, in-app and email — each has its own delivery guarantees, template constraints, rate limits and failure modes. Model them explicitly (Section 94.1). An actionable alert delivered on a channel that cannot carry the approval control is an incomplete alert.
* **Every alert is audit-logged** with its generating signal/event, evidence snapshot and delivery outcome.
* **No alert may promise an outcome.** Alert copy passes through the Section 60 prohibited-language filter.

---

# 65. PERMISSION-TO-TRADE — THE APPROVAL REQUEST OBJECT

This is the "alert me and let me approve the order" flow. It is the single most safety-critical interaction in the product, and it is where most platforms are dangerously sloppy.

### THE OBJECT

```
ApprovalRequest
├── approval_id
├── signal_id + strategy_id + strategy_version
├── proposed_order_payload  (fully resolved: broker, instrument tokens, all legs)
├── payload_hash                              ← what the user is actually approving
├── risk_summary            (max loss ₹, risk %, margin, charges, portfolio impact)
├── performance_evidence_ref                  ← Section 60 bundle, mandatory
├── setup_quality_checklist                   ← Section 62
├── invalidation_condition
├── price_at_request
├── price_tolerance_band                      ← beyond this, approval is void
├── requested_at / expires_at                 ← visible countdown
├── auth_level_required     (tap / PIN / biometric / 2FA)
├── status  (PENDING / APPROVED / REJECTED / EXPIRED / VOIDED_STALE / EXECUTED / FAILED)
└── decision_record  (who, when, from which device/session, which channel)
```

### FLOW

```
SIGNAL → RISK ENGINE → APPROVAL REQUEST → USER NOTIFIED
                                              ↓
                                         USER REVIEWS
                                              ↓
                                        USER APPROVES
                                              ↓
                              ***  RE-VALIDATION AT APPROVAL TIME  ***
                                              ↓
                              ┌───────────────┴───────────────┐
                         ALL CHECKS PASS              ANY CHECK FAILS
                                ↓                            ↓
                        EXECUTION SERVICE            APPROVAL VOIDED
                                ↓                    → show what changed
                          ORDER PLACED               → require fresh approval
```

### NON-NEGOTIABLE RULES

* **Approval is never a licence to execute later.** On approval, re-run the entire Section 29 execution risk validation *plus*: is the signal still ACTIVE? has price moved outside the tolerance band? is the quote fresh? is margin still available? is the market still open? is the strategy still HEALTHY? has an existing position changed the exposure calculation?
* **Any failure voids the approval.** Never "approximately execute" an approval. Show the user exactly what changed and ask again.
* Approval binds to `payload_hash`. If any parameter differs at execution time, it is a different order and requires a new approval.
* **Single-use.** One approval, one order attempt. Never reuse an approval for a retry — retries go through Section 12 idempotency and reconciliation first.
* **Expiring.** Visible countdown. On expiry the button becomes inert, not "still works but stale".
* **Step-up authentication** above configurable notional/risk thresholds, for all options strategies, and for any first trade on a newly connected broker.
* **Rejection is a first-class outcome** and is recorded as training data for Section 35 post-trade analysis. Track which signals users decline, and what those declined signals subsequently did. This is one of the most valuable datasets the platform can build.
* **Never pre-check an approval checkbox. Never default to approve. Never make approve the only visible button.** Reject and Modify must be equally prominent.
* Approvals cannot be granted from within an LLM conversation turn as a side effect of natural language. "Yes do it" in chat may *open* an approval sheet; it may never *be* the approval.

---

# 66. STANDING AUTHORIZATION FRAMEWORK (CONSENT LEDGER)

For anything beyond per-trade approval, the user grants a bounded, revocable, expiring authorization.

```
AuthorizationGrant
├── grant_id
├── mode                    (ASSISTED / SEMI_AUTO / AUTOMATED)
├── scope
│   ├── strategies[]        (explicit strategy_id + version — never "all strategies")
│   ├── brokers[]  accounts[]
│   ├── instruments / segments  (explicit; F&O separately consented from equity)
│   ├── product types
│   └── order types
├── limits
│   ├── max_capital_deployed
│   ├── max_risk_per_trade         (₹ and %)
│   ├── max_daily_loss             → auto-halt on breach
│   ├── max_weekly_loss            → auto-halt on breach
│   ├── max_consecutive_losses     → auto-halt on breach
│   ├── max_open_positions
│   ├── max_orders_per_day
│   ├── max_notional_per_order
│   └── max_portfolio_drawdown     → auto-halt on breach
├── time_window             (trading hours subset; e.g. no execution in first/last N minutes)
├── granted_at / expires_at        ← mandatory expiry, maximum duration enforced
├── auth_evidence           (step-up auth record)
├── revoked_at / revocation_reason
└── version_binding         (grant is void if strategy version changes)
```

**Rules:**

* No grant is open-ended. Every grant expires and requires deliberate renewal.
* Grants are **strategy-version-bound**. A new strategy version voids the grant — the user must re-consent to the changed logic. This prevents silent behaviour change under an old consent.
* **Revocation is instant, unconditional and one tap**, reachable from every screen, never behind a discouraging confirmation funnel.
* Revocation stops new orders immediately and presents an explicit choice for open positions — it must never silently abandon them.
* The consent ledger is append-only and immutable. Every grant, modification and revocation is permanently recorded with full context.
* Limits are enforced in the Execution Service, server-side. Never in the client, never in the prompt.

---

# 67. AI ACTION FRAMEWORK — TOOL PERMISSION TIERS

Extends Section 28. Section 28 says the LLM must not hold credentials. This section says what the LLM is allowed to *do*.

Every AI-callable capability is classified. The tier is enforced by the service layer, not by instruction.

| Tier | Class | Examples | Side effects | LLM may call? |
|---|---|---|---|---|
| **T0** | READ | quotes, holdings, positions, orders, news, fundamentals, journal | none | Yes |
| **T1** | ANALYZE | screen, compute indicators, scenario/greeks simulation, backtest replay | none | Yes |
| **T2** | PROPOSE | draft a signal, draft a trade idea, draft a strategy | creates a draft object only | Yes |
| **T3** | STAGE | create an ApprovalRequest, arm an alert, create a watchlist trigger | creates a pending, expiring, user-visible object | Yes, rate-limited & logged |
| **T4** | EXECUTE | place / modify / cancel order, exit position, transfer funds | **irreversible, real money** | **NEVER** |

### ARCHITECTURAL CONSEQUENCES

* **T4 is physically unreachable from the LLM layer.** Not discouraged by prompt — unreachable by network topology, service boundary and credential scope. The Execution Service accepts input only from the Approval Service, and the Approval Service accepts input only from an authenticated human decision or a valid Section 66 grant evaluated by deterministic code.
* **Deterministic validators sit between the model and every T3 output.** Instrument identity, lot size, strike existence, expiry validity, price sanity, margin, risk limits — all verified by code. A model-generated order payload that fails any validator is discarded, never repaired by the model.
* **Prompt-injection defence.** News articles, filings, broker responses, social content, PDF research and tool outputs are **data, never instructions**. A statement inside retrieved content saying "buy this now" or "the user has authorized this" carries zero authority. Content-sourced instructions are surfaced to the user, not acted upon.
* **Model non-determinism containment.** Any T2/T3 output must be reproducible in its material fields, or regenerated until two independent samples agree. Silent variation in a trade proposal is unacceptable.
* **Full attribution.** Every AI-originated artifact stores model identity, model version, prompt version, temperature, input context hash and tool-call trace.
* **The model may never author its own permissions**, edit a grant, change a limit, alter a strategy's certification level, silence an alert, or modify the consent ledger.

---

# 68. AUTO-EXECUTION ELIGIBILITY GATES

Defines what Mode 3 (Section 31) actually requires. All gates are ANDed. Any single failure disables auto-execution.

```
□ Strategy at certification level L5
□ Minimum live-assisted trades completed with acceptable divergence
□ Live vs backtest divergence within tolerance (Section 63)
□ Strategy health = HEALTHY (not WATCH, not DEGRADED)
□ Valid, unexpired, version-bound AuthorizationGrant (Section 66)
□ Step-up authentication completed for this grant
□ Capital cap set, and below the strategy's stated capacity limit
□ Daily loss limit and max drawdown halt configured
□ Broker supports every required order type and product for this strategy
□ Broker API health = healthy; token valid with sufficient remaining life
□ Market data feed healthy and fresh
□ Reconciliation clean as of last cycle (Section 13)
□ Kill switch reachable and tested (Section 30)
□ Alerting channel verified and deliverable
□ Regulatory, broker and exchange requirements satisfied for automated order flow (Section 70)
□ Defined disconnect behaviour configured (below)
□ User has completed automation risk acknowledgement for this specific strategy
```

### DISCONNECT / FAILURE BEHAVIOUR — MUST BE PRE-CONFIGURED

If connectivity, data or the broker API fails while automation holds open positions, the system must follow a pre-declared policy. It may never improvise, and it may never silently leave a position naked.

Permitted configurations:

* **HALT AND ALERT** *(default)* — no new entries; alert the user immediately and repeatedly until acknowledged.
* **PROTECTIVE EXIT** — attempt to flatten to a pre-defined safe state, if and only if the broker supports it and the user has explicitly configured it.
* **BROKER-SIDE PROTECTION** — rely on GTT / SL orders already resting at the broker, where supported. Prefer this: protection that survives your own platform going down is the only protection that counts.

Never: keep trading on stale data. Never: assume the last known position is current. Never: auto-retry into an unreconciled state.

---

# 69. AUTOMATION SUPERVISION

Running automation requires continuous proof of life and proof of sanity.

* **Heartbeat** between strategy runner, data feed, risk engine and execution service.
* **Dead-man switch** — if the heartbeat stops, automation halts. Fail closed, never fail open.
* **Stale-data halt** — no order may be generated from data older than a configured threshold, set per strategy and per instrument liquidity.
* **Rate governors** — max orders per second / minute / day, per strategy, per account, per user. Independent of, and stricter than, broker limits.
* **Anomaly detection and auto-halt** on: order rate spike, repeated rejections, unexpected fill prices, position drift vs. expected, P&L moving faster than the strategy's modelled distribution, or the same signal firing repeatedly.
* **Position drift detection** — continuous comparison of expected vs. actual broker positions. Any divergence halts automation pending reconciliation.
* **Mandatory human review cadence** — automation cannot run indefinitely unattended. A periodic review checkpoint is required to continue.
* **Kill switch independence** (Section 30) — the kill switch must not depend on the AI layer, the strategy runner, or any single service being alive.

---

# 70. INDIAN REGULATORY OVERLAY — SIGNALS, PERFORMANCE CLAIMS & AUTOMATION

**Expands Section 42.**

This is not a footnote to the product. In India, the signal-generation and performance-display features described in Sections 56–65 are *themselves* regulated activity, independent of whether an order is ever placed. Treat compliance as a runtime service, not a launch checklist.

### AREAS TO VERIFY AGAINST CURRENT PRIMARY SOURCES

*(SEBI circulars, NSE/BSE operational circulars, broker API terms — not secondary commentary, not this document, not model memory.)*

**Retail algorithmic trading framework.** SEBI's framework for retail participation in algo trading — originating in a February 2025 circular, phased through late 2025, with full applicability from 1 April 2026 — governs API-based automated order flow. Verify current requirements on:

* exchange-assigned algo ID tagging of every algorithmic order
* the orders-per-second threshold that classifies an order flow as "algo" and triggers registration
* empanelment of algo providers with exchanges, and the requirement to route through a registered broker rather than connecting directly to an exchange
* broker due-diligence and accountability obligations for third-party algos
* the **white box vs black box** distinction — a transparent, user-inspectable strategy is treated differently from one whose logic is hidden. Where logic is not disclosed to the user, SEBI Research Analyst registration requirements may attach.
* the restriction limiting a self-developed registered algo to the investor and immediate family — a hard constraint on any "share my strategy" or strategy-marketplace feature
* API access controls: two-factor / OAuth-based authentication, static IP and key requirements
* cybersecurity obligations, including VAPT, for platforms in the retail algo path

**Design consequence:** the architecture must treat "who is the algo provider" as a first-class question. A platform that generates strategies and routes orders for other people's accounts occupies a materially different regulatory position from a tool a single trader uses on their own account. Model this in the domain layer — the `provider_type` and `logic_disclosure` fields in Section 56 exist for this reason — because these flags change what the platform is legally permitted to do.

**Performance and win-rate display.** This is the direct constraint on Section 60. SEBI has operationalised the **Past Risk and Return Verification Agency (PaRRVA)** framework, covering verification of risk and return metrics for investment advisers, research analysts **and algorithmic trading services**. CARE Ratings has been recognised as the agency with NSE as the data centre; the framework moved to full operation in May 2026, with enrolment deadlines running through 2026 and a subsequent transition to displaying only verified metrics.

**Design consequence:** every performance number the platform displays must pass through a **Compliance Policy Service** that decides, at render time, whether this entity is permitted to show this metric to this audience. Build:

* `verified` vs `unverified` provenance flag on every metric
* audience segmentation (own use / client-facing / prospective-client-facing / advertising)
* per-metric display policy driven by configuration, not code
* a hard switch that can suppress all performance display without a deployment

**Advisory classification.** A personalised, portfolio-aware "you should buy X" is materially different from generic research output. Verify the boundary between research analyst and investment adviser activity as it applies to portfolio-aware recommendations, and gate Section 23's recommendation engine behind that classification.

**Standing instruction:** these rules are moving. Do not hard-code dates, thresholds or deadlines into product logic. Every value above is a configuration parameter with a `last_verified_date` and a source reference. Before implementing any live-execution or performance-display feature, fetch and read the current primary source.

---

# 71. END-TO-END LINEAGE

Every live order must be traceable backwards, in one query, through the complete chain:

```
ORDER
  ← broker_order_id
  ← execution_service_request_id
  ← approval_id + decision_record + auth_evidence
  ← authorization_grant_id (if automated)
  ← re_validation_record
  ← risk_validation_record
  ← signal_id
  ← strategy_id + strategy_version
  ← certification_record
  ← validation_protocol_results
  ← backtest_run_id + data_snapshot_hash + engine_version
  ← model_id + model_version + prompt_version (if AI-originated)
  ← evidence[] with source timestamps
```

If any link is missing, the order should not have been placed. Enforce lineage completeness as a pre-execution validation, not a post-hoc reporting nicety.

This chain is also the answer to "why did the system do that?" — from a user, from a broker, from an auditor, or from a regulator.

---

# 72. EXPLICIT ANTI-PATTERNS — DO NOT BUILD THESE

* A single opaque "AI confidence: 87%" number.
* A win rate displayed without sample size and confidence interval.
* A backtested statistic styled identically to a live statistic.
* Auto-trade enabled by default, or reachable in fewer than three deliberate steps.
* An LLM turning free-text reasoning directly into a broker order payload.
* An approval that remains valid after price, margin or market state has changed.
* Retrying a timed-out order without reconciling the broker order book first.
* Silently re-fitting a live strategy's parameters to restore performance.
* Statistics that reset, exclude losses, or inherit history across strategy versions.
* Alerts that can be muted for margin, unhedged legs, or risk breaches.
* A kill switch that depends on the AI layer being alive.
* "Best performing strategy" leaderboards ranked on unadjusted, un-risk-normalised backtest returns.
* Projecting rupee returns from a historical win rate.
* Any copy implying certainty, guarantee, or assured outcome.

---

# 73. THE CORE LOOP

```
VALIDATE        →  strategy proven under Sections 57–59 before it may speak
     ↓
SEE             →  signal generated with TTL, evidence and invalidation
     ↓
UNDERSTAND      →  strategy prior + setup quality, shown separately
     ↓
CONTEXTUALISE   →  portfolio impact, correlation, exposure, available margin
     ↓
ALERT           →  right severity, right channel, right time, with expiry
     ↓
DECIDE          →  approval request with full evidence, countdown,
                   and equal-weight reject
     ↓
RE-VALIDATE     →  at the moment of approval, not the moment of generation
     ↓
EXECUTE         →  deterministic service, idempotent, fully audited
     ↓
MONITOR         →  order, position, thesis, strategy health
     ↓
LEARN           →  decision quality, calibration, divergence
     ↓
PROMOTE / DEMOTE →  automatically, on evidence
```

The loop closes. Live outcomes feed back into strategy certification, which controls whether the strategy is permitted to generate the next signal.

---

---
---

# PART C — THE AI ACTION LAYER

**Part A defines how orders are placed. Part B defines where signals come from and what evidence entitles them to be shown. Part C defines what the AI itself is, what it may do, when it may act unprompted, what it must refuse, and how its behaviour is tested and constrained.**

Section 67 established the tier boundary — which classes of action the model may reach. It did not define the action catalogue, the numerical trust boundary, agent decomposition, proactive behaviour, abstention, or evaluation. Sections 74–91 close those gaps.

---

# 74. AI ACTION CATALOGUE

Section 67 defines tiers. This section defines the actual registry. Every AI-callable action is a declared, versioned entry — never an ad-hoc capability the model discovers or improvises.

```
AIAction
├── action_id
├── tier                    (T0 / T1 / T2 / T3 — never T4)
├── name
├── description             (what the model sees)
├── input_schema            (strictly typed, validated before execution)
├── output_schema
├── side_effects            (declared explicitly; must match tier)
├── reversibility           (none / soft / hard)
├── rate_limit              (per user, per session, per hour)
├── cost_class              (compute/model cost tier)
├── required_permissions
├── audit_level             (all T2/T3 fully logged with inputs and outputs)
├── failure_mode            (what happens on error — never silent)
└── version
```

### MINIMUM CATALOGUE

**T0 — READ**
`get_quote` · `get_holdings` · `get_positions` · `get_orders` · `get_trades` · `get_funds` · `get_margin` · `get_pnl` · `get_instrument` · `get_news` · `get_fundamentals` · `get_option_chain` · `get_journal` · `get_strategy_performance` · `get_alerts` · `get_portfolio_summary` · `get_broker_health`

**T1 — ANALYZE (no side effects)**
`run_screen` · `compute_indicators` · `compute_greeks` · `run_scenario` · `compute_correlation` · `compute_position_size` · `compute_charges` · `compute_margin_requirement` · `evaluate_portfolio_health` · `replay_backtest` · `compare_brokers` · `explain_position` · `analyse_closed_trade`

**T2 — PROPOSE (creates drafts only)**
`draft_signal` · `draft_trade_idea` · `draft_strategy` · `draft_hedge` · `draft_rebalance_plan` · `draft_journal_note` · `draft_watchlist`

**T3 — STAGE (creates pending, expiring, user-visible objects)**
`create_approval_request` · `arm_price_alert` · `arm_condition_alert` · `create_watchlist_trigger` · `schedule_scan` · `request_user_confirmation`

**T4 — EXECUTE — NOT IN THE CATALOGUE.** The model cannot see these actions, cannot name them, cannot call them. They do not appear in its tool list at all. Absence is a stronger control than refusal.

### RULES

* An action not in the catalogue does not exist. The model may not compose two permitted actions into an effect neither was authorised to produce — the validator checks the *effect*, not the call.
* Adding a T3 action requires the same review as a security change.
* Every T2 and T3 call is logged with full input, full output, model version and prompt version.
* Rate limits are per action and enforced server-side. A model in a retry loop must be stopped by infrastructure, not by instruction.

---

# 75. NUMERICAL GROUNDING — THE MODEL NEVER COMPUTES MONEY

**No number that affects a rupee, a quantity, a risk figure or a price may originate from a language model.**

This is the single highest-value constraint in Part C. Language models produce plausible arithmetic, and plausible arithmetic in a position-sizing calculation is how accounts get destroyed.

### THE RULE

| Number | Source |
|---|---|
| Position size / quantity | Deterministic sizing service |
| Lot count, lot size | Security Master |
| Stop, target, entry levels | Strategy engine, from price data |
| Risk ₹ and risk % | Risk engine |
| Margin requirement | Broker API or margin calculator |
| Charges, taxes, breakeven | Cost engine |
| P&L, returns, drawdown | Portfolio engine |
| Greeks, IV, payoff | Analytics engine |
| Win rate, expectancy, all statistics | Performance service (Section 60) |
| Probabilities and confidence | Calibrated model in Section 62 |

The LLM may **reference** these numbers by token and **explain** them. It may never produce them, restate them from memory, round them, adjust them, or infer them.

### IMPLEMENTATION

* Numbers enter model context as typed, tagged values with an ID: `{value: 47250, unit: INR, ref: "risk_calc_8813"}`.
* Model output is templated — the model produces narrative with placeholders; the rendering layer substitutes the authoritative value. A model that writes a bare numeral into a trade-relevant field is a rejected output, not a warning.
* A post-generation validator scans every model output for numeric literals in financial context and rejects any that do not match a referenced authoritative value.
* This applies to natural-language chat output as much as to structured proposals. "You'd risk about ₹12,000 on this" must come from the risk engine or must not be said.

**If the model cannot get a number from an authoritative source, it says so. It never estimates.**

---

# 76. AGENT ROLE DECOMPOSITION

A single model instance doing analysis, risk assessment and recommendation in one pass will rationalise its own conclusion. Separate the roles, and make one of them adversarial.

| Agent | Responsibility | May not |
|---|---|---|
| **ANALYST** | Interpret market data, news, fundamentals, technicals. Produce a view. | See the user's portfolio, or propose an order |
| **PORTFOLIO** | Assess fit against holdings, exposure, correlation, capital | Originate a market view |
| **RISK** | Compute and enforce limits, sizing, worst case | Be overridden by the analyst or the user below platform floors |
| **CRITIC** | **Argue against the proposed trade.** Find the strongest disconfirming evidence, the failure scenario, the reason this is a bad idea. | Be skipped, be optional, or be summarised away |
| **EXECUTION** | Deterministic code only — no model | — |
| **COACH** | Review behaviour and decision quality over time (Section 80) | Generate trade signals |

### THE CRITIC IS MANDATORY

Every T2 proposal that reaches a user must carry the critic's output alongside it, at equal visual weight. Not a disclaimer — a substantive counter-case:

```
THE CASE AGAINST THIS TRADE
  • Strongest disconfirming evidence
  • What has to be true for this to work
  • What breaks it
  • Base rate: how this setup has performed in similar conditions
  • What you'd lose and how fast
```

If the critic cannot construct a meaningful counter-case, that is a signal the evidence is thin, not that the trade is safe. Log it and flag it.

### RULES

* Agents communicate through typed, validated structures — never by passing free text that a downstream agent parses.
* No agent may modify another agent's output. The pipeline is additive.
* Disagreement between agents is surfaced to the user, never resolved silently by a summariser.
* The user must be able to see each agent's raw contribution.

---

# 77. CONVERSATIONAL ACTION SAFETY

Natural language is ambiguous. Ambiguity plus money is the problem this section exists to solve.

### REFERENT RESOLUTION

"Sell it" · "close half" · "do the same for Reliance" · "buy more" · "the one from yesterday"

* Every pronoun and elliptical reference must resolve to exactly one unambiguous entity, confirmed back to the user in full.
* **Zero matches or multiple matches → ask.** Never guess. Never pick the most recent.
* Resolution is displayed explicitly: "Close half of your **NIFTY 25000 CE, 3 lots, bought 12 Aug via Dhan** — is that right?"
* References expire with conversation context. A reference older than the configured window must be re-established, not assumed.

### QUANTITY AND UNIT AMBIGUITY

This is a common and expensive failure class:

* "Buy 1 lakh of TCS" — rupees or shares? **Always ask.** Never infer from plausibility.
* "Buy 5 NIFTY" — lots or units? Options are quoted per unit and traded per lot. Resolve explicitly, every time.
* "Half" / "some" / "a bit" — never converted to a number by the model. Present a control, or ask.
* Percentages must state their base: percent of position, of capital, of portfolio, of risk budget.

### NEGATION, CONDITIONALS AND HYPOTHETICALS

* "Don't buy TCS" and "what if I bought TCS" must never produce a staged order.
* Hypothetical framing ("suppose I went long", "show me what it would look like") is T1 analysis only.
* Past tense and future tense are not instructions. "I was going to buy" is not "buy".
* Sarcasm, frustration and venting are not instructions. "Just sell everything, I'm done" opens a conversation, not an approval sheet.

### CONFIRMATION GRAMMAR

* An action-triggering utterance must be unambiguous, affirmative, present-tense and specific.
* Bare affirmations ("yes", "ok", "sure", "go ahead") may advance a flow but never *complete* an approval — the approval sheet in Section 65 with its own explicit control is always required.
* If the user's message contains multiple possible actions, handle exactly one and ask about the rest. Never batch-execute an inferred list.

---

# 78. PROACTIVE AI BEHAVIOUR — WHAT THE AI MAY DO UNPROMPTED

The AI acts without a user prompt: background scans, monitoring, alerts, health checks. This is the least-governed part of most products and it needs explicit limits.

### PERMITTED UNPROMPTED

* Run scheduled scans over certified strategies
* Monitor open positions against stops, targets and invalidation conditions
* Monitor portfolio risk and margin
* Monitor strategy health (Section 63)
* Monitor broker and data health
* Generate signals and alerts within the user's configured scope
* Stage approval requests **only** in Mode 2.5 or Mode 3, only within an active grant

### NEVER UNPROMPTED

* Place, modify or cancel any order outside a valid Section 66 grant
* Change any user setting, limit, preference or default
* Alter a strategy, its parameters or its certification level
* Connect, disconnect or re-authenticate a broker
* Send anything on the user's behalf externally
* Expand its own scope or extend a grant

### PROACTIVITY BUDGET

Attention is finite and the platform must treat it as a scarce resource it is spending.

* Hard cap on unprompted user-facing messages per day, per severity class.
* Every proactive message must clear a relevance threshold — it must be materially actionable, not merely true.
* Track engagement per proactive message type. Message classes users consistently ignore are automatically down-ranked and eventually disabled.
* CRITICAL alerts are exempt from the budget and from suppression.
* Users can tune the budget down. They cannot tune CRITICAL off.

### SCHEDULED JOB REQUIREMENTS

Every background job declares: schedule, scope, permitted actions, max runtime, failure behaviour, and the user-visible surface it can write to. A job that fails must alert, never fail silently. A job that cannot complete within its window must halt rather than run against stale data (Section 69).

---

# 79. "NO TRADE" IS A FIRST-CLASS OUTPUT

A system that is asked daily for the best setups will eventually manufacture them. This must be structurally prevented, not culturally discouraged.

### REQUIREMENTS

* **`NO_SIGNAL` is a valid, complete, expected result.** It must render as a proper answer — not an empty state, not an error, not an apology, not a consolation list of weaker ideas.
* Never fill a slot. If the UI has a "today's setups" section and there are no qualifying setups, it says there are none and explains why: no regime match, insufficient volatility, event blackout, all strategies in WATCH.
* **No minimum signal quota.** No strategy, screen, digest or notification may have a target number of signals. Track and alarm on any surface whose signal count is suspiciously stable.
* The AI must be able to say: *"I don't know"*, *"the evidence is thin"*, *"this is outside what this strategy was validated on"*, *"I can't answer that from available data"*.
* **Abstention is measured.** Track abstention rate per strategy and overall. A falling abstention rate during a difficult market is a symptom of degradation, not improvement.
* When the user pushes for a recommendation and there is no evidential basis, the AI declines and explains why. It does not produce a weaker idea to satisfy the request.

### FORBIDDEN

* "Top 5 setups today" as a fixed-count feature
* Ranking weak signals to fill a list
* Lowering thresholds to produce output
* Presenting a low-conviction idea in the same format as a high-conviction one
* Any metric or incentive that rewards signal volume

---

# 80. AI COACH & RESPONSIBLE TRADING GUARDRAILS

Section 51 lists an "AI Trading Coach". A coach that only optimises entries is not a coach. The dominant destroyer of retail trading accounts is behaviour, not analysis — and a platform that makes trading frictionless without addressing behaviour makes the problem worse.

### BEHAVIOURAL PATTERNS THE COACH MUST DETECT

* **Revenge trading** — re-entry shortly after a loss, in the same instrument, at increased size
* **Escalating position size** after losses (loss-chasing / martingale behaviour)
* **Overtrading** — trade frequency far above the user's own baseline or the strategy's expected frequency
* **Rule violation** — trades taken outside any certified strategy, or against the user's own stated limits
* **Stop-loss widening** — moving a stop away from entry after the trade is open
* **Cutting winners early, holding losers** — asymmetry between realised win and loss duration
* **Concentration creep** — increasing exposure to a single name, sector or expiry over time
* **Session-length and time-of-day patterns** correlated with poor decision quality
* **Post-large-loss activity spikes**

### COACH ACTIONS

* Surface the pattern with the user's own data — no diagnosis, no judgement, no labels about the person. Show behaviour and outcomes, and let the user draw the conclusion.
* Offer a **voluntary cooling-off**: a user-set pause after a defined loss or losing streak. Once set, it is enforced by the platform and cannot be lifted instantly by the same impulse that would break it — require a delay before it can be disabled.
* Offer user-defined hard limits (daily loss, daily trade count, max size) that the platform enforces server-side.
* Compare decision quality (Section 35) rather than P&L when giving feedback.

### PLATFORM OBLIGATIONS

* Never use urgency, scarcity, streaks, gamification or loss-aversion mechanics to drive trading activity.
* Never celebrate trade volume. Never award badges for frequency.
* Never present a losing streak in a way that implies a win is now due.
* Where relevant, surface honest base rates about the segment being traded — particularly for retail F&O — using verified public data rather than platform-flattering framing.
* If a user's behaviour shows a sustained destructive pattern, the appropriate platform response is friction and clear information, not more signals.

---

# 81. SIGNAL DISTRIBUTION, CROWDING & CAPACITY

The same signal delivered to many users at once is a different object from the same signal in a backtest.

* Every strategy declares a `capacity_limit` (Section 56). Track aggregate capital following each strategy against it.
* When aggregate following capital approaches capacity, **stop distributing the signal to new users** rather than degrading it for everyone.
* Model and monitor self-impact: measure realised slippage across all users taking a signal versus the backtest assumption. Rising aggregate slippage is a capacity breach, and it feeds Section 63 health monitoring.
* Illiquid instruments require a hard cap on concurrent recipients. A signal on a thinly traded name distributed to thousands of users is a market event, not a recommendation.
* Distribution must be fair and auditable — no ordering that advantages one user tier over another without disclosure. Record distribution time per recipient.
* Report crowding to the user: "N users currently following this strategy" where that is material to their expected fill quality.

---

# 82. STRATEGY CONFLICT RESOLUTION

Multiple certified strategies will eventually disagree.

Handle explicitly:

* **Opposing signals on the same instrument** — never net them silently, never show both as if unrelated. Surface the conflict, show each strategy's evidence and health state, and let the user decide. Default to no action.
* **Same-direction signals on correlated instruments** — aggregate the exposure before sizing. Two 2% risk trades on highly correlated names is one 4% risk position.
* **A new signal that would breach a portfolio limit** — the limit wins. The signal is shown as blocked, with the reason.
* **A signal on an instrument already held under a different strategy** — declare precedence rules up front: which strategy owns the position, whose stop applies, who manages the exit. Ambiguous ownership of an open position is a serious defect.
* **Hedging vs. closing** — when one strategy wants out and another wants a hedge, present both with costs, never auto-select.
* Aggregate exposure limits are always evaluated at portfolio level, never per strategy.

---

# 83. SIGNAL ELIGIBILITY GATE — WHO MAY SEE THIS SIGNAL

Not every certified signal is appropriate for every user. Evaluate before display, not after.

```
□ User's capital is sufficient for the minimum viable position (one lot, with margin)
□ Position at the user's risk % is above the minimum meaningful size after costs
□ User's broker supports the required instrument, product and order type
□ User has the relevant segment activated with their broker
□ Instrument is not already at the user's concentration limit
□ Signal does not conflict with an existing position (Section 82)
□ User's stated experience and risk profile match the instrument class
□ Strategy is within the user's subscribed/enabled set
□ Signal has not expired in transit
```

If a signal fails eligibility, do not show it as an opportunity the user is missing. Either suppress it or show it as unavailable with the specific reason. Displaying trades a user structurally cannot take is a pressure mechanic, not information.

**Cost floor:** if round-trip costs consume a disproportionate share of the expected edge at the user's viable size, the signal is not shown. A trade that only works at ten times the user's capital is not a trade for that user.

---

# 84. APPROVAL CONCURRENCY & DELIVERY FAILURE

Practical failure modes that Section 65 must handle explicitly:

* **Multi-device race.** An approval may be acted on from phone, tablet and web simultaneously. Approval state is a server-side lock. First decision wins; other devices show the resolved state immediately. Never two orders from one approval.
* **Approve-then-disconnect.** If the client loses connection between approval and confirmation, the user must be able to determine the true state on reconnect. Resolve against the broker order book (Section 13) before displaying anything.
* **Notification not delivered.** Track delivery. If an ACTION-class approval was never delivered and expires unseen, log it and surface it in a review queue — a user should be able to see what they missed and why.
* **Duplicate approval requests** for the same signal must be deduplicated at creation, not at execution.
* **Approval while market is halted, in auction, or in a circuit** — validate market state at approval time; queue or void, never submit blind.
* **Expiry during review.** If the countdown ends while the user is looking at the sheet, the control becomes inert with a clear message and an option to request a fresh evaluation. Never a silent extension.

---

# 85. AI RELIABILITY, FALLBACK & DEGRADED MODE

The AI layer will be slow, rate-limited or unavailable. Behaviour must be defined in advance.

* **The AI layer is never in the critical path of risk management.** Stops, targets, limits, margin monitoring, reconciliation and kill switches are deterministic services that function fully with the AI offline.
* **Degraded mode is explicit and visible.** When the model is unavailable, the platform says so. It does not silently fall back to a weaker model, a cached response, or a template while presenting output as normal.
* **Model substitution is disclosed.** If a fallback model serves a request, the output is labelled and its provenance recorded (Section 87).
* **Timeouts fail closed.** A T3 action that times out creates nothing. It never partially stages.
* **No stale AI output.** Model responses carry the timestamp and data snapshot they were generated from; anything past the freshness threshold is discarded, not shown with a caveat.
* **Cost and rate governance** — per-user and per-tenant budgets on model calls, with graceful degradation of non-essential features first. Analysis depth degrades before safety features do.

---

# 86. AI EVALUATION & REGRESSION SUITE

An AI feature without an eval suite is untested code shipping to production every time the model, the prompt or the context changes.

**Release gate: no model version, prompt version or context change reaches production without passing the full suite.**

### REQUIRED TEST SETS

* **Golden set** — canonical inputs with expected structured outputs across analysis, sizing, proposal and refusal.
* **Numeric grounding tests** (Section 75) — assert that no financial figure in output is model-generated.
* **Referent and ambiguity tests** (Section 77) — pronouns, elliptical references, unit ambiguity, negation, hypotheticals. Assert that ambiguity produces a question, never an action.
* **Prompt-injection suite** — malicious instructions embedded in news, filings, company names, instrument descriptions, broker error messages, PDF research, user-supplied notes and chat history. Assert zero action taken, instruction surfaced not obeyed.
* **Jailbreak and pressure suite** — attempts to obtain unauthorised actions through role-play, urgency, claimed authorisation, emotional pressure, or incremental escalation across turns. Include the case where an earlier turn shows the assistant apparently complying: prior context is never authorisation.
* **Abstention tests** (Section 79) — assert `NO_SIGNAL` is produced when it should be, and that pressure to recommend does not lower the threshold.
* **Tier-boundary tests** (Sections 67, 74) — assert no T4 reachability, and no composition of permitted actions producing an unauthorised effect.
* **Calibration evaluation** (Section 62) — reliability curve and Brier score against held-out outcomes.
* **Critic quality tests** (Section 76) — assert the counter-case is substantive and specific, not boilerplate.
* **Determinism tests** — repeated sampling on identical input produces materially identical proposals.
* **Regression corpus** — every production incident becomes a permanent test case.

### CONTINUOUS

* Shadow-run new model versions against live inputs before promotion; compare proposals, refusals and numeric outputs.
* Sample and human-review a fixed percentage of T2/T3 outputs continuously.
* Red-team on a defined cadence, by people who did not build the feature.

---

# 87. AI OUTPUT PROVENANCE & LABELLING

The user must always be able to tell what they are looking at.

Every user-facing element carries a provenance class:

| Class | Meaning | Visual treatment |
|---|---|---|
| `MARKET_DATA` | From exchange/broker feed | Timestamped, source-named |
| `COMPUTED` | Deterministic engine output | Formula inspectable on demand |
| `SOURCED` | From a document, filing or article | Linked to source, dated |
| `AI_ANALYSIS` | Model-generated interpretation | Distinctly marked as AI-generated |
| `AI_PROPOSAL` | Model-generated trade idea | Distinctly marked, always with critic output |
| `HYPOTHETICAL` | Backtest, simulation, scenario | Permanent watermark (Sections 45, 60) |

**Rules:**

* AI-generated interpretation must never be visually indistinguishable from computed fact.
* Every AI-generated claim about the world must cite its source or be marked as unsourced inference. Unsourced inference may not be used as evidence in a Signal object.
* The user can always ask "where did this come from?" and receive the actual chain — data source, timestamp, computation, model version.
* Model attribution is recorded even where it is not displayed, for audit (Section 71).
* Never present model output as consensus, expert opinion or market view unless it demonstrably is, with sources.

---

# 88. UNDO, REVERSAL & CORRECTION SEMANTICS

Be honest about what can and cannot be taken back.

| Action | Reversibility | Treatment |
|---|---|---|
| Draft, watchlist, journal note | Full undo | Standard undo |
| Alert armed, scan scheduled | Full undo | Standard undo |
| Approval request created | Cancellable before decision | Cancel |
| Order submitted, not filled | Cancel attempt only — **not guaranteed** | Never label as "undo" |
| Order filled | **Irreversible.** A reversing trade is a new trade with its own cost and risk | Never label as "undo" or "cancel" |
| Position closed | Irreversible | — |

**Rules:**

* The word "undo" is reserved for genuinely reversible actions. Never use it for anything that touched an exchange.
* Offering to "reverse" a filled trade must present it as a new trade, with full order preview, its own costs, and its own approval.
* Correction of a mistaken trade is an emotionally loaded moment and is precisely where users overtrade. Apply extra friction, not less.
* Every reversal is journaled and linked to the original, and both count in performance statistics.

---

# 89. INCENTIVE ALIGNMENT

State this in the architecture because it determines what gets optimised.

* **No metric that rewards order volume, trade frequency, or notional turnover may be used to tune signal generation, alerting, ranking or AI behaviour.** If the platform's revenue is linked to activity, the signal engine must be firewalled from that objective, and the conflict must be disclosed to the user.
* Ranking of strategies is by risk-adjusted, cost-inclusive, out-of-sample performance — never by returns alone and never by popularity.
* Broker routing suggestions must disclose any commercial relationship (Section 25).
* The AI must never adjust its confidence, framing or urgency based on what the user seems to want to hear. Track and test for sycophancy explicitly — a user pushing back on a negative assessment must not soften it.
* Success metrics for the product should include user decision quality, calibration accuracy, abstention rate and adherence to stated risk limits — not just engagement and order count.

---

# 90. ADDITIONAL AI ANTI-PATTERNS

Extends Section 72.

* An LLM producing any rupee figure, quantity, price level or statistic.
* Executing on an ambiguous reference, or resolving "it" by picking the most recent thing.
* Inferring units — treating "1 lakh" as shares or rupees without asking.
* Treating a hypothetical, negation or vent as an instruction.
* A single agent that both proposes a trade and assesses its risk.
* Shipping a proposal without a substantive counter-case.
* Filling a fixed-length "top setups" list.
* Silently falling back to a different model.
* An eval suite that tests capability but not refusal.
* Proactive messages with no attention budget.
* Gamification of trading activity.
* An AI layer that sits in the critical path of stop-loss monitoring.
* Presenting AI inference in the same visual language as computed fact.
* Calling an exchange-facing action "undo".
* Tuning signal generation on any engagement or volume metric.

---

# 91. AI LAYER ACCEPTANCE CRITERIA

The AI layer is not shippable until:

✓ Every AI-callable action is in the versioned catalogue with a declared tier (Section 74)
✓ T4 actions are absent from the model's tool surface entirely
✓ No financial number in any output originates from the model (Section 75)
✓ Numeric grounding validator runs on every output and blocks on failure
✓ Analyst, portfolio, risk and critic roles are separated (Section 76)
✓ Every proposal ships with a substantive counter-case
✓ Ambiguous references and units produce questions, never actions (Section 77)
✓ Bare affirmations cannot complete an approval
✓ Proactive behaviour is bounded by a declared budget (Section 78)
✓ `NO_SIGNAL` renders as a complete answer; no fixed-count surfaces exist (Section 79)
✓ Abstention rate is tracked and alarmed
✓ Behavioural guardrails and cooling-off are implemented (Section 80)
✓ Capacity and crowding limits are enforced per strategy (Section 81)
✓ Strategy conflicts are surfaced, never silently netted (Section 82)
✓ Signal eligibility gate runs before display (Section 83)
✓ Approval concurrency is server-locked; one approval cannot produce two orders (Section 84)
✓ Risk management functions fully with the AI layer offline (Section 85)
✓ Degraded mode and model substitution are visible to the user
✓ Full eval suite passes, including injection, jailbreak, abstention and tier-boundary tests (Section 86)
✓ Provenance labelling is applied to every user-facing element (Section 87)
✓ "Undo" is never used for exchange-facing actions (Section 88)
✓ No volume-linked metric tunes AI behaviour (Section 89)
✓ Sycophancy tests pass

Only then may the AI layer be enabled for live-assisted trading.

---

---
---

# PART D — OPTIONS INTELLIGENCE, DATA ARCHITECTURE & POSITIONING

**Parts A–C define execution, evidence and the AI boundary. Part D closes the two engineering gaps that constrain everything above them — options analytics and the data layer — and fixes the product's position in a market that already contains working competitors.**

---

# 92. OPTIONS INTELLIGENCE ENGINE

Parts A and B handle options *execution* thoroughly — multi-leg atomicity, partial fills, freeze quantity, backtest fill realism. They do not define options *analytics*. Given that options are central to this product, this is a first-class subsystem, not a feature of the market brain.

### 92.1 CHAIN INGESTION & NORMALISATION

Per underlying, per expiry, per strike, maintained as a time series and not merely a current snapshot:

`ltp · bid · ask · bid_qty · ask_qty · spread · volume · OI · change_in_OI · IV · underlying_spot · underlying_future · time_to_expiry · lot_size · strike_step · freeze_qty`

Every snapshot is timestamped and retained. Option analytics that cannot be reconstructed for a past moment cannot be backtested (Section 57) — chain history is the dependency.

### 92.2 DERIVED METRICS

**Positioning:** OI by strike · change in OI · combined OI across expiries · OI-weighted strikes · PCR by OI · PCR by volume · max pain · OI-derived support and resistance · rollover data near expiry

**Buildup classification** (price × OI, standard Indian market framing): long buildup · short buildup · short covering · long unwinding — computed per strike and aggregated to the underlying.

**Volatility:** IV per strike · ATM IV · IV percentile and IV rank over a defined lookback · term structure across expiries · skew (put vs call, and by moneyness) · realised vs implied · IV crush around known events

**Expected move:** from ATM straddle price and from IV, for the current expiry and for a chosen horizon, always labelled `HYPOTHETICAL` (Section 87).

**Liquidity:** per-strike volume, OI, spread in absolute and percentage terms, depth where available, and a computed `tradeable` flag.

**Greeks:** delta, gamma, theta, vega, rho — per leg, per strategy, and aggregated to portfolio level. Computed by the quant engine only (Section 75).

### 92.3 STRATEGY SELECTION — THESIS DRIVES STRUCTURE

The engine must not present a menu of structures and let the model pick. Structure is *derived* from an explicit thesis across three axes:

```
DIRECTION      bullish / bearish / neutral / uncertain
VOLATILITY     expect IV expansion / contraction / stable
TIME           event-driven / trend / range / expiry-specific
```

plus constraints: available capital, available margin, margin type, user's defined risk tolerance, strike liquidity, days to expiry, and whether the user is permitted undefined-risk structures.

That combination maps to eligible structures — long call/put, covered call, protective put, bull call spread, bear put spread, bull put spread, bear call spread, straddle, strangle, iron condor, iron butterfly, calendar, diagonal, ratio structures.

**Rules:**

* Every proposed structure must state which thesis produced it. A structure without a thesis is not a proposal.
* Where several structures fit, present the trade-offs (cost, max loss, breakeven, probability-weighted payoff, margin, leg count, execution risk) rather than silently choosing.
* **Undefined-risk structures** — naked short options, ratio structures with unlimited exposure — require: explicit separate consent, verified margin headroom well above requirement, an experience gate, and a prominent statement of theoretical maximum loss. These are never proposed by default and never to a user who has not explicitly enabled them.
* **Leg count discipline.** Each additional leg adds execution risk (Section 10), cost and spread. A four-leg structure must demonstrably beat the two-leg alternative after costs, or the two-leg version is proposed instead.
* **Liquidity gate.** A strike failing the spread/OI/volume threshold cannot appear in any leg. Illiquid legs are the most common cause of a structure that backtests well and trades badly.

### 92.4 PAYOFF & SCENARIO

Per structure: payoff at expiry and at intermediate dates, breakevens, max profit, max loss, margin requirement, cost including all charges, probability-weighted outcomes where IV supports it, and sensitivity to spot, IV and time. Aggregate Greeks exposure at portfolio level (Section 15).

### 92.5 POSITION MANAGEMENT

Options positions require ongoing decisions equity positions do not:

* time decay tracking against thesis timeline
* IV change since entry, separated from directional P&L — the user must be able to see *why* the position moved
* adjustment triggers (delta drift, breach of a short strike, IV regime change)
* roll analysis — cost, benefit, and whether rolling is thesis-preserving or loss-avoidance
* expiry management: assignment risk, physical settlement, STT on exercise, square-off deadlines
* expiry-day behaviour flags

**Rolling a losing position is the most common way a defined loss becomes an undefined one.** Every roll proposal must show the original max loss, the cumulative loss including the roll, and must be classified as thesis-preserving or loss-avoiding.

### 92.6 EVENT & EXPIRY AWARENESS

Results, policy decisions, index rebalances and expiry all change option behaviour predictably. The engine must flag event proximity, expected IV crush, expiry-week liquidity shifts, and weekly-versus-monthly differences — and feed these into the setup quality checklist (Section 62) and the eligibility gate (Section 83).

---

# 93. DATA ARCHITECTURE & INFRASTRUCTURE

Parts A–C specify data *requirements* — point-in-time correctness, snapshot hashes, freshness thresholds. They do not specify the data *architecture* that makes those requirements achievable. **Data sourcing is likely the binding constraint on this product, ahead of architecture.**

### 93.1 DOMAINS

| Domain | Characteristics |
|---|---|
| Instrument master | Slow-changing, must be versioned and point-in-time queryable |
| Real-time quotes | High volume, low latency, ephemeral |
| Historical OHLCV | Bulk, append-mostly, adjustment-sensitive |
| Tick / intraday bars | Very high volume, expensive to retain |
| Options chain snapshots | Very high volume, **essential for options backtesting** |
| Corporate actions | Low volume, high impact, must be authoritative |
| Fundamentals | Periodic, must retain original unrestated values |
| News & events | Unstructured, needs publication timestamps |
| Derivatives positioning | Daily/intraday OI, rollover |

### 93.2 SOURCING — VERIFY LICENSING BEFORE ARCHITECTING

**Critical:** market data obtained through a broker API is generally licensed for that authenticated user's own use. It is usually *not* licensed for redistribution, for building a platform-wide dataset, for serving other users, or for commercial analytics. Verify each broker's API terms and the exchange's data licensing before designing any component that aggregates or reuses broker-sourced data.

**Separate data into two classes with different providers and different licences:**

* **LIVE / EXECUTION DATA** — quotes, positions, funds, live option chain for the user's own trading. Broker feeds are appropriate here: the data concerns that user's own account and session.
* **RESEARCH DATA** — the historical corpus behind backtesting, validation, strategy statistics and anything displayed to multiple users. This requires a separately licensed source with explicit commercial-use and redistribution terms.

**Never build the research corpus from broker feeds.** Broker market data is generally licensed to the authenticated user, not to you; a research database assembled from it is both a licensing exposure and a single point of failure tied to one broker relationship. Never scrape exchange websites — exchange site terms restrict copying and aggregation and are not a substitute for licensed data access.

Build the abstraction so that each data domain has an independent, swappable provider, because the answer will differ per domain:

* broker API (per-user, licence-constrained)
* licensed commercial vendor feed
* direct exchange data licensing
* public/official filings and disclosures

**Historical options data in India is the hard one.** Deep, clean, per-strike historical chain data — with correct expiries, lot size changes, strike availability and bid/ask — is expensive and patchy. Whatever you can actually obtain sets the ceiling on which options strategies Section 58 can validate. Resolve this before writing the backtest engine, not after: an engine that assumes data you cannot buy is wasted work.

**DATA SOURCE MATRIX — a required deliverable before the backtest engine is built.** One row per data type, filled from current provider documentation and contracts, never from assumption:

| Data type | Provider | Real-time | Delayed | Historical depth | API | Rate limit | Cost model | Licence | Redistribution permitted | Commercial use permitted | Known gaps | Fallback provider | Last verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Instrument master | | | | | | | | | | | | | |
| Real-time quotes | | | | | | | | | | | | | |
| Market depth | | | | | | | | | | | | | |
| Historical OHLCV (daily) | | | | | | | | | | | | | |
| Historical intraday bars | | | | | | | | | | | | | |
| Tick data | | | | | | | | | | | | | |
| Options chain (live) | | | | | | | | | | | | | |
| Options chain (historical) | | | | | | | | | | | | | |
| Open interest | | | | | | | | | | | | | |
| Implied volatility | | | | | | | | | | | | | |
| Futures data | | | | | | | | | | | | | |
| Corporate actions | | | | | | | | | | | | | |
| Fundamentals | | | | | | | | | | | | | |
| News | | | | | | | | | | | | | |
| Block / bulk deals | | | | | | | | | | | | | |
| Index constituents & history | | | | | | | | | | | | | |

**A row with unresolved licence or redistribution status blocks every feature that depends on it.** Mark the dependent feature `BLOCKED — DATA LICENSING UNRESOLVED` rather than building against an assumption.

### 93.3 STORAGE & SNAPSHOTTING

* Time-series store for quotes, bars, ticks and chain snapshots.
* Relational store for canonical entities — instruments, accounts, orders, strategies, signals, approvals.
* Object store for immutable snapshots and backtest datasets.
* Append-only, tamper-evident store for the audit and consent ledgers (Sections 43, 66).

`data_snapshot_hash` (Sections 57, 61) requires real infrastructure: an addressable, immutable, retrievable dataset for every backtest run and every signal. A hash referencing data you can no longer reconstruct is decorative.

**Retention policy per domain,** with explicit cost modelling. Full tick retention across the F&O universe is not free; decide deliberately what is retained at full resolution, what is downsampled, and what is discarded — and record that decision, because it silently constrains future backtesting.

### 93.4 CORPORATE ACTION PIPELINE

An independent, auditable pipeline that detects, validates and applies splits, bonuses, dividends, rights, demergers, symbol and ISIN changes across every affected dataset — historical bars, holdings, journal entries, strategy statistics and open positions.

An unapplied corporate action silently corrupts every backtest touching that instrument. Reconcile against an authoritative source and alert on any discrepancy rather than applying blindly.

### 93.5 DATA QUALITY SERVICE

Continuous, automated, and wired into the signal path:

* gap detection · stale-data detection · outlier and bad-tick detection
* cross-source reconciliation where two providers overlap
* corporate-action consistency checks
* chain completeness (missing strikes, missing expiries)
* a per-instrument, per-domain **data quality score**

**Signals may not be generated from data below the quality threshold** (Sections 61, 62). Data quality is an input to the setup quality checklist, and a data quality failure is a CRITICAL alert (Section 64).

### 93.6 LATENCY BUDGET

Declare an end-to-end budget per feature class — tick to signal, signal to alert, approval to order submission — and monitor it. Publish the actual distribution, not the target. A strategy whose backtest assumes execution the platform cannot deliver is invalid, and this is measured, not assumed.

### 93.7 INFRASTRUCTURE CONSEQUENCES OF BROKER REQUIREMENTS

Broker API constraints are not just checklist items in Section 1 — they determine the deployment topology:

* **Static IP whitelisting.** At least one major broker requires whitelisted static IPs for order placement, modification and cancellation. This rules out ordinary serverless deployment for the execution path, forces fixed egress (NAT gateway or dedicated egress with reserved addresses), constrains horizontal scaling and multi-region failover, and adds a registration step per broker. **Design the execution service around fixed egress from the start** — retrofitting it means re-architecting the deployment.
* **Token lifecycle.** Daily re-authentication, TOTP requirements and session expiry differ per broker. Token refresh is a scheduled, monitored, alerting service, not an inline retry.
* **Rate limits** differ per broker and per endpoint. Enforce platform-side governors stricter than the broker's (Section 69).
* **Per-broker deployment matrix:** static IP required? · webhook/postback endpoint needed? · 2FA/TOTP mechanism · token lifetime · rate limits · sandbox availability · IP registration lead time.

### 93.8 DISASTER RECOVERY & REPLAY

Full reconstruction of any past trading day from stored data. Recovery objectives for the execution path stated separately from analytics — losing analytics for an hour is an inconvenience; losing order state is not. On restart, the platform reconciles against the broker before displaying or acting on anything (Section 13).

---

# 94. MARKET REFERENCE & PRODUCT POSITIONING

Build against what exists, not against a blank market. India already has mature players in the adjacent space, and their choices are evidence about what is achievable and what is legally comfortable.

### 94.1 REFERENCE POINT

IntradayScreener / CashFlow, by Investobull Fintech, is a directly adjacent product. Its public description reports around 900,000 traders, integration with 9+ brokers for portfolio management and order placement, an AI scanner that converts plain-English descriptions into scan logic, 30+ pre-built intraday and EOD scanners, 15+ options tools, real-time alerts, one-click trading with supported brokers, and a CashFlow module offering AI fundamental analysis, stock rankings, an AI chatbot and WhatsApp alerts. The company was founded in 2018.

**What this establishes:**

* Multi-broker connectivity with order placement is achievable by a small Indian company. The broker layer is not the moat.
* Scanners, options tools and AI chat are commodity features. Building them well is table stakes, not differentiation.
* Eight years from founding to that position. Calibrate timelines accordingly.
* **WhatsApp is a primary alert channel in this market.** Section 64's channel design should treat it as first-class, with its own delivery guarantees, template constraints and rate limits — not as an afterthought behind push notifications.

### 94.2 THE REGULATORY SIGNAL — READ THIS CAREFULLY

That platform publicly positions itself as not SEBI registered, offering no buy/sell recommendations, and describes itself as a tool that filters stocks on technical parameters only.

This is the single most important competitive datapoint in this document. A company with roughly 900,000 users and nine broker integrations has chosen to stay explicitly on the *tool* side of the line rather than the *advice* side.

**Your specification, as written, does not sit there.** Portfolio-aware recommendations (Section 23), holding-level actions (Section 21), certified strategies emitting directional signals (Sections 59, 61) and displayed win rates (Section 60) are materially closer to research/advisory activity than "a technical filter." The PaRRVA framework in Section 70 exists precisely because performance claims attached to algorithmic and research services are now supervised.

**Therefore, before Phase 1, decide the product's regulatory identity explicitly:**

| Position | What you may do | Consequence |
|---|---|---|
| **A. Personal tool** | Anything, for your own account and immediate family | No product, no users, no revenue. Section 70's family-only constraint on self-developed algos applies. |
| **B. Analytics tool** | Data, scanners, portfolio analytics, execution convenience. **No recommendations, no signals, no performance claims.** | The competitor's position. Lowest friction. Sections 21, 23, 59–62 are largely out of scope. |
| **C. Registered research/advisory** | Signals, recommendations, verified performance | Requires registration, PaRRVA enrolment, compliance function, ongoing obligations |
| **D. Algo provider** | Automated strategy execution for other users | Exchange empanelment, broker partnership, black-box disclosure rules, RA registration where logic is undisclosed |

These are not points on a spectrum you can slide along later. **B and C are different products with different data models, different UI copy, different obligations and different economics.** Choosing between them after the codebase exists means rewriting the parts of it that matter most.

Record the decision, with date and reasoning, as configuration in the Compliance Policy Service (Section 70). Every feature gate in this specification reads from it.

### 94.3 WHERE DIFFERENTIATION ACTUALLY IS

Given that scanners, chat and broker connectivity are commoditised, this specification's genuine differentiators are the parts that are *hard and unglamorous*:

1. **Portfolio-aware analysis** (Sections 19, 23, 46) — answering "given what I already own" rather than "what looks bullish". Competitors screen; almost none reason against holdings.
2. **Evidence discipline** (Sections 57–60) — being the platform that shows confidence intervals and refuses to display an unqualified win rate, in a market full of unverifiable accuracy claims.
3. **Abstention** (Section 79) — saying no trade, credibly and often.
4. **Behavioural coaching** (Section 80) — the only feature here aligned with the user's long-run outcome rather than their short-run engagement.

Each of these is a reason to trust the product. None of them demos well. Build them anyway — they are what a screener cannot copy in a sprint.

---

---

# 95. RUNTIME & EXECUTION TOPOLOGY

Sections 85 and 93.6 cover AI reliability and latency budgets. Neither specifies *what runs where, how often, and on what trigger*. Without this, the natural implementation calls a model far too often, at far too much cost, in the wrong places.

### 95.1 THE ARCHITECTURE IS EVENT-DRIVEN

Polling loops that re-evaluate everything on a timer do not scale and cannot meet a latency budget. Every evaluation is triggered by a declared event: tick, bar close, order update, position change, funds change, news arrival, corporate action, schedule, or user action. Handlers are idempotent and replayable — the same event delivered twice produces one effect.

### 95.2 COMPUTE TIERS

| Tier | Trigger | Latency | Runs | Model calls |
|---|---|---|---|---|
| **Hot path** | Every tick | Sub-second | Price triggers, stop/target monitors, risk limit checks, margin monitors, kill-switch conditions, signal expiry | **None. Ever.** |
| **Warm path** | Bar close, order/position update | Seconds | Deterministic strategy rule evaluation, signal generation, indicator computation, portfolio revaluation | **None** |
| **Cold path** | Qualifying event or user request | Seconds to tens of seconds | Explanation, proposal drafting, critic, chat, thesis narrative | Yes, budgeted |
| **Batch** | Scheduled, off-hours | Minutes to hours | Backtests, walk-forward runs, strategy health recalculation, journal analysis, calibration scoring | Yes, bulk |

### 95.3 HARD RULES

* **No model invocation on the hot or warm path.** Signal *generation* is deterministic strategy-rule evaluation (Section 56); the model contributes explanation and proposal drafting afterwards, on the cold path. A strategy whose entry condition requires a model call is not a strategy under Section 56 — its rules are not machine-evaluable.
* **Model calls are event-gated, never scheduled per instrument.** A model is invoked when a deterministic qualifying event has already occurred, not to discover whether one has.
* **A cold-path failure or timeout never blocks the warm or hot path.** A signal still fires, a stop still triggers, a limit still halts, with the narrative missing and marked as such (Section 85).
* **Precompute and cache aggressively.** Explanations for a given signal, strategy and portfolio state are cached against a state hash. Identical state does not re-invoke a model.
* **Model cost is budgeted** per user, per tenant, per day, with non-essential features degrading first (Section 85). Track cost per signal, per approval and per active user as a first-class operational metric — an AI feature whose unit economics are unknown is unshippable.

### 95.4 WORKLOAD PROFILE

Indian market hours produce a sharply peaked load: open and close spikes, expiry-day volume, event-day surges. Size the hot and warm paths for peak, not average. Batch work runs off-hours. Declare and monitor separate capacity for market hours versus off-hours, and degrade cold-path depth before touching warm-path throughput.

### 95.5 BACKPRESSURE & ORDERING

Queues, not unbounded fan-out. Declared backpressure behaviour per tier — the hot path sheds nothing and must be provisioned for it; the cold path sheds work and says so. Per-instrument and per-user event ordering must be preserved; out-of-order position updates produce incorrect exposure, and incorrect exposure produces incorrect orders.

---

# 96. NON-FUNCTIONAL REQUIREMENTS

Everything above specifies what the platform does. This section specifies how well it must do it. An architecture that satisfies Sections 1–95 and fails this one is not shippable.

### 96.1 SERVICE LEVEL OBJECTIVES

Declare a target and an alert threshold for each. Publish the measured distribution, not the target — p50, p95 and p99, never the mean.

| Objective | Measured as |
|---|---|
| Quote freshness | Exchange timestamp to display |
| Order acknowledgement | Submit to broker ACK |
| Approval re-validation | Approve tap to validation complete |
| Portfolio sync | Broker change to canonical state updated |
| Reconciliation interval | Time between full reconciliation cycles |
| Signal generation | Qualifying event to signal available |
| Alert delivery | Signal available to delivered on channel, per channel |
| AI response | Request to first token, and to complete response |
| UI interaction | Interaction to rendered result |

**SLOs are tiered by criticality.** Execution-path and risk-path objectives are hard; analytics and AI objectives are soft and degrade first (Section 95.4). A missed hot-path SLO is an incident.

### 96.2 AVAILABILITY, RECOVERY & DEGRADATION

State targets separately for the execution path and everything else — losing analytics for an hour is an inconvenience, losing order state is not.

Per subsystem, declare the **degradation contract**: what fails, what the user sees, what still works, and what is explicitly disabled.

| Failure | Required behaviour |
|---|---|
| Market data feed down | Halt signal generation, freeze quote display with visible staleness marker, block new orders on stale prices (Section 69) |
| Options chain delayed | Suspend options analytics and options signals; equity path unaffected |
| Broker API down | Section 39 + Section 68 disconnect policy; preserve order state; never duplicate |
| Broker token expired | Alert before expiry; suspend automation; read-only until reauthenticated |
| Reconciliation failing | Halt automation; block new orders; surface mismatch (Section 13) |
| AI layer down | Degraded mode banner; all deterministic functions including risk, stops and execution continue (Section 85) |
| News/fundamentals down | Analytics degrade with provenance marked unavailable; signals depending on those inputs are suppressed, not generated without them |
| Database primary loss | Documented RPO/RTO; on recovery, reconcile against broker before displaying or acting (Section 93.8) |

**Never degrade silently.** Every degraded state is visible to the user and logged.

### 96.3 SECURITY ARCHITECTURE

Section 28 states that the AI layer must not hold credentials. This section states how credentials are actually held.

**Secret management**
* Broker API keys, secrets, access tokens, refresh tokens and TOTP seeds live in a managed secrets store or KMS/HSM — never in application config, environment variables, source control, or a database column.
* Envelope encryption with per-tenant or per-user data keys; master keys in the KMS, never in application memory beyond use.
* Defined rotation policy and cadence for every credential class, plus tested emergency rotation for compromise.
* Secrets are never written to logs, traces, error messages, crash dumps, analytics events or support tooling. Enforce with automated redaction at the logging layer, plus a scanner in CI — not by code review.
* **Secrets never enter model context.** This is a hard boundary enforced at the context-assembly layer (Section 67), verified by the eval suite (Section 86).

**Encryption and transport**
* Encryption at rest for all stores holding user, portfolio, order or credential data. Encryption in transit everywhere, including service-to-service.
* Certificate pinning where the client talks to the execution path. Broker API calls originate only from the fixed-egress execution service (Section 93.7).

**Access control**
* Least privilege per service. The AI service's credentials cannot reach broker APIs, the secrets store, or the consent ledger — enforced by IAM policy, not application logic.
* Human access to production user data is role-gated, time-bound, justified and logged. Privileged access review on a defined cadence.
* Step-up authentication for account-level changes: broker connection, authorization grants (Section 66), risk limit changes, automation enablement.
* Session management: defined lifetime, revocation on credential change, device registration and visible active-session list with remote revoke.

**Application security**
* Input validation on every external boundary, including broker responses — a broker API is an untrusted input surface, not a trusted one.
* Rate limiting and abuse controls on authentication, approval and order endpoints.
* Dependency scanning, SAST, secret scanning in CI. Penetration testing before live execution, and on a recurring basis thereafter (see also the VAPT expectations noted in Section 70).
* Threat model maintained for: credential theft, session hijack, approval forgery, replay of an approval, prompt injection into the AI path (Section 67), insider access, and broker-side compromise.

**Data protection**
* Classify every field: credentials, financial, PII, behavioural, derived. Apply retention, access and export rules per class.
* Retention and deletion policy per class, reconciled against the immutable audit and consent ledgers — deletion requests must be satisfiable without destroying required audit records. Resolve this tension explicitly in the schema design rather than discovering it later.

### 96.4 OBSERVABILITY

* **Metrics** — SLO metrics from 96.1, plus per-broker API health and latency, order success and rejection rates by reason, reconciliation mismatch counts, signal volume and abstention rate (Section 79), approval outcomes, model cost per signal and per active user (Section 95.3), data quality scores (Section 93.5), strategy health states (Section 63).
* **Structured logging** with automated redaction. Every log line carries correlation IDs linking to the lineage chain in Section 71.
* **Distributed tracing** across the full path: event → strategy evaluation → signal → approval → re-validation → execution → broker → reconciliation.
* **Alerting** on SLO burn, error rates, reconciliation mismatches, security events, cost anomalies and data quality degradation — routed by severity, with defined ownership.
* **Business-level dashboards** distinct from system dashboards: decision quality, calibration error, abstention rate, live-versus-backtest divergence. These are the metrics that reveal whether the product is working, as opposed to merely running.

### 96.5 SCALABILITY

Declare target and design ceiling for: concurrent users, connected broker accounts, instruments under live subscription, watchlist entries, active signals, alerts per minute at peak, approval requests in flight, backtest jobs concurrent, and events per second at market open. Size the hot and warm paths for peak, not average (Section 95.4).

### 96.6 PROVIDER ABSTRACTION SYMMETRY

Section 4 gives brokers a formal adapter interface. Every other external dependency gets the same treatment, for the same reason — vendors change, licences lapse, and none of them should be able to reach into the core.

`MarketDataProvider` · `HistoricalDataProvider` · `OptionsDataProvider` · `NewsProvider` · `FundamentalsProvider` · `CorporateActionsProvider` · `EconomicCalendarProvider` · `AIModelProvider` · `NotificationChannelProvider`

Each declares a capability map, version, `last_verified_date`, licence terms and permitted use (Section 93.2), rate limits, failure behaviour, and a fallback. **No provider-specific structure may leak past its adapter** — the same rule as Section 4.

---

# IMPLEMENTATION INSTRUCTION

1. **Build the strategy registry, backtest engine and validation protocol before any signal-generation feature.** A signal without certification infrastructure is a liability.
2. **Build the Performance Evidence Bundle as a single shared component.** Every surface renders performance through it. No surface may format a win rate independently.
3. **Build the Section 67 tier boundary as a hard service boundary**, enforced by architecture and credential scope — not by prompt engineering, not by a system-message instruction, not by a code comment.
4. **Build re-validation-at-approval-time from day one.** Retrofitting it later means shipping a period during which stale approvals execute real orders.
5. **Implement the Compliance Policy Service as a runtime gate** on both execution and performance display, with all regulatory thresholds as dated, sourced configuration.
6. **For every regulatory claim in Section 70, fetch and read the current primary source before implementing.** If a requirement cannot be verified, mark the dependent feature `BLOCKED — REGULATORY VERIFICATION REQUIRED` and do not ship it.
7. **Default every user, every strategy and every account to the most restrictive setting.** Capability is unlocked by evidence and explicit consent, never granted by default.
8. **Build the numeric grounding validator before the first AI feature ships.** It is far harder to retrofit than to design in, and it is the constraint that prevents the most expensive class of failure.
9. **Build the eval suite alongside the first AI action, not after.** An AI feature without regression tests ships untested code on every model, prompt or context change.
10. **Resolve data sourcing before building the backtest engine.** What historical options data you can actually license sets the ceiling on what Section 58 can validate. Confirm availability, depth, quality and cost first (Section 93.2).
11. **Decide the product's regulatory identity before Phase 1** (Section 94.2). Analytics tool, registered research/advisory and algo provider are different products, not stages of one.
12. **Design the execution service around fixed egress from day one** (Section 93.7). Static IP requirements are not a deployment detail.
13. **Produce the Data Source Matrix (Section 93.2) and the filled Broker Capability Matrix (Section 5) as standalone deliverables before any implementation.** Both are researched from current official documentation, never from memory.
14. **Treat Section 96 as a gate, not a garnish.** Secret management, encryption, access control and observability are designed in Phase 1, not added before launch. A platform holding broker credentials has no acceptable path that defers this.
15. **Do not invent APIs.** For every broker, follow the fifteen-step verification sequence in Section 52. If a capability cannot be verified, mark it unavailable rather than faking it.

---

# APPENDIX — BROKER VERIFICATION STARTING POINTS

These are starting points for verification only. Every capability must still be confirmed against current documentation, with a `last_verified_date` recorded per Section 40.

| Broker | Known API surface to verify | Notes |
|---|---|---|
| Angel One | SmartAPI — orders, holdings, positions, WebSocket, postbacks | Verify token lifecycle and TOTP requirements |
| Zerodha | Kite Connect — orders, holdings, positions, historical | Kite documents that a successful order API call does **not** mean the order executed — this is precisely why Sections 11, 12 and 13 exist |
| Dhan | Orders, positions, holdings, trading controls | Verify multi-leg and slicing support |
| Upstox | Order placement, portfolio and position APIs | Verify option chain and historical data scope |
| m.Stock | Published API covering execution and portfolio | Verify access requirements and pricing |
| Paytm Money | Published API covering execution and portfolio | Verify current availability |
| PL Capital | Advertises trading APIs and a trade-execution engine | Verify developer access path |
| INDmoney / INDstocks | Order placement, modification, cancellation; GTT smart orders with multi-leg and OCO; holdings, positions, P&L, margin; WebSocket for prices and order updates; option chain with Greeks | API documented at api-docs.indstocks.com. Verify token lifetime, static IP requirements, and whether terms permit third-party multi-user integration |

Do not treat this table as authoritative. Populate the Section 5 capability matrix from live documentation.
