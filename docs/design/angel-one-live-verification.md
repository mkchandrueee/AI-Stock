# Angel One live verification — existing Trading API app

Status: **live test completed**, 2026-08-16, against the real account, using a
disposable local script run entirely by the user (not by Claude — see "How this was
run" below). No production code changed. No order placed, modified, or cancelled.
Session was explicitly logged out at the end of the run. The verification script and
its raw output never entered this repository or this conversation; only the
sanitized results file (capability name, pass/fail, HTTP status, redacted message,
timestamp — no tokens, no credentials) was read to produce this report.

## Results

| Capability | Result | Evidence | Notes |
|---|---|---|---|
| Authentication | **PASS** (HTTP 200) | Session established via `loginByPassword`. Response contained `jwtToken` (1238 chars), `refreshToken` (1032 chars), `feedToken` (186 chars) — presence and length only, values never logged or recorded. | Confirms `loginByPassword` works today against this existing app, regardless of which portal flow it was originally created through. |
| Profile | **PASS** (HTTP 200) | `status: true` | |
| Holdings | **PASS** (HTTP 200) | 1 holding returned | Matches account having a real position. |
| Positions | **PASS** (HTTP 200) | 0 positions returned | Correct, not a failure — account has no open intraday/F&O positions right now. |
| Funds | **PASS** (HTTP 200) | `status: true` | |
| Order Book | **PASS** (HTTP 200) | 0 orders returned | Correct — no orders exist on this account currently. |
| Trade Book | **PASS** (HTTP 200) | 0 trades returned | Correct, same reasoning. |
| LTP/Quote | **PASS** (HTTP 200) | `status: true`, RELIANCE-EQ | Not used in Phase 1 scope; confirmed working anyway since it was cheap to test. |
| Historical Data | **PASS** (HTTP 200) | `status: true`, but 0 candles for the requested 2-day `ONE_DAY` window | The call itself succeeded — this is not an API failure. Empty result most likely reflects no trading session falling inside the narrow 2-day window requested (this test ran on a weekend); the endpoint's *availability* is confirmed, its exact data-return behavior around specific date ranges was not further investigated since it's out of Phase 1 scope. |
| WebSocket | **PASS** | Handshake succeeded using the header-based auth confirmed from Angel One's own Python SDK source (`Authorization`, `x-api-key`, `x-client-code`, `x-feed-token`); connection was closed immediately with no subscription sent | Not used in Phase 1 scope; confirmed reachable anyway. |

**Every capability tested passed against the real account, with no errors.**

## Authentication method that actually worked

`loginByPassword` — `POST /rest/auth/angelbroking/user/v1/loginByPassword` with
client code, PIN, and a fresh TOTP code. This is the direct-credential flow, not the
`publisher-login` redirect this project's production architecture (Option B) is
built around. Confirms the headline finding from
`angel-one-live-capability-matrix.md`: the redirect-flow ambiguity does not block
using this existing app for read-only verification.

## Session expiry behavior — not newly observed this pass

This test authenticated, ran ten quick calls (~10 seconds total), and explicitly
logged out — it did not run long enough to observe organic expiry, and doesn't
change what's already documented: session valid until 00:00 IST regardless of issue
time, per official-forum sources quoted in the two prior reports. Worth being
precise that this pass confirms *token issuance and successful logout*, not the
expiry boundary itself.

## Static IP requirement — now empirically confirmed, not just documented

The script used placeholder values for `X-ClientLocalIP` (127.0.0.1),
`X-ClientPublicIP` (127.0.0.1), and `X-MACAddress` (00:00:00:00:00:00) — no real
static IP was registered or used anywhere in this test. **Every read-only capability
succeeded anyway**, including ones never tested live before (LTP, historical data,
WebSocket). This is the strongest evidence yet for the "static IP is scoped to order
execution only" finding — previously corroborated by three independent official-forum
quotes across separate research passes, now also confirmed by an actual successful
call sequence using no static IP at all.

## API limitations/errors encountered

None. Every call returned HTTP 200 with `status: true` on the first attempt, at
~1.2s spacing (well under the documented 1 req/sec limits on the tightest
endpoints). The only non-obvious result was Historical Data's empty candle array,
addressed above — a data-availability artifact of the narrow test window, not an
error.

## Whether the existing `AuthSession` abstraction can represent this cleanly

**Partially, same conclusion as the capability-matrix report, now confirmed against
a real response rather than documentation alone.** The actual login response
contained exactly the three fields expected: `jwtToken`, `refreshToken`,
`feedToken`. `AuthSession` today has `jwtToken` and `feedToken` — both map directly.
It has no `refreshToken` field, by deliberate original design (the redirect flow
never returns one). `loginByPassword` does return one; using it for anything beyond
this one-off check would mean either extending `AuthSession` to hold it, or
continuing to discard it and keep the same single-day-session posture the redirect
flow already has. Not changed in this pass — no production code was touched, per
instruction.

## What this does and doesn't establish

**Establishes**: the existing Angel One account and app can authenticate and supply
every read-only capability Phase 1 needs, right now, with no static IP and no
redirect-flow dependency.

**Does not establish**: that production should adopt `loginByPassword` for real
users. That remains the separate, larger decision named in
`angel-one-live-capability-matrix.md` — collecting every user's PIN and TOTP is
exactly the tradeoff the existing Option B / OpenBao architecture was built to
avoid, and nothing about a successful personal-account test changes that calculus.

## How this was run

A disposable script, written by Claude but **executed entirely by the user**, in
their own terminal, never through Claude's tool-calling — credentials were typed
directly into a local Node process and never appeared in this conversation. The
script wrote only a sanitized results file (this report's source); the script
itself and that results file are deleted as part of this same change (see commit).
No file containing credentials, tokens, or the raw script's execution output was
ever staged, committed, or read by Claude beyond the sanitized JSON summarized above.
