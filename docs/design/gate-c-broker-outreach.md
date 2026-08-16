# Gate C — Angel One outreach brief

Status: **preparation only.** Gate C (broker commercial terms) requires Angel One's
own partnership/API team, not documentation research — this project has said so
since the very first verification pass and it hasn't changed. This document doesn't
resolve Gate C. It's the briefing, question set, and destination to make that
outreach fast and precise when you're ready to send it, so the actual conversation
with Angel One doesn't have to start from scratch or rediscover context this
project already has.

## Where to send it

**`smartapi@angelone.in`** — found directly on Angel One's own official SmartAPI
FAQ page (`smartapi.angelbroking.com/faq`, "Contact Us" line), not a third-party
guess or a forum post. This is the general SmartAPI contact channel, not
necessarily a dedicated business-development inbox — no separate, publicly listed
"API partnerships" email was found in this pass (Angel One's "Become a Partner"
program that does turn up in search results is their client-referral/sub-broker
program, an unrelated thing — worth not confusing the two). If this specific
question needs escalation beyond general support, that's for Angel One to route
internally once the inquiry is in; there's no evidence a more specific channel
exists to route around that with.

## Why this is worth having ready now, specifically

The working regulatory position is Option B, analytics tool — informed by research,
not yet validated by qualified legal/compliance review (see `CLAUDE.md`'s Gate A
section) — and the AI blueprint is narrowed to match (T0/T1 — read and explain, no
recommendations). That changes
*what* to ask Angel One relative to what spec §1 originally posed the question as —
the original two-question framework assumed order execution was in view. It isn't,
for the foreseeable scope. The questions below reflect the product as it's actually
decided to be, not the fuller Parts B/C version.

## Context to give them upfront

- An existing Trading API app and account are already registered and technically
  verified — this isn't a cold outreach about capability, it's specifically about
  commercial/usage terms for a different pattern of use than a single trader's own
  account.
- The product is read-only portfolio aggregation plus explanatory analytics
  (holdings, positions, funds, order/trade history, options chain metrics,
  technical screening) for **multiple separate users, each connecting their own
  Angel One account** — not one account used by one person.
- **No order placement is in scope.** Nothing in the current design ever calls
  place/modify/cancel order endpoints. Worth stating plainly, since it removes an
  entire category of due-diligence concern from their side.
- No AI-generated trade recommendations, signals, or performance claims — the
  product doesn't advise, it explains. Relevant to how they'll want to classify the
  integration on their end.

## The actual questions

1. **Do SmartAPI's current terms permit a third-party platform to connect and read
   data from multiple different users' Angel One accounts** — each user
   authenticating with their own credentials, none of it going through one shared
   account — **for a read-only analytics product, with no order placement at all?**
   This is the load-bearing question. Everything else is detail once this is
   answered.
2. **Is there a distinct app category, agreement, or partnership tier for
   multi-user third-party access**, separate from the single-trader personal-use
   registration already in place? If so, what does registering under it actually
   require (business entity verification, a formal partnership agreement, revenue
   share, something else)?
3. **Given no order placement is planned**, does SEBI's algo-provider framework
   (exchange empanelment, broker due diligence) apply to this integration at all
   from Angel One's side, or is that specifically an execution-path concern that a
   read-only integration doesn't trigger? Worth asking directly rather than
   assuming — this project's own research found the framework is scoped around
   *order flow*, but Angel One's own compliance team is the authority on how they
   apply it to a connecting app.
4. **Rate limits and commercial terms at multi-user scale.** The technical rate
   limits already verified (1 req/sec on portfolio-read endpoints, per client code)
   are per-account, not per-app — does serving many simultaneous users change
   anything about pricing, throttling, or infrastructure expectations on their side?
5. **Data usage terms specifically.** Confirmed already: SmartAPI itself carries no
   subscription fee. Worth confirming explicitly whether that holds for a
   commercial multi-user product, or whether "free" was scoped to individual
   traders using their own API key for their own account.

## What to do with the answers

Whatever comes back updates `CLAUDE.md`'s Gate C entry directly — either resolved
(with the terms recorded, same as Gate A's decision was recorded) or resolved in
the negative (in which case the product's viable shape narrows further, and that
narrowing gets designed around explicitly, not assumed).
