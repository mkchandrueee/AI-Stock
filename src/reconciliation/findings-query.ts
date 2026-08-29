/**
 * Read access to what a reconciliation run actually found.
 *
 * ReconciliationService has recorded findings since it was written, but nothing ever
 * read them back — a run could report RECONCILIATION_REQUIRED with no way to see
 * which holding, order or trade caused it. That undercuts the rule the whole engine
 * exists to enforce (.claude/rules/reconciliation.md: "Never silently overwrite. A
 * mismatch surfaces as RECONCILIATION_REQUIRED"): surfacing a status without its
 * cause is only half of surfacing it.
 *
 * Read-only and additive — the classification itself (reconciliation-engine.ts) and
 * the write gate (reconciliation-service.ts) are untouched.
 */
import type { Pool } from "pg";

export interface FindingView {
  findingId: string;
  runId: string;
  kind: string;
  severity: "INFORMATIONAL" | "REQUIRES_ATTENTION";
  /** Shape varies by kind — the engine strips `kind` and stores the rest. */
  details: Record<string, unknown>;
  createdAt: string;
}

export async function getRunFindings(pool: Pool, runId: string): Promise<FindingView[]> {
  const result = await pool.query(
    `select finding_id, run_id, kind, severity, details, created_at
     from reconciliation_finding
     where run_id = $1
     -- REQUIRES_ATTENTION first: the ones that blocked the write are what a reader
     -- is looking for, and a long INFORMATIONAL tail shouldn't bury them.
     order by (severity = 'REQUIRES_ATTENTION') desc, created_at asc`,
    [runId],
  );
  return result.rows.map((r) => ({
    findingId: r.finding_id,
    runId: r.run_id,
    kind: r.kind,
    severity: r.severity,
    details: r.details,
    createdAt: r.created_at.toISOString(),
  }));
}

/** Per-run finding counts for an account, so a run list can show what each run found
 * without a request per row. */
export interface RunFindingCounts {
  runId: string;
  requiresAttention: number;
  informational: number;
}

export async function getFindingCountsForAccount(
  pool: Pool,
  accountId: string,
): Promise<RunFindingCounts[]> {
  const result = await pool.query(
    `select f.run_id,
            count(*) filter (where f.severity = 'REQUIRES_ATTENTION') as requires_attention,
            count(*) filter (where f.severity = 'INFORMATIONAL') as informational
     from reconciliation_finding f
     join reconciliation_run r on r.run_id = f.run_id
     where r.account_id = $1
     group by f.run_id`,
    [accountId],
  );
  return result.rows.map((r) => ({
    runId: r.run_id,
    requiresAttention: Number(r.requires_attention),
    informational: Number(r.informational),
  }));
}
