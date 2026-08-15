/**
 * Canonical account model (spec §4). No broker-specific field name or type may
 * cross this boundary — see docs/design/canonical-model-and-adapter-interface.md.
 */

export type BrokerId = "ANGEL_ONE";

/** Opaque broker-assigned identifier. Never parsed or interpreted outside the adapter. */
export type BrokerAccountRef = string;

/** Canonical Security Master reference — see docs/design/security-master.md. */
export type InstrumentId = string;

export interface Account {
  accountId: string;
  brokerId: BrokerId;
  brokerAccountRef: BrokerAccountRef;
  displayName: string;
  exchanges: string[];
  products: string[];
}

export interface FundsSnapshot {
  accountId: string;
  asOf: string; // ISO 8601
  availableCash: number;
  utilisedMargin: number;
  collateral: number;
  net: number;
  brokerNative: unknown;
}

export interface Holding {
  accountId: string;
  instrumentId: InstrumentId;
  quantity: number;
  t1Quantity: number;
  averagePrice: number;
  lastTradedPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  product: string;
  brokerNative: unknown;
}

export interface Position {
  accountId: string;
  instrumentId: InstrumentId;
  netQuantity: number;
  dayBuyQuantity: number;
  daySellQuantity: number;
  product: string;
  averagePrice: number;
  unrealizedPnl: number;
  brokerNative: unknown;
}

export type OrderStatus =
  | "CREATED"
  | "VALIDATING"
  | "APPROVED"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "COMPLETE"
  | "REJECTED"
  | "CANCEL_PENDING"
  | "CANCELLED"
  | "FAILED"
  | "EXPIRED";

export interface Order {
  accountId: string;
  brokerOrderId: string;
  instrumentId: InstrumentId;
  transactionType: "BUY" | "SELL";
  quantity: number;
  filledQuantity: number;
  price: number | null;
  triggerPrice: number | null;
  status: OrderStatus;
  /** Unmapped, as returned by the broker. Never discarded — spec §11, rule 6. */
  brokerNativeStatus: string;
  /** Phase 1 has no order-placement path; every order observed is external. */
  origin: "EXTERNAL";
  placedAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  brokerNative: unknown;
}

export interface Trade {
  accountId: string;
  brokerTradeId: string;
  brokerOrderId: string;
  instrumentId: InstrumentId;
  transactionType: "BUY" | "SELL";
  quantity: number;
  price: number;
  tradedAt: string; // ISO 8601
  brokerNative: unknown;
}

/**
 * Canonical adapter errors (broker-adapters.md). Each broker error must be mapped to
 * exactly one of these — never passed through as a broker-specific code or message.
 */
export type BrokerAdapterError =
  | { kind: "TOKEN_EXPIRED" }
  | { kind: "MARKET_CLOSED" }
  | { kind: "RATE_LIMITED"; retryAfterMs?: number }
  | { kind: "NETWORK_TIMEOUT" }
  | { kind: "PARTIAL_DATA"; missing: string[] }
  | { kind: "MALFORMED_RESPONSE"; detail: string }
  | { kind: "UNEXPECTED_STATUS"; httpStatus: number };
