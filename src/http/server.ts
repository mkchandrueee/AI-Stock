/**
 * HTTP layer: the login redirect callback and read endpoints for connected accounts /
 * reconciliation history. Deliberately does NOT persist the broker session
 * (jwtToken/feedToken) anywhere — see "Why no session storage" below. That means
 * there's currently no way to trigger a sync/reconciliation cycle *later*, only at the
 * moment a user completes the login redirect. A scheduled background job (the
 * "SCHEDULED" trigger reconciliation-service.ts already has a slot for) needs a way to
 * re-authenticate without a human clicking through Angel One's login page each time,
 * which Angel One's own token model doesn't provide for the redirect flow (see
 * angel-one-verification.md) — this is a real open problem, not solved here.
 *
 * Why no session storage: CLAUDE.md rule 4 — "Secrets never touch application code...
 * Never in config, env files, source, DB columns, logs, traces, or error messages."
 * A broker JWT is exactly this kind of secret. Storing it — even encrypted — is a
 * secrets-management decision (key management, rotation, access control) that hasn't
 * been made for this project yet, and building one silently while "just adding an HTTP
 * layer" would be scope creep on a security-sensitive decision nobody's reviewed. So
 * for now: the session lives in memory for the lifetime of one request only.
 */
import Fastify from "fastify";
import { Pool } from "pg";
import { AngelOneAdapter } from "../brokers/angel-one/adapter.js";
import { PostgresInstrumentResolver } from "../security-master/postgres-instrument-resolver.js";
import { ReconciliationService } from "../reconciliation/reconciliation-service.js";
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

  const app = Fastify({ logger: true });

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

    // Session is used here, in-memory, and then goes out of scope. Never stored.
    const result = await reconciliationService.reconcile(session, accountId, "MANUAL");

    return reply.send({
      accountId,
      displayName: profile.displayName,
      reconciliation: { status: result.status, findingCount: result.findings.length },
    });
  });

  app.get("/accounts", async () => {
    const result = await pool.query(
      `select account_id, broker, broker_account_ref, display_name, exchanges, products, created_at
       from account order by created_at desc`,
    );
    return result.rows;
  });

  app.get("/accounts/:accountId/reconciliation-runs", async (request) => {
    const { accountId } = request.params as { accountId: string };
    const runs = await pool.query(
      `select run_id, trigger, started_at, completed_at, status
       from reconciliation_run where account_id = $1
       order by started_at desc limit 20`,
      [accountId],
    );
    return runs.rows;
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return app;
}

async function main() {
  const config = loadConfig();
  const app = buildServer(config);
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
