/**
 * HTTP layer: the login redirect callback and read endpoints for connected accounts /
 * reconciliation history.
 *
 * Session persistence (Option B, see docs/design/auth-session-architecture.md and
 * docs/design/session-store.md): on successful login, the session is saved to
 * SessionStore (OpenBao), bounded by its own expiry. reconciliation-scheduler.ts uses
 * that to run reconciliation unattended, within whatever's left of a session's
 * lifetime — started from main() below, not from buildServer(), since tests that build
 * a server without listening shouldn't also spin up a background timer.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Pool } from "pg";
import { AngelOneAdapter } from "../brokers/angel-one/adapter.js";
import { PostgresInstrumentResolver } from "../security-master/postgres-instrument-resolver.js";
import { ReconciliationService } from "../reconciliation/reconciliation-service.js";
import { SessionStore } from "../vault/session-store.js";
import { startReconciliationScheduler } from "../scheduler/reconciliation-scheduler.js";
import { startAuditVerificationScheduler } from "../scheduler/audit-verification-scheduler.js";
import { AuditLog, verifyAuditChain } from "../audit/audit-log.js";
import { getAccountPortfolio, getUnifiedPortfolio } from "../portfolio/portfolio-service.js";
import {
  getAccountOrders,
  getAccountPositions,
  getAccountTrades,
} from "../portfolio/account-activity-service.js";
import { getFindingCountsForAccount, getRunFindings } from "../reconciliation/findings-query.js";
import { loadConfig } from "./config.js";

export function buildServer(config: ReturnType<typeof loadConfig>) {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const resolver = new PostgresInstrumentResolver(pool);
  const adapter = new AngelOneAdapter({
    apiKey: config.angelOne.apiKey,
    clientLocalIp: config.angelOne.clientLocalIp,
    clientPublicIp: config.angelOne.clientPublicIp,
    macAddress: config.angelOne.macAddress,
    instrumentResolver: resolver,
  });
  const reconciliationService = new ReconciliationService(pool, adapter);
  const auditLog = new AuditLog(pool);
  const sessionStore = new SessionStore(config.openBao, auditLog);

  const app = Fastify({ logger: true });

  // Read-only dashboard (public/) over the JSON endpoints below — no separate
  // frontend server, no build step. Static routes are registered before the API
  // routes are declared, but Fastify's router matches the more specific /health,
  // /accounts, etc. paths first regardless of registration order.
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
  app.register(fastifyStatic, { root: publicDir });

  app.get("/health", async () => {
    await pool.query("select 1");
    return { status: "ok" };
  });

  // Sends the user to Angel One's own login page — no credentials pass through here.
  app.get("/connect", async (_request, reply) => {
    const loginUrl = adapter.getLoginUrl({
      redirectUrl: `${config.baseUrl}/connect/callback`,
    });
    return reply.redirect(loginUrl);
  });

  app.get("/connect/callback", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const loginResult = await adapter.completeLogin(query);
    if (!loginResult.ok) {
      return reply.status(400).send({ error: loginResult.error });
    }
    const session = loginResult.value;

    const accountResult = await adapter.getAccount(session);
    if (!accountResult.ok) {
      return reply.status(502).send({ error: accountResult.error });
    }
    const profile = accountResult.value;

    // Distinguishes first-time connection from reconnecting an existing account, so
    // the reconciliation_run log actually reflects reconciliation.md's "runs on a
    // schedule AND on reconnect" language rather than logging every login as MANUAL.
    const existing = await pool.query<{ account_id: string }>(
      `select account_id from account where broker = $1 and broker_account_ref = $2`,
      [profile.brokerId, profile.brokerAccountRef],
    );
    const isReconnect = existing.rows.length > 0;

    const upserted = await pool.query<{ account_id: string }>(
      `insert into account (broker, broker_account_ref, display_name, exchanges, products)
       values ($1, $2, $3, $4, $5)
       on conflict (broker, broker_account_ref) do update set
         display_name = excluded.display_name,
         exchanges = excluded.exchanges,
         products = excluded.products
       returning account_id`,
      [profile.brokerId, profile.brokerAccountRef, profile.displayName, profile.exchanges, profile.products],
    );
    const accountId = upserted.rows[0]!.account_id;

    await auditLog.log(isReconnect ? "ACCOUNT_RECONNECTED" : "ACCOUNT_CONNECTED", accountId, {
      broker: profile.brokerId,
      brokerAccountRef: profile.brokerAccountRef,
    });
    await sessionStore.save(accountId, session);
    const result = await reconciliationService.reconcile(
      session,
      accountId,
      isReconnect ? "RECONNECT" : "MANUAL",
    );

    return reply.send({
      accountId,
      displayName: profile.displayName,
      reconciliation: { status: result.status, findingCount: result.findings.length },
    });
  });

  // Broker Connect Center's Disconnect action (spec §2) — deletes the stored session.
  // Does not delete the account's synced data; that's a separate, larger decision.
  app.delete("/accounts/:accountId/session", async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    await sessionStore.delete(accountId);
    return reply.status(204).send();
  });

  app.get("/accounts", async () => {
    const result = await pool.query(
      `select account_id, broker, broker_account_ref, display_name, exchanges, products, created_at
       from account order by created_at desc`,
    );
    return result.rows;
  });

  // Unified portfolio across all connected accounts (spec §15), with duplicate
  // holdings aggregated (spec §17). No P&L/performance figures — see
  // portfolio-service.ts's file header for why.
  app.get("/portfolio", async () => {
    return getUnifiedPortfolio(pool);
  });

  // Per-account portfolio (spec §16).
  app.get("/accounts/:accountId/portfolio", async (request) => {
    const { accountId } = request.params as { accountId: string };
    return getAccountPortfolio(pool, accountId);
  });

  // Positions/orders/trades (spec §16). Synced since the sync service was written;
  // these are the first read paths for them. No P&L — see account-activity-service.ts.
  app.get("/accounts/:accountId/positions", async (request) => {
    const { accountId } = request.params as { accountId: string };
    return getAccountPositions(pool, accountId);
  });

  app.get("/accounts/:accountId/orders", async (request) => {
    const { accountId } = request.params as { accountId: string };
    return getAccountOrders(pool, accountId);
  });

  app.get("/accounts/:accountId/trades", async (request) => {
    const { accountId } = request.params as { accountId: string };
    return getAccountTrades(pool, accountId);
  });

  app.get("/accounts/:accountId/reconciliation-runs", async (request) => {
    const { accountId } = request.params as { accountId: string };
    const runs = await pool.query(
      `select run_id, trigger, started_at, completed_at, status
       from reconciliation_run where account_id = $1
       order by started_at desc limit 20`,
      [accountId],
    );
    // Finding counts joined in so a run row can say what it found, not just its
    // status — one query for the page rather than one per run.
    const counts = await getFindingCountsForAccount(pool, accountId);
    const byRunId = new Map(counts.map((c) => [c.runId, c]));
    return runs.rows.map((run) => ({
      ...run,
      requiresAttentionCount: byRunId.get(run.run_id)?.requiresAttention ?? 0,
      informationalCount: byRunId.get(run.run_id)?.informational ?? 0,
    }));
  });

  // What a given run actually found — the detail behind RECONCILIATION_REQUIRED.
  app.get("/reconciliation-runs/:runId/findings", async (request) => {
    const { runId } = request.params as { runId: string };
    return getRunFindings(pool, runId);
  });

  app.get("/accounts/:accountId/audit-log", async (request) => {
    const { accountId } = request.params as { accountId: string };
    const entries = await pool.query(
      `select audit_log_id, event_type, details, created_at
       from audit_log where account_id = $1
       order by audit_log_id desc limit 50`,
      [accountId],
    );
    return entries.rows;
  });

  // Recomputes the hash chain from stored content — detects tampering, doesn't
  // prevent it (see migrations/0004_audit_log.sql on DB-level permission gaps).
  app.get("/audit-log/verify", async () => {
    return verifyAuditChain(pool);
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return { app, pool, sessionStore, reconciliationService };
}

async function main() {
  const config = loadConfig();
  const { app, pool, sessionStore, reconciliationService } = buildServer(config);

  const stopReconciliationScheduler = startReconciliationScheduler(
    { pool, sessionStore, reconciliationService },
    config.reconciliationIntervalMs,
  );
  const stopAuditVerificationScheduler = startAuditVerificationScheduler(
    pool,
    config.auditVerificationIntervalMs,
  );
  app.addHook("onClose", async () => {
    stopReconciliationScheduler();
    stopAuditVerificationScheduler();
  });

  await app.listen({ port: config.port });
}

// Only run when executed directly (node dist/http/server.js), not when imported —
// e.g. for tests that build the server without binding a port.
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
