# Alignment check — post-regulatory-decision

**Terminology correction, added same day:** this doc calls Gate A "decided." Later
the same day, the owner corrected that — it's a working position informed by this
project's own research, not a decision validated by qualified legal/compliance
review. Gate A is formally open, same as B and C (see `CLAUDE.md`'s Gate A
section). Everything else below still holds; only the "decided" framing was wrong.

Status: verification only, no code or architecture changed. Checked against the
re-attached master spec (confirmed byte-identical to `docs/MASTER-SPEC.md` — `diff`
returned zero differences, so this isn't checking against a stale copy) and the
current, post-decision `CLAUDE.md`. Phase 1 excluded from re-evaluation per
instruction — treated as frozen, not re-litigated.

## Phase 1 — confirmed still valid under the Option B decision, by design

This isn't luck. `CLAUDE.md` said from the start of the project: *"Phase 1 as
scoped above is valid under every outcome of all three [gates]."* Checked directly:
Phase 1 (read-only aggregation, no AI, no signals, no recommendations, no
performance display) sits entirely inside what Option B — analytics tool — permits
(*"data, scanners, portfolio analytics, execution convenience... no
recommendations, no signals, no performance claims"*). The gate resolving to B
rather than C or A doesn't require touching anything already built. The original
design intent — build something valid regardless of how the gates landed — worked
as intended.

## Full doc audit — 17 files in `docs/design/`, checked for anything describing or
## assuming the now-foreclosed signal/recommendation architecture

Searched for `signal|recommendation|win rate|strategy certif|backtest|T2|T3` across
every design doc, then read the actual context of every match. Result: **every
match outside the blueprint is incidental** — "signalled by HTTP 403," "a
corroborating signal," `portfolio-views.md`'s match is literally quoting
`CLAUDE.md`'s own OUT-of-scope line back for context, `auth-session-architecture.md`
using "recommendation" in the generic "here are options, not a recommendation"
sense. None of the sixteen non-blueprint docs plan, describe, or assume any part of
the foreclosed architecture.

**The one real misalignment, already known**: `ai-options-intraday-delivery-blueprint.md`
still lays out the fuller signal-generation architecture from spec Parts B/C —
strategy certification (§56–59), the Signal object (§61), the AI action tiers up to
T2/PROPOSE and T3/STAGE (§67, §74) — none of which remains buildable under Option
B. `CLAUDE.md` already flags this doc as needing revisiting rather than treated as
current, from the commit that recorded the regulatory decision. Not fixed yet —
still an open question, restated at the end of this doc.

## One thing worth flagging, not a misalignment — a conservative choice that's
## stricter than the decision strictly requires

`portfolio-views.md` documents an explicit decision to show **no P&L at all**,
anywhere, including plain broker-reported per-holding profit/loss — stricter than
what Option B's "no performance claims" language is actually aimed at. SEBI's
performance-verification apparatus (PaRRVA, the win-rate rule in spec §60) governs
claims an adviser/analyst makes *about their own strategies or recommendations* —
"our strategy returned 25%." A portfolio tool showing a user their own account's
current profit/loss on a holding they already own is closer to what any brokerage
app already displays natively, not a regulated performance claim. This isn't a
misalignment — the existing choice is safe and was made deliberately, for good
reason (`CLAUDE.md`'s own stop-and-ask instruction was followed exactly, and the
strictest of three offered options was chosen on purpose). Just noting it as a
possible *future* loosening, not something to revisit now — Phase 1 is frozen, and
this isn't a compliance problem, only a more conservative reading than the decision
technically forces.

## Open question, restated

`ai-options-intraday-delivery-blueprint.md` still needs a decision: revise it to
reflect the T0/T1-only, analytics-tool scope actually available, or mark it
explicitly as a superseded historical record of pre-decision thinking (kept for
context, not treated as a live design). Not decided by this document.
