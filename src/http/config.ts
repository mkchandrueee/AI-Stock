/**
 * Required config, loaded from environment variables (not committed — see .env,
 * gitignored). Fails loudly at startup if anything's missing rather than silently
 * running with a fabricated default (non-negotiable rule 1: no fabricated data).
 */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  baseUrl: string;
  angelOne: {
    apiKey: string;
    clientLocalIp: string;
    clientPublicIp: string;
    macAddress: string;
  };
  openBao: {
    baseUrl: string;
    token: string;
  };
  /** reconciliation.md says "runs on a schedule," not what the schedule is — this
   * default (15 min) is a judgment call, not a spec quote. Tunable via env, not
   * required, since getting it wrong isn't a correctness risk the way a missing
   * secret would be. */
  reconciliationIntervalMs: number;
  /** Same judgment-call status as reconciliationIntervalMs — no spec number to quote.
   * Longer default (1h) than reconciliation since this is a whole-table integrity
   * scan, not a per-account business check. */
  auditVerificationIntervalMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env["PORT"] ?? "3000"),
    databaseUrl: requireEnv("DATABASE_URL"),
    baseUrl: requireEnv("BASE_URL"),
    angelOne: {
      apiKey: requireEnv("ANGEL_ONE_API_KEY"),
      // Angel One's docs are written for a single desktop app where these identify
      // the end user's own machine — what they should be for a server-side
      // multi-user platform is still an open question (see AngelOneAdapter's file
      // header). Required here, not defaulted, so that open question stays visible
      // at startup rather than silently resolved with a made-up value.
      clientLocalIp: requireEnv("ANGEL_ONE_CLIENT_LOCAL_IP"),
      clientPublicIp: requireEnv("ANGEL_ONE_CLIENT_PUBLIC_IP"),
      macAddress: requireEnv("ANGEL_ONE_MAC_ADDRESS"),
    },
    openBao: {
      baseUrl: requireEnv("OPENBAO_ADDR"),
      // Root token in local dev mode. A real deployment needs a scoped policy +
      // AppRole, not this — see docs/design/session-store.md.
      token: requireEnv("OPENBAO_TOKEN"),
    },
    reconciliationIntervalMs: Number(process.env["RECONCILIATION_INTERVAL_MS"] ?? "900000"),
    auditVerificationIntervalMs: Number(process.env["AUDIT_VERIFICATION_INTERVAL_MS"] ?? "3600000"),
  };
}
