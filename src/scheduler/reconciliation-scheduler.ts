/**
 * Runs reconciliation for every connected account on an interval, using whatever
 * session SessionStore currently has for each one. This is the piece that makes
 * Option B's promise real: previously SessionStore made unattended reconciliation
 * *possible* within a session's remaining lifetime; nothing called it. This does.
 *
 * Still bounded by the same hard constraint as everything else in this area
 * (auth-session-architecture.md): if an account's session has expired and nobody has
 * logged back in since, there is nothing this scheduler can do about it — it skips
 * that account rather than failing the whole cycle, and logs the skip so it's visible
 * rather than silent.
 */
import type { Pool } from "pg";
import type { ReconciliationService } from "../reconciliation/reconciliation-service.js";
import type { SessionStore } from "../vault/session-store.js";

export interface SchedulerDeps {
  pool: Pool;
  sessionStore: SessionStore;
  reconciliationService: ReconciliationService;
}

export async function runScheduledReconciliationCycle(deps: SchedulerDeps): Promise<void> {
  const accounts = await deps.pool.query<{ account_id: string }>(`select account_id from account`);

  for (const { account_id } of accounts.rows) {
    const session = await deps.sessionStore.load(account_id);
    if (!session) {
      console.log(`[scheduler] no valid session for account ${account_id} — skipped, not reconciled`);
      continue;
    }
    try {
      const result = await deps.reconciliationService.reconcile(session, account_id, "SCHEDULED");
      console.log(`[scheduler] account ${account_id}: ${result.status} (${result.findings.length} findings)`);
    } catch (err) {
      // One account's failure shouldn't stop the rest of the cycle from running.
      console.error(`[scheduler] reconciliation failed for account ${account_id}:`, err);
    }
  }
}

/** Returns a stop function; caller is responsible for calling it on shutdown. */
export function startReconciliationScheduler(deps: SchedulerDeps, intervalMs: number): () => void {
  const timer = setInterval(() => {
    runScheduledReconciliationCycle(deps).catch((err) => {
      console.error("[scheduler] cycle-level failure:", err);
    });
  }, intervalMs);
  return () => clearInterval(timer);
}
