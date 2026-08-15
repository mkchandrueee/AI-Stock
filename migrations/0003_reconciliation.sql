-- Reconciliation log (spec §13; .claude/rules/reconciliation.md: "Every reconciliation
-- cycle is logged with what was compared and what was found"). Append-only.

create table reconciliation_run (
  run_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account (account_id),
  -- reconciliation.md: "Reconciliation runs on a schedule AND on reconnect after any
  -- disconnect" — recorded so a later audit can tell which triggered a given run.
  trigger text not null check (trigger in ('SCHEDULED', 'RECONNECT', 'MANUAL')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'CLEAN', 'RECONCILIATION_REQUIRED', 'FAILED'))
);

create index reconciliation_run_account_idx on reconciliation_run (account_id, started_at desc);

create table reconciliation_finding (
  finding_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references reconciliation_run (run_id),
  kind text not null,
  severity text not null check (severity in ('INFORMATIONAL', 'REQUIRES_ATTENTION')),
  details jsonb not null,
  created_at timestamptz not null default now()
);

create index reconciliation_finding_run_idx on reconciliation_finding (run_id);
