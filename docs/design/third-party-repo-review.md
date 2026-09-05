# Review: NSE-Neuron and AI-trader — what's reusable

Two third-party repositories supplied by the owner (2026-08-29) for possible reuse.
Both reviewed from source, not from their READMEs alone. Both are **MIT licensed**,
so porting is permitted provided the copyright notice travels with anything taken.

**Neither can be dropped in.** Both are Python; this project is TypeScript/Node. Reuse
means porting *algorithms*, and attributing them — not importing packages.

---

## 1. NSE-Neuron

`pythonwadi` / NayakwadiS · MIT · Python 3.10+, TensorFlow, FastAPI + React
76 files (31 Python, 14 TSX).

**What it is.** Deep-learning price forecasting for NSE equities. Four models (LSTM,
BiLSTM, GRU, CNN-LSTM), each with a paired signal classifier, forecasting the next
five trading days' High/Low/Close and emitting BUY/HOLD/SELL. Adds regime detection
(BULL/BEAR/SIDEWAYS) that boosts or penalises a signal depending on agreement, plus
TA-Lib candlestick pattern detection. Ranks its four models by RMSE.

**The genuinely valuable find — its data source.** It uses `nselib`, which reads NSE's
own public endpoints rather than a paid vendor. Two calls observed in the code:

- `capital_market.equity_list()` — the listed universe
- `capital_market.price_volume_and_deliverable_position_data(...)` — **price, volume
  AND delivery position data**

That second one matters: **delivery percentage** is a field the reference product
(TradeNethram) displays and one this project currently has no source for — Angel One's
API does not provide it. This is worth evaluating on its own merits, independent of
anything else in the repo.

Caveat before treating that as free data: NSE's public endpoints are aggressively
rate-limited and their terms of use for commercial redistribution are exactly the
Gate B question, unresolved. "Free to call" is not "licensed to build a product on."

**What is reusable**

| Piece | Value |
|---|---|
| `nselib` as a data source, esp. delivery data | High — fills a gap Angel One can't |
| Regime classification (BULL/BEAR/SIDEWAYS) | Moderate — would slot in as a scoring factor |
| Candlestick pattern detection (TA-Lib) | Moderate — another scoring factor |

**What should not be ported, and why it's worth naming.** The core of this repo is
*price prediction* — forecasting future High/Low/Close and issuing BUY/SELL from it.
That is a materially stronger claim than the ranking this project now does. The
owner's 2026-08-29 override covers scoring, ranking and verdicts over *current*
observable state; it does not extend to forecasting future prices, which is a
different kind of assertion and carries its own exposure. Porting the models would
quietly widen that override rather than execute it. Flagged, not decided here.

Also impractical regardless: TensorFlow model training doesn't belong in this Node
service, and no out-of-sample validation of forecast accuracy is visible in the repo.

---

## 2. AI-trader

`Aaryan Sinha` · MIT · Python 3.13, Next.js 16, TimescaleDB
160 files (89 Python, 20 TSX). Substantially the larger and more mature system.

**What it is.** An NSE F&O intraday options research and execution platform for NIFTY:
tick-level replay backtest engine, 80 macro + 5 micro features per bar, XGBoost models
plus a Q-learning RL exit agent, three rule-based strategies filtered by ML
probability, Kelly-criterion sizing with dynamic stops, paper trading, a Zerodha
adapter for live execution, and a Next.js dashboard. Its own README carries an
extensive risk disclaimer and notes SEBI/NSE algo-trading compliance is the user's
responsibility.

**The highest-value reuse in either repo: `features/option_chain_features.py` (361
lines).** It computes a direct superset of the option-chain work landed today:

| Measure | We have it | AI-trader |
|---|---|---|
| PCR (whole chain) | Yes | Yes |
| PCR near ATM (±3 strikes) | No | Yes |
| PCR far OTM | No | Yes |
| Max pain | Yes | Yes |
| OI skew / concentration | No | Yes |
| Call & put OI gradients | No | Yes |
| **Implied volatility** (Black-Scholes inversion from premium) | No | Yes |
| IV skew (put IV − call IV) | No | Yes |
| Theta pressure, days-to-expiry | No | Yes |

IV is the standout. This project has no implied volatility at all, and
`estimate_iv_from_premium` is pure mathematics with no data dependency — it inverts
Black-Scholes numerically against the observed premium. It ports cleanly to
TypeScript, needs nothing we don't already fetch, and is the single most valuable
item across both repos.

Splitting PCR into near-ATM and far-OTM is also a real improvement over one blended
ratio: a single chain-wide PCR mixes genuine positioning near the money with
lottery-ticket far strikes.

**Also worth studying**

| Piece | Note |
|---|---|
| `features/indicators.py` (329 lines) | Macro indicator set, wider than our five factors |
| `strategy/trade_scorer.py` | `score_signal` / `rank_trades` — same shape as our `scoring.ts`; worth comparing designs |
| `strategy/vol_surface.py`, `regime_detector.py` | Volatility surface and regime work |
| `features/option_chain_builder.py` | Chain assembly, comparable to ours |

**What does not transfer**

- **TrueData WebSocket dependency.** Its entire live and historical data layer sits on
  TrueData — the paid vendor already researched in `gate-b-data-source-matrix.md`,
  whose standard licence is internal-use-only. Their data layer is unusable here
  without resolving exactly the licensing question Gate B holds open.
- **Zerodha execution / order management.** This project has no execution path by
  design, and order placement is out of scope for reasons independent of the override.
- **Backtest engine, RL exit agent, Kelly sizing.** These exist to size, enter and exit
  positions. Backtesting and performance claims remain on the permanent-OUT list; the
  override covered ranking, not track records.

---

## Recommendation

1. **Port `estimate_iv_from_premium` and the PCR/OI-skew variants** into
   `option-chain-service.ts`. Highest value, no new data dependency, MIT attribution
   retained. Pure functions, so they get real tests like the rest of `analytics/`.
2. **Evaluate `nselib` separately** as a delivery-data source. It plausibly closes a
   gap Angel One cannot, but treat NSE's terms of use as a Gate B question rather than
   assuming public means licensed.
3. **Compare `trade_scorer.py` against our `scoring.ts`** before extending our factor
   set — someone else solved the same ranking problem and the differences are
   informative.
4. **Do not port the forecasting models or the execution/backtest layers.** Both go
   beyond what the current override authorises, and doing so silently would widen a
   decision the owner made deliberately and narrowly.

Neither repo addresses the **fundamentals gap** (PE, PB, ROCE, quarterly financials,
shareholding) that the AI Growth Research module in the reference product needs. That
remains open.
