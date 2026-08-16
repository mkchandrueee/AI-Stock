# Gate A — path to actual resolution

Status: **research to make the next step concrete, not a resolution itself.**
Mirrors `gate-c-broker-outreach.md`'s purpose — Gate A needs qualified review, not
more of this project's own analysis, so the useful thing to prepare is what that
review actually requires: who to engage, roughly what it costs, what to ask them.

## The key distinction this research surfaced: two very different asks

**Full SEBI Research Analyst (RA) registration** — the heavy path, only relevant
if the answer ends up being Option C, not Option B:
- ₹10,000 application fee + registration fee of ₹15,000+GST (individual/partnership)
  or ₹5,50,000+GST (private limited company/LLP)
- NISM Series XV certification required before applying at all
- Postgraduate qualification or professional certification (CFA/CA/MBA-Finance) +
  5 years relevant experience
- RAASB deposit requirements scaled to client capacity, office/IT infrastructure,
  a principal analyst, annual compliance reporting
- **60–90 day timeline** from document submission

**A scoped compliance/legal opinion on classification** — the actually relevant
ask right now, since the working position is Option B (analytics tool), and what's
needed is confirmation *that* position holds, not registration for a position
that's been deliberately not chosen:
- Asks a SEBI-focused securities lawyer or compliance consultancy to review the
  *specific feature set* (T0 read + T1 analyze, per
  `docs/design/ai-analytics-options-intraday-delivery.md` — no recommendations,
  no signals, no performance claims) and confirm or reject whether it stays on the
  analytics-tool side of the RA/IA boundary.
- **No pricing found for this narrower service** — opinion-letter engagements are
  typically quoted per-engagement, not publicly listed, unlike the RA registration
  fees above which are SEBI's own published numbers. Worth getting quotes from more
  than one provider rather than assuming a number.
- Almost certainly faster and cheaper than full registration, but that's inference
  from the shape of the ask, not a confirmed figure — don't treat it as one.

## Who does this kind of work

Multiple established Indian firms offer SEBI RA-registration assistance and
securities-compliance advisory as a real, standing service category — Enterslice,
Lawrbit, Finlaw, and others surfaced consistently across this research. **Not a
recommendation of any specific one** — no way to evaluate quality, track record, or
fit for this specific classification question from search results alone. Worth
your own due diligence (referrals, reviews of actual regulatory outcomes they've
delivered, direct conversations) before engaging anyone. A capital-markets lawyer
at a general securities law firm is the other route, likely more expensive per
hour but potentially more authoritative for a genuine legal opinion letter as
opposed to a registration-filing service.

## What to actually ask, if you engage someone

The concrete version of Gate A's question, informed by everything already
researched in this project:

> Under current SEBI regulations, does a platform that (a) aggregates a user's own
> connected brokerage holdings/positions/orders/funds, (b) computes and displays
> derived analytics — technical indicators, options Greeks/IV/OI metrics, portfolio
> composition and risk scores — and (c) explains those analytics in natural
> language, but **never issues a buy/sell recommendation, never proposes a specific
> trade, and never displays performance/return claims** — require Research Analyst
> or Investment Adviser registration, or does it remain outside that regulatory
> perimeter, comparable to an unregistered technical-screener product?

This is deliberately narrow and specific — it's the actual product as scoped, not
a hypothetical about AI trading platforms in general. A vague question gets a
vague, less useful answer.

## One thing worth knowing before engaging anyone

SEBI's own functional-test framing, found in this pass: *"if an analytics tool
provides personalized recommendations based on individual circumstances, it may be
classified as advisory."* This is consistent with — not new information beyond —
what `docs/design/ai-analytics-options-intraday-delivery.md` already drew the line
on (portfolio-aware personalization is the risk factor, not analytics per se). It
doesn't resolve Gate A, but it means whoever's engaged should specifically weigh in
on the portfolio-aware pieces (health scores, allocation-gap display) as the parts
most likely to draw scrutiny — not the generic screener/technical-analysis pieces,
which the IntradayScreener precedent already suggests are lower-risk.
