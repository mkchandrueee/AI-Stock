/**
 * Broker adapter contract (spec §4, §40; broker-adapters.md). No implementation here —
 * see docs/design/canonical-model-and-adapter-interface.md for rationale.
 */

import type {
  Account,
  BrokerAccountRef,
  BrokerAdapterError,
  BrokerId,
  FundsSnapshot,
  Holding,
  Order,
  Position,
  Trade,
} from "./types";

/** Full capability vocabulary from spec §1/§5 — not just what Phase 1 uses, so a
 * second broker's adapter slots into the same matrix without redefinition. */
export type Capability =
  | "LOGIN"
  | "HOLDINGS"
  | "POSITIONS"
  | "ORDER_BOOK"
  | "TRADE_BOOK"
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

export interface AuthSession {
  accountRef: BrokerAccountRef;
  jwtToken: string;
  refreshToken: string;
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

  authenticate(credentials: unknown): Promise<AdapterResult<AuthSession>>;
  refreshSession(session: AuthSession): Promise<AdapterResult<AuthSession>>;

  getAccount(session: AuthSession): Promise<AdapterResult<Account>>;
  getHoldings(session: AuthSession): Promise<AdapterResult<Holding[]>>;
  getPositions(session: AuthSession): Promise<AdapterResult<Position[]>>;
  getFunds(session: AuthSession): Promise<AdapterResult<FundsSnapshot>>;
  getOrderBook(session: AuthSession): Promise<AdapterResult<Order[]>>;
  getTradeBook(session: AuthSession): Promise<AdapterResult<Trade[]>>;
}
