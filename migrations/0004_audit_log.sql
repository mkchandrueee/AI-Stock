-- Hash-chained, append-only audit log (spec §96.3, §43's lineage principle; the stack
-- decision in CLAUDE.md explicitly committed to this shape). Distinct from
-- reconciliation_run, which logs business-logic outcomes — this logs security-relevant
-- events: session lifecycle (login, session save/load/delete), account connections.
--
-- Tamper-evidence: each row's row_hash is a hash of its own content plus the previous
-- row's row_hash, forming a chain. Altering any past row breaks every row_hash after
-- it — detectable by recomputing the chain (see verifyAuditChain in audit-log.ts).
-- This is an integrity mechanism, not encryption — it doesn't stop someone with DB
-- write access from tampering, it makes tampering detectable after the fact.

create table audit_log (
  audit_log_id bigserial primary key,
  event_type text not null,
  account_id uuid references account (account_id),
  -- Automated redaction happens before this ever reaches SQL — see redactDetails in
  -- audit-log.ts. Never trust a caller not to have accidentally included a secret.
  details jsonb not null,
  created_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null
);

create index audit_log_account_idx on audit_log (account_id, created_at);
create index audit_log_event_type_idx on audit_log (event_type, created_at);

-- No update/delete grants are set up here (no role separation exists yet in this
-- local-dev setup) — the append-only property is enforced by application discipline
-- (audit-log.ts never issues UPDATE/DELETE against this table) and by the hash chain
-- making unauthorized tampering detectable, not by a database-level permission wall.
-- Flagged as a gap for a real deployment, not solved here.
