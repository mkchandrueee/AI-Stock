---
paths:
  - "**/reconcil*/**"
  - "**/sync/**"
---

# Reconciliation rules

This is the correctness core of Phase 1. Treat it accordingly.

- Compare our state against broker state and classify every difference: missing order,
  unexpected order, quantity mismatch, price mismatch, missing fill, stale status,
  external trade (spec §13).
- **Never silently overwrite.** A mismatch surfaces as `RECONCILIATION_REQUIRED`.
- External/manually-placed trades are detected and flagged as external, not absorbed silently
  (spec §14).
- Reconciliation runs on a schedule AND on reconnect after any disconnect.
- Every reconciliation cycle is logged with what was compared and what was found.
- Tests must cover: partial fills, orders placed outside the platform, orders that vanish from
  the broker book, quantity drift, and reconnect after extended disconnection.
