# Portfolio views (spec §15, §16, §17)

Status: implemented, verified against the real database.

Files: [`src/portfolio/portfolio-service.ts`](../../src/portfolio/portfolio-service.ts).
Endpoints: `GET /portfolio` (unified), `GET /accounts/:accountId/portfolio` (per-account).

## Scope decision, made explicitly rather than inferred

Spec §15 asks for P&L, CAGR, XIRR, max drawdown, portfolio beta, and volatility.
`CLAUDE.md`'s Phase 1 OUT-of-scope list says: **"Performance display. No win rates, no
returns, no statistics shown to a user."** Its own instruction for this exact situation
— "if a task seems to require something on this list, stop and ask" — was followed
rather than resolved by picking a reading. Confirmed: the strictest option. No P&L
anywhere in this view, not even what the broker itself already reports.
`holding.unrealized_pnl` exists in storage (needed for reconciliation) and is never
surfaced by either endpoint here.

`totalCurrentValue` and `totalInvestedValue` are included despite that boundary — they
aggregate raw stored fields (quantity × price) and don't say whether the user is up or
down, only what's held and what was paid. Sector/asset/broker/options exposure
percentages from spec §15 are also NOT included in this pass, kept out deliberately
given the strictest option was chosen — raw holdings and values, not the fuller
composition-breakdown feature set. A reasonable follow-up, not assumed into this pass.

## Duplicate holding aggregation (spec §17)

`aggregateHoldings()` groups by `instrument_id` across every connected account, summing
quantity and value into one line while preserving a per-account breakdown — matching
the spec's own example shape (`RELIANCE: Zerodha 100, Dhan 50 → TOTAL 150`, adapted to
this test's numbers). Verified: an instrument held in two test accounts (100 + 50
shares) aggregated to `totalQuantity: 150` with both accounts' individual quantities
intact in `byAccount`, and `holdingCount` correctly counted it once, not twice.

## Verified

Seeded two accounts with an overlapping holding (one instrument in both, one unique to
each) against the real database, confirmed:
- Unified view aggregates the shared instrument correctly (150 total, both accounts'
  contributions visible and correct).
- Every total is arithmetically correct: `totalCurrentValue` (406000 = 245000 + 122500
  + 38500), `totalInvestedValue` (399000 = 240000 + 121000 + 38000), `totalCash`
  (80000 = 50000 + 30000), `totalMargin` (5000 = 0 + 5000).
- Per-account view correctly isolates that account's own holdings only (100 shares of
  the shared instrument, not the aggregated 150) — confirms the two endpoints don't
  share aggregation logic incorrectly.
- No P&L field appears anywhere in either response.

## Not built

- Sector/asset/broker/options exposure breakdowns (spec §15) — explicitly deferred,
  see scope decision above.
- Any time-based framing ("today" vs. "overall") — this is a point-in-time snapshot of
  currently stored state, not a historical view.
