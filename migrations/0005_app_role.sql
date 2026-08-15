-- Least-privilege application role. Until now the app connected as the postgres
-- superuser (fine for getting a local dev instance running, wrong for anything else) —
-- flagged as a real gap in docs/design/audit-log.md ("no database-level append-only
-- enforcement... no role separation exists in this local-dev setup at all").
--
-- This closes it for the tables that are documented, elsewhere in this repo, as
-- append-only by design: audit_log (this file's main purpose — the whole point of the
-- hash chain is undermined if the role writing it can also rewrite history),
-- funds_snapshot ("append-only... matches the point-in-time posture" — sync-service.md),
-- trade ("a fill never changes once it exists" — account-sync-service.ts),
-- reconciliation_finding (a record of what a past run found, never revised).
--
-- Password below is a local-dev placeholder, not committed anywhere real — same
-- posture as the postgres/1234 credential already in use for this database.

create role app_user with login password 'app_user_dev_password';

-- Tables the app both reads and mutates in the ordinary course of sync/reconciliation.
grant select, insert, update on
  account, holding, position, broker_order, instrument, instrument_version,
  broker_instrument_mapping, reconciliation_run
  to app_user;

-- Append-only by design (see file header) — INSERT and SELECT, deliberately no UPDATE
-- or DELETE grant. A role that can only append cannot rewrite what it already wrote.
grant select, insert on
  audit_log, funds_snapshot, trade, reconciliation_finding
  to app_user;

-- Sequences backing the bigserial/identity columns on the above tables need USAGE for
-- INSERT to work at all.
grant usage on all sequences in schema public to app_user;
