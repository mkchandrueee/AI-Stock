# Broker authorization / session management — architecture (STOP-and-review)

Status: **design only, no code.** Per instruction: stop implementation, design this,
review it, and only then decide the secrets store. Nothing below is built. This
supersedes the informal "no session storage" decision made in `docs/design/http-layer.md`
— that was a reasonable default for a single pass adding HTTP routes, but the request
now is to treat this as its own architecture and security gate, not a side effect of
routing work.

## The hard constraint everything else has to work around

Verified during the adapter/HTTP work (`angel-one-verification.md`,
`canonical-model-and-adapter-interface.md`): Angel One's `publisher-login` redirect flow
— the one that keeps this platform from ever touching a user's raw PIN or TOTP code —
issues a JWT and feed token with **no refresh token**. Confirmed against Angel One's own
Python SDK source, not inferred. The session is valid until 12 midnight IST regardless
of issue time, and the only way to renew it is sending the user through the interactive
redirect login again.

This means: **there is no version of "durable session management" that achieves silent,
unattended, indefinite renewal without either (a) accepting daily human interaction, or
(b) switching to a flow that requires this platform to handle the user's actual login
credentials.** That's not a gap in this design — it's a property of the broker. Any
option below has to be evaluated against it honestly, not around it.

## What "durable" needs to cover, regardless of which option is chosen

Four concerns exist no matter which tier gets picked:

1. **Lifecycle** — a session has a known expiry (`AuthSession.expiresAt`, already
   modeled). Something needs to track "is this session still usable" and distinguish
   that from "does this session no longer exist."
2. **Boundary** — per spec §28 ("AI should not control the broker credentials... the
   execution service performs authentication") and the adapter-boundary principle
   already established for broker data (`broker-adapters.md`), the same logic should
   apply to session material: nothing outside a narrow, named boundary should read a
   raw token directly. Today, every consumer (`ReconciliationService`, the HTTP layer)
   receives an `AuthSession` object directly. If sessions become persisted, that access
   pattern needs to change to "ask a boundary for a valid session," not "read the token
   column."
3. **Revocation** — `CLAUDE.md`'s planned Broker Connect Center (spec §2) has a
   `[Disconnect]` action. Whatever gets built needs an actual deletion path, not just a
   status flag, for whatever gets stored.
4. **Audit** — non-negotiable rule 4 requires automated redaction at the logging layer
   for anything secret-shaped. Any component that touches session material needs to be
   in scope for that from day one, not retrofitted.

## Threat model — what's actually being protected

Two different things could end up "stored," with very different blast radii if
compromised:

| Material | Sensitivity if leaked | Lifespan |
|---|---|---|
| Broker JWT / feed token | Read-only access to the connected account's portfolio data via the Angel One APIs this adapter calls (holdings, positions, funds, order/trade history). Cannot place, modify, or cancel orders through this adapter — those methods don't exist on the interface. Still real exposure: portfolio composition, cash position. | Expires by end of day IST regardless. |
| Login credentials (PIN + TOTP secret), if a credential-based flow were ever used | Full account access — anything the user's Angel One login can do, including trading, indefinitely until password/TOTP is rotated. | Effectively permanent until the user changes it. |

This difference is the crux of the decision below: persisting an expiring, capability-
limited session token is a materially smaller commitment than persisting anything that
could reconstruct a login.

## Three options

Presented as options with tradeoffs, not a recommendation — this is exactly the kind of
call `CLAUDE.md` says to bring back for a decision rather than resolve by picking the
convenient reading.

### Option A — No persistence (today's actual state)

Session lives in memory for one HTTP request, then is gone. Reconciliation only runs
when a human completes the login redirect.

- **Storage/key-management burden:** none.
- **Meets `reconciliation.md`'s "runs on a schedule AND on reconnect"?** No — there is
  no schedule.
- **User experience:** must open the app and log in (Angel One's page, not this
  platform's) roughly daily for fresh data.
- **Blast radius if the whole database were compromised:** zero broker-session exposure
  — nothing broker-related persists.

### Option B — Encrypted session persistence, bounded by the broker's own expiry

Store the JWT/feed token encrypted, scoped to its natural lifetime (expires by
midnight IST regardless). A scheduler can reconcile automatically **during the hours a
session happens to be valid**, but still can't renew past expiry without a human — so
this buys same-day automation, not indefinite automation.

- **Storage/key-management burden:** real, but bounded — this is "decide the secrets
  store" territory (encryption-at-rest mechanism, key ownership, rotation policy for
  the encryption key itself, access control on who/what can decrypt). Deliberately not
  decided in this document.
- **Meets `reconciliation.md`'s requirement?** Partially — "on reconnect" and
  "same-day scheduled" yes; "indefinite schedule with no human involvement" no.
  Still requires the user to log in at least once a day for the schedule to have
  anything to run against.
  - **Blast radius if compromised:** an attacker gets read-only portfolio access for
  whatever's left of that session's day — not standing account access.

### Option C — Credential-based flow (loginByPassword), full automation

Switch (or add as a second path) to Angel One's `loginByPassword`, which does issue a
refresh token, enabling indefinite unattended renewal. Requires this platform to
receive the user's PIN and TOTP code — even if only transiently, to make that one call
— and almost certainly to store the TOTP seed if renewal needs to survive server
restarts without a human re-entering a 30-second-lived code.

- **Storage/key-management burden:** the largest of the three, and now includes actual
  login-capable material (see threat table above), which non-negotiable rule 4 treats
  as the highest-sensitivity category this project handles.
- **Meets `reconciliation.md`'s requirement?** Yes, fully — this is what "runs on a
  schedule" without daily human involvement actually requires against this broker.
- **Note:** this is also the direction spec's broker-adapter metadata already
  anticipates — `broker-adapters.md` requires every adapter to declare its "TOTP
  mechanism" as an infrastructure requirement, which only matters if some component is
  expected to *use* a TOTP mechanism programmatically eventually. That's a signal this
  was anticipated by the spec, not evidence it's the right call for Phase 1 specifically
  — Phase 1 is read-only aggregation; whether it needs 24/7 unattended freshness or
  whether "reasonably fresh, updated when the user opens the app" is enough for what
  Phase 1 is actually trying to do is a product question, not just a technical one.

## What this document is not deciding

- Which secrets backend (OS keystore, cloud KMS, HashiCorp Vault, or something simpler
  for local dev) — that's explicitly the next step per your instruction, and shouldn't
  be pre-empted by this architecture pass.
- Whether Option C's UX/automation benefit is worth its security cost for this
  specific product at this specific phase — that's a call only you can make, informed
  by how "Phase 1" is actually meant to be used (a personal/small-scale tool vs.
  something aiming for many simultaneous users, where standing credential storage
  affects far more accounts at once).
- The specific shape of the "boundary" component in point 2 above (a service class? a
  separate process? a queue?) — worth designing once a storage option is picked, since
  the shape depends on what's actually being protected.

## Questions this needs from you before either the boundary design or the secrets store gets decided

1. Which of A/B/C — or is daily human login actually acceptable for how Phase 1 is
   meant to be used, making this whole gate less urgent than it looked?
2. If B or C: is this deployment ever expected to serve multiple simultaneous users'
   real accounts, or is "Phase 1" currently closer to a personal tool? That changes how
   much a secrets-management mistake would cost.
3. If C: comfortable with this platform receiving TOTP codes/seeds at all, given
   non-negotiable rule 4's framing of broker credentials as the highest-sensitivity
   category in the project?
