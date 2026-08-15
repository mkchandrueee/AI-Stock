/**
 * Periodically recomputes the audit log's hash chain and confirms it's still valid —
 * closes the gap named in docs/design/audit-log.md: GET /audit-log/verify existed and
 * worked, but nothing called it automatically, so tampering would only be caught if
 * someone thought to check.
 *
 * Separate from the reconciliation scheduler: different scope (whole-table integrity
 * check vs. per-account business-logic comparison) and a different natural cadence —
 * this is O(n) over the entire audit_log table, doesn't need to run as often as
 * reconciliation to still be useful, and isn't account-scoped at all.
 */
import type { Pool } from "pg";
import { verifyAuditChain } from "../audit/audit-log.js";

export async function runAuditVerificationCycle(pool: Pool): Promise<void> {
  const result = await verifyAuditChain(pool);
  if (result.valid) {
    console.log("[audit-verify] chain valid");
  } else {
    // No alerting/paging infrastructure exists yet — this is the honest, proportionate
    // action at Phase 1's current scale: loud and visible in whatever's watching
    // stdout, not silently swallowed. A real deployment needs this to actually page
    // someone; not built, flagged rather than pretended.
    console.error(
      `[audit-verify] CHAIN INTEGRITY FAILURE at audit_log_id=${result.brokenAtId} — investigate immediately`,
    );
  }
}

/** Returns a stop function; caller is responsible for calling it on shutdown. */
export function startAuditVerificationScheduler(pool: Pool, intervalMs: number): () => void {
  const timer = setInterval(() => {
    runAuditVerificationCycle(pool).catch((err) => {
      console.error("[audit-verify] cycle-level failure:", err);
    });
  }, intervalMs);
  return () => clearInterval(timer);
}
