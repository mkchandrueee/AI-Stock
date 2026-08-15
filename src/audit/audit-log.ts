/**
 * Hash-chained, append-only audit log — see migrations/0004_audit_log.sql for the
 * schema and the tamper-evidence rationale.
 *
 * Two properties this file is responsible for that the schema alone can't guarantee:
 * 1. Redaction happens automatically, not by caller discipline (CLAUDE.md rule 4:
 *    "Automated redaction at the logging layer, not code review"). Every details
 *    object passed to log() is scanned for secret-shaped keys and redacted before it
 *    touches SQL — this doesn't trust that whoever calls log() remembered not to
 *    include a token.
 * 2. The hash chain is correct under concurrency. Two events logged at nearly the same
 *    moment could otherwise both read the same "previous row" and compute conflicting
 *    chains. Writes are serialized with a Postgres advisory lock scoped to this table,
 *    for the duration of the read-compute-insert, so this can't happen.
 */
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

/** Any key matching (case-insensitively) one of these patterns is redacted, regardless
 * of what the caller intended to log. Defense in depth, not the only line of defense —
 * callers still shouldn't pass secrets in, this is the backstop for when they do. */
const SECRET_KEY_PATTERNS = [/token/i, /password/i, /secret/i, /\bpin\b/i, /totp/i, /credential/i];

export function redactDetails(details: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      redacted[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redactDetails(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

// Arbitrary but fixed lock key — any 64-bit value works, it just needs to be constant
// so every writer contends on the same advisory lock.
const AUDIT_LOG_LOCK_KEY = 96_3n; // spec §96.3, easy to recognize in pg_locks output

export class AuditLog {
  constructor(private readonly pool: Pool) {}

  async log(eventType: string, accountId: string | null, details: Record<string, unknown>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Held for the duration of this transaction only — released on COMMIT/ROLLBACK.
      await client.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOG_LOCK_KEY]);

      const prevHash = await this.getLastHash(client);
      const redacted = redactDetails(details);
      const createdAt = new Date().toISOString();
      const rowHash = computeRowHash(prevHash, eventType, accountId, redacted, createdAt);

      await client.query(
        `insert into audit_log (event_type, account_id, details, created_at, prev_hash, row_hash)
         values ($1, $2, $3, $4, $5, $6)`,
        [eventType, accountId, JSON.stringify(redacted), createdAt, prevHash, rowHash],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async getLastHash(client: PoolClient): Promise<string | null> {
    const result = await client.query<{ row_hash: string }>(
      `select row_hash from audit_log order by audit_log_id desc limit 1`,
    );
    return result.rows[0]?.row_hash ?? null;
  }
}

/**
 * Postgres's `jsonb` column type normalizes key order and whitespace on storage —
 * confirmed directly: {"jwtToken":"x","nested":{...}} round-trips as
 * {"nested": {...}, "jwtToken": "x"}, key order changed, spacing added. Hashing
 * plain JSON.stringify(details) would make every row fail verification after a
 * round-trip through the database, even completely untampered — caught by actually
 * running verifyAuditChain() against real stored rows, not by reasoning about it.
 * This recursively sorts object keys before serializing, so the hash is computed the
 * same way whether `details` just came from the caller or was just read back from
 * Postgres.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
  );
  return `{${entries.join(",")}}`;
}

function computeRowHash(
  prevHash: string | null,
  eventType: string,
  accountId: string | null,
  details: Record<string, unknown>,
  createdAt: string,
): string {
  const hash = createHash("sha256");
  hash.update(prevHash ?? "GENESIS");
  hash.update(eventType);
  hash.update(accountId ?? "");
  hash.update(canonicalJson(details));
  hash.update(createdAt);
  return hash.digest("hex");
}

export interface ChainVerificationResult {
  valid: boolean;
  /** The audit_log_id of the first row whose hash doesn't match recomputation, if any. */
  brokenAtId: number | null;
}

/** Walks the entire chain and recomputes every hash from stored content, confirming
 * each row_hash actually matches its content + the previous row's row_hash. Detects
 * tampering; doesn't prevent it (see the schema file's note on DB-level permissions). */
export async function verifyAuditChain(pool: Pool): Promise<ChainVerificationResult> {
  const result = await pool.query<{
    audit_log_id: number;
    event_type: string;
    account_id: string | null;
    details: Record<string, unknown>;
    created_at: Date;
    prev_hash: string | null;
    row_hash: string;
  }>(`select * from audit_log order by audit_log_id asc`);

  let expectedPrevHash: string | null = null;
  for (const row of result.rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return { valid: false, brokenAtId: row.audit_log_id };
    }
    const recomputed = computeRowHash(
      row.prev_hash,
      row.event_type,
      row.account_id,
      row.details,
      row.created_at.toISOString(),
    );
    if (recomputed !== row.row_hash) {
      return { valid: false, brokenAtId: row.audit_log_id };
    }
    expectedPrevHash = row.row_hash;
  }
  return { valid: true, brokenAtId: null };
}
