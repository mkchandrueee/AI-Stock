/**
 * Raw Angel One response → canonical type mappers. Every mapper resolves the
 * instrument through InstrumentResolver (spec §18) — never constructs an
 * InstrumentId from a broker field directly.
 */
import type {
  FundsSnapshot,
  Holding,
  InstrumentId,
  Order,
  OrderStatus,
  Position,
  Trade,
} from "../../core/types.js";
import type {
  AngelOneHoldingRaw,
  AngelOneOrderRaw,
  AngelOnePositionRaw,
  AngelOneRmsRaw,
  AngelOneTradeRaw,
} from "./raw-types.js";

/** Angel One types symboltoken inconsistently (string in some responses, number in
 * others, null on some order records) — always coerce to a canonical string. */
export function coerceSymbolToken(value: string | number | null): string | null {
  if (value === null) return null;
  return String(value);
}

export function mapHolding(raw: AngelOneHoldingRaw, instrumentId: InstrumentId, accountId: string): Holding {
  return {
    accountId,
    instrumentId,
    quantity: raw.quantity,
    t1Quantity: raw.t1quantity,
    averagePrice: raw.averageprice,
    lastTradedPrice: raw.ltp,
    currentValue: raw.quantity * raw.ltp,
    unrealizedPnl: raw.profitandloss,
    product: raw.product,
    brokerNative: raw,
  };
}

export function mapPosition(raw: AngelOnePositionRaw, instrumentId: InstrumentId, accountId: string): Position {
  return {
    accountId,
    instrumentId,
    netQuantity: Number(raw.netqty),
    dayBuyQuantity: Number(raw.buyqty),
    daySellQuantity: Number(raw.sellqty),
    product: raw.producttype,
    averagePrice: Number(raw.avgnetprice),
    // Angel One's position response has no direct unrealized-P&L field in the
    // documented shape (unlike holdings, which has `profitandloss` directly).
    // Leaving this as a TODO rather than computing it from netvalue/ltp without a
    // confirmed live LTP on the same response — that would be inventing a formula
    // the docs don't state.
    unrealizedPnl: NaN,
    brokerNative: raw,
  };
}

export function mapFunds(raw: AngelOneRmsRaw, accountId: string): FundsSnapshot {
  return {
    accountId,
    asOf: new Date().toISOString(),
    availableCash: Number(raw.availablecash),
    utilisedMargin: Number(raw.utiliseddebits),
    collateral: Number(raw.collateral),
    net: Number(raw.net),
    brokerNative: raw,
  };
}

/**
 * Confirmed from doc examples: "cancelled" -> CANCELLED, "rejected" -> REJECTED.
 * Everything else below is a substring heuristic over standard order-lifecycle
 * vocabulary, NOT verified against a live Angel One response. Treat any status this
 * function has to guess at as provisional — see raw-types.ts.
 */
export function mapOrderStatus(raw: string): OrderStatus | null {
  const normalized = raw.toLowerCase();
  if (normalized.includes("cancel")) return "CANCELLED";
  if (normalized.includes("reject")) return "REJECTED";
  if (normalized.includes("complete") || normalized.includes("executed")) return "COMPLETE";
  if (normalized.includes("partial")) return "PARTIALLY_FILLED";
  if (normalized.includes("expire")) return "EXPIRED";
  if (normalized.includes("open") || normalized.includes("pending") || normalized.includes("trigger")) {
    return "OPEN";
  }
  // Unrecognized: return null and let the caller raise MALFORMED_RESPONSE rather
  // than silently default to some canonical status that may be wrong.
  return null;
}

export function mapOrder(raw: AngelOneOrderRaw, instrumentId: InstrumentId, accountId: string): Order | null {
  const status = mapOrderStatus(raw.orderstatus || raw.status);
  if (status === null) return null;
  return {
    accountId,
    brokerOrderId: String(raw.orderid),
    instrumentId,
    transactionType: raw.transactiontype,
    quantity: Number(raw.quantity),
    filledQuantity: Number(raw.filledshares),
    price: raw.price ? Number(raw.price) : null,
    triggerPrice: raw.triggerprice ? Number(raw.triggerprice) : null,
    status,
    brokerNativeStatus: raw.orderstatus || raw.status,
    origin: "EXTERNAL",
    placedAt: raw.updatetime,
    updatedAt: raw.exchtime || raw.updatetime,
    brokerNative: raw,
  };
}

export function mapTrade(raw: AngelOneTradeRaw, instrumentId: InstrumentId, accountId: string): Trade {
  return {
    accountId,
    brokerTradeId: raw.fillid,
    brokerOrderId: raw.orderid,
    instrumentId,
    transactionType: raw.transactiontype,
    quantity: Number(raw.fillsize),
    price: Number(raw.fillprice),
    // filltime is a bare time with no date in Angel One's response — see raw-types.ts.
    // Stamping with today's date is the best available reading of "current day only,"
    // not a guess at a date the response doesn't provide.
    tradedAt: `${new Date().toISOString().slice(0, 10)}T${raw.filltime}`,
    brokerNative: raw,
  };
}
