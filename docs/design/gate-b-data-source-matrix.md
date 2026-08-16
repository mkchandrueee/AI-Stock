# Gate B — Data Source Matrix

Status: **research, not a purchase decision.** Spec §93.2 names this matrix as a
required standalone deliverable, populated from live documentation, never from
memory — so it uses the spec's own column format rather than a simplified one.
No subscription purchased, no vendor contacted for pricing beyond what's publicly
listed. This is deliberately *not* comprehensive across every spec §93.2 row —
only the rows relevant to what the current working blueprint
(`ai-analytics-options-intraday-delivery.md`) would actually need, since filling
in rows for data this product doesn't plan to use would be research spent on the
wrong problem.

## The matrix

| Data type | Provider | Real-time | Delayed | Historical depth | API | Rate limit | Cost model | Licence | Redistribution permitted | Commercial use permitted | Known gaps | Fallback provider | Last verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NSE/BSE equity historical (daily) | TrueData, GDFL (both NSE/BSE/MCX-authorized) | Yes | — | Not confirmed | REST API, confirmed to exist | Not confirmed | Tiered, ₹1,440–₹2,796/mo observed for live-data tiers (not the historical-depth tier this needs) | **Internal use only, confirmed directly** — redistribution requires separate licensing | **No**, standard tier | Unclear — internal-use language doesn't clarify commercial-but-non-redistributed use | Redistribution-tier pricing not public | Neither vendor's redistribution terms differ meaningfully from the other, per this pass | 2026-08-16 |
| Options chain, live | TrueData, GDFL | Yes, confirmed offered | — | n/a | Confirmed offered | Not confirmed | Same tiers as above | Same restriction as above | No, standard tier | Unclear, same as above | Same | Same | 2026-08-16 |
| Options chain, historical | TrueData, GDFL (claimed); AlgoTest (7.5+ years, but for their own consumer product, not confirmed as a licensable feed) | — | — | TrueData/GDFL: not confirmed. AlgoTest: 7.5+ years claimed for their own product | Not confirmed for TrueData/GDFL at this depth | Not confirmed | Not confirmed | Not confirmed at this specific depth | Not confirmed | Not confirmed | **This is the gap the master spec itself calls "the hard one" — nothing in this pass closes it** | None identified | 2026-08-16 |
| Options Greeks / IV | TrueData, GDFL | Confirmed offered | — | Tied to options chain depth above | Confirmed offered | Not confirmed | Same tiers | Same restriction | No, standard tier | Unclear | Same as options chain | Same | 2026-08-16 |
| Corporate actions | Not researched this pass | — | — | — | — | — | — | — | — | — | Genuinely open | — | — |
| News | Not researched this pass | — | — | — | — | — | — | — | — | — | Genuinely open | — | — |
| Tick data | TrueData (add-on) | — | — | 5/10/20-day windows only, ₹299–999/mo | Confirmed offered at this narrow depth | Not confirmed | ₹299–999/mo for the short windows observed | Same internal-use restriction presumed, not separately confirmed for this specific add-on | Not confirmed | Not confirmed | Retail tier's historical tick depth is far short of what backtesting would need, even setting licensing aside | GDFL, untested | 2026-08-16 |

**What "not confirmed" means here, precisely**: not found in this research pass —
not asserted to be unavailable, not assumed to be available. The honest state is
"unknown," and that's recorded as such rather than guessed in either direction.

## Cross-cutting licensing dimensions — apply across every row above, not data-type-specific

These are the two considerations flagged as critical, and they cut across the
whole matrix rather than belonging to one data type:

- **Multi-user redistribution.** Confirmed, directly, for TrueData and GDFL:
  standard licenses are individual/institutional internal-use only.
  Redistribution — building a dataset that serves *other* users' analysis, which
  is what any shared/cross-user feature would need — requires a separate,
  unpriced license. This is the single most load-bearing licensing fact in this
  whole matrix: it applies to every row, and no row's "commercial use permitted"
  column can be answered "yes" until this is resolved with an actual vendor
  quote, not inferred from published retail pricing.
- **AI/ML training rights.** **Not addressed by any source found in this or the
  original Gate B research pass.** Standard market-data licenses are typically
  silent on, or implicitly restrictive of, using licensed data to train or
  fine-tune models — this is a distinct question from redistribution and needs
  its own explicit line in any vendor conversation. Given the current working
  blueprint's AI layer only *describes* numbers a deterministic engine computes
  (spec §75's numeric-grounding rule, already built into the architecture), the
  product as currently scoped may not need any model-training rights over this
  data at all — worth confirming that's still true before this becomes a live
  question, rather than assuming it away.

## What this does and doesn't tell you

Confirms the shape of the problem — real vendors exist for the data types this
product would need, the restriction is real and consistent across the vendors
checked, and the historical-options-depth gap the spec itself named hasn't
closed. Doesn't get you a number to budget against — that requires an actual
vendor conversation, the same category of next step as the Gate A and Gate C
briefs, not something this document can produce from public information alone.
Not resolving Gate B; narrowing what resolving it would actually require.
