---
paths:
  - "**/brokers/**"
  - "**/adapters/**"
---

# Broker adapter rules

Applies when working on any broker integration code.

- Every capability must be verified against **current official documentation** before it is
  implemented. Cite the doc URL and date in a comment on the adapter class.
- Unverified capability is marked `UNAVAILABLE` / `REQUIRES_VERIFICATION` — never implemented
  speculatively and never inferred from another broker's API shape (spec §52).
- No broker-specific type, field name, or error code may cross the adapter boundary. The rest
  of the codebase sees only the canonical model (spec §4).
- Adapter declares its own metadata: API version, capability map, auth version,
  `last_verified_date`, doc URL (spec §40).
- Also declare infrastructure requirements: static IP, webhook endpoint, TOTP mechanism,
  token lifetime, rate limits (spec §93.7).
- Rate governors are enforced platform-side, stricter than the broker's published limits.
- Token refresh is a scheduled, monitored, alerting service — never an inline retry.
- Handle explicitly: token expiry, market closed, rate limit, network timeout, partial data,
  malformed response, unexpected status. Each gets a distinct canonical error.
