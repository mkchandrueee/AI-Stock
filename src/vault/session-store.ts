/**
 * Persists broker sessions in OpenBao (KV v2), bounded by their own expiry — see
 * docs/design/session-store.md for why KV v2 over Transit, and why expiry is enforced
 * here rather than relied on as a native OpenBao TTL.
 *
 * This is the "boundary" component named in auth-session-architecture.md: callers ask
 * for a session by accountId, they don't read raw storage. Nothing outside this file
 * should construct an OpenBao path or touch the KV API directly.
 *
 * Every operation logs to AuditLog itself, not the caller — CLAUDE.md rule 4 wants
 * "automated redaction at the logging layer, not code review," and relying on every
 * call site to remember to log a secret-adjacent operation is exactly the code-review
 * dependence that line argues against. AuditLog's own redaction still strips anything
 * secret-shaped from what gets logged here (only accountId and outcome, never a token).
 */
import type { AuthSession } from "../core/broker-adapter.js";
import type { AuditLog } from "../audit/audit-log.js";

export interface SessionStoreConfig {
  baseUrl: string; // e.g. http://127.0.0.1:8200
  token: string; // root token in dev; a scoped AppRole token in any real deployment
}

export class SessionStore {
  constructor(
    private readonly config: SessionStoreConfig,
    private readonly auditLog: AuditLog,
  ) {}

  async save(accountId: string, session: AuthSession): Promise<void> {
    const response = await fetch(this.pathFor(accountId), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ data: session }),
    });
    if (!response.ok) {
      throw new Error(`SessionStore.save failed: HTTP ${response.status}`);
    }
    await this.auditLog.log("SESSION_SAVED", accountId, { expiresAt: session.expiresAt });
  }

  /** Returns null if no session exists OR if the stored session has passed its own
   * expiresAt — an expired session is treated as absent, not as stale data to hand
   * back. Deletes the expired entry rather than leaving it to be found again later. */
  async load(accountId: string): Promise<AuthSession | null> {
    // A connection failure here is the secret store being down, not the account
    // having no session. Left unwrapped it surfaces as a bare "fetch failed" 500,
    // which reads as a broker problem and sends you looking in the wrong place —
    // observed exactly that way when the dev-mode instance had exited.
    let response: Response;
    try {
      response = await fetch(this.pathFor(accountId), {
        method: "GET",
        headers: this.headers(),
      });
    } catch (err) {
      throw new Error(
        `SessionStore unreachable at ${this.config.baseUrl} — is OpenBao running? ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }
    if (response.status === 404) {
      await this.auditLog.log("SESSION_LOADED", accountId, { outcome: "NOT_FOUND" });
      return null;
    }
    if (!response.ok) {
      throw new Error(`SessionStore.load failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { data: { data: AuthSession } };
    const session = body.data.data;

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.delete(accountId);
      await this.auditLog.log("SESSION_LOADED", accountId, { outcome: "EXPIRED", expiresAt: session.expiresAt });
      return null;
    }
    await this.auditLog.log("SESSION_LOADED", accountId, { outcome: "FOUND", expiresAt: session.expiresAt });
    return session;
  }

  /** For the Broker Connect Center's Disconnect action (spec §2). */
  async delete(accountId: string): Promise<void> {
    const response = await fetch(this.pathFor(accountId).replace("/data/", "/metadata/"), {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`SessionStore.delete failed: HTTP ${response.status}`);
    }
    await this.auditLog.log("SESSION_DELETED", accountId, {});
  }

  private pathFor(accountId: string): string {
    return `${this.config.baseUrl}/v1/secret/data/broker-sessions/${accountId}`;
  }

  private headers(): Record<string, string> {
    return {
      "X-Vault-Token": this.config.token,
      "Content-Type": "application/json",
    };
  }
}
