/**
 * Broker adapter contract (spec §4, §40; broker-adapters.md). No implementation here —
 * see docs/design/canonical-model-and-adapter-interface.md for rationale.
 */

import type {
  Account,
  BrokerAccountRef,
  BrokerAdapterError,
  BrokerId,
  Candle,
  CandleRequest,
  FundsSnapshot,
  Holding,
  Order,
  Position,
  Trade,
} from "./types.js";

/** Full capability vocabulary from spec §1/§5 — not just what Phase 1 uses, so a
 * second broker's adapter slots into the same matrix without redefinition. */
export type Capability =
  | "LOGIN"
  | "HOLDINGS"
  | "POSITIONS"
  | "ORDER_BOOK"
  | "TRADE_BOOK"
  | "PLACE_ORDER"
  | "MODIFY_ORDER"
  | "CANCEL_ORDER"
  | "FUNDS"
  | "MARGIN"
  | "WEBSOCKET"
  | "HISTORICAL_DATA"
  | "OPTIONS_DATA"
  | "GTT"
  | "MULTI_LEG";

export type CapabilityStatus =
  | "SUPPORTED"
  | "LIMITED_SUPPORT"
  | "NOT_CURRENTLY_SUPPORTED"
  | "UNVERIFIED";

export interface InfrastructureRequirements {
  staticIpRequired: boolean;
  /** Which capabilities the static-IP requirement actually applies to, if any —
   * broker requirements are frequently endpoint-scoped, not blanket (spec §93.7). */
  staticIpScope: Capability[];
  webhookEndpointRequired: boolean;
  totpMechanism: boolean;
  tokenLifetimeHours: number | null;
}

export interface BrokerAdapterMetadata {
  broker: BrokerId;
  apiVersion: string;
  authVersion: string;
  lastVerifiedDate: string; // ISO date
  docUrl: string;
  capabilityMap: Record<Capability, CapabilityStatus>;
  infrastructureRequirements: InfrastructureRequirements;
}

/**
 * No refreshToken: verified against Angel One's own SDK source that the redirect
 * login flow (the one that keeps the user's PIN/TOTP out of this codebase) returns
 * only auth_token and feed_token — a refresh token is only issued by the
 * password-based login this platform deliberately does not use. There is no silent
 * renewal path for this flow; expiresAt exists so the platform can monitor and warn
 * ahead of expiry (spec §38) and prompt the user through getLoginUrl() again.
 */
export interface AuthSession {
  accountRef: BrokerAccountRef;
  jwtToken: string;
  feedToken: string;
  expiresAt: string; // ISO 8601
}

export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BrokerAdapterError };

/**
 * Read-only for Phase 1 by design — CLAUDE.md forbids scaffolding order placement,
 * so there is no placeOrder/modifyOrder/cancelOrder here, even unimplemented.
 * getOrderBook/getTradeBook read existing state; they don't place anything.
 */
export interface BrokerAdapter {
  readonly metadata: BrokerAdapterMetadata;

  /** Builds the redirect URL the user is sent to; no credentials pass through this app. */
  getLoginUrl(params: { redirectUrl: string; state?: string }): string;
  /** Exchanges the redirect callback's query params for a session. No refresh path
   * exists for this flow — see AuthSession. */
  completeLogin(
    callbackParams: Record<string, string>,
  ): Promise<AdapterResult<AuthSession>>;

  /**
   * `accountId` is the platform-assigned canonical id for this connection (created
   * when the user connected the broker), passed in by the caller — an adapter has no
   * business minting platform-level ids, only broker-side ones.
   */
  getAccount(session: AuthSession): Promise<AdapterResult<Account>>;
  getHoldings(session: AuthSession, accountId: string): Promise<AdapterResult<Holding[]>>;
  getPositions(session: AuthSession, accountId: string): Promise<AdapterResult<Position[]>>;
  getFunds(session: AuthSession, accountId: string): Promise<AdapterResult<FundsSnapshot>>;
  getOrderBook(session: AuthSession, accountId: string): Promise<AdapterResult<Order[]>>;
  getTradeBook(session: AuthSession, accountId: string): Promise<AdapterResult<Trade[]>>;

  /**
   * Historical OHLCV bars for one instrument. Market data, not account data — hence
   * no accountId: the session authenticates the request, but the result belongs to
   * the instrument, not to the connected account.
   */
  getCandles(
    session: AuthSession,
    request: CandleRequest,
  ): Promise<AdapterResult<Candle[]>>;
}
