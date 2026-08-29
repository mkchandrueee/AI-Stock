/**
 * Read views over the positions, orders, and trades that AccountSyncService already
 * persists (spec §16 — a broker-specific view shows holdings, positions, orders,
 * trades, funds and margin, not holdings alone). These were synced and stored from
 * the start; nothing surfaced them, so they were invisible outside the database.
 *
 * Deliberately omits unrealized P&L, which both `position` and `holding` carry in
 * storage. It's needed there for reconciliation, but CLAUDE.md's OUT-of-scope list
 * treats performance display as permanent, not merely deferred — the same rule
 * portfolio-service.ts already follows. Every other stored field is surfaced.
 *
 * Instrument identity is resolved through the Security Master join (spec §18), not
 * by carrying a broker symbol across the boundary — the same join
 * portfolio-service.ts uses, for the same reason.
 */
import type { Pool } from "pg";

/** Joined to every row below so a symbol can be displayed without the caller
 * needing a second lookup. Kept identical in shape across the three views. */
interface InstrumentRef {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  instrumentType: string;
}

const INSTRUMENT_JOIN = `
  join instrument i on i.instrument_id = x.instrument_id
  join instrument_version iv on iv.instrument_id = x.instrument_id and iv.effective_to is null`;

function instrumentRefOf(r: Record<string, unknown>): InstrumentRef {
  return {
    instrumentId: r["instrument_id"] as string,
    tradingSymbol: r["trading_symbol"] as string,
    exchange: r["exchange"] as string,
    instrumentType: r["instrument_type"] as string,
  };
}

export interface PositionView extends InstrumentRef {
  product: string;
  netQuantity: number;
  dayBuyQuantity: number;
  daySellQuantity: number;
  averagePrice: number;
  syncedAt: string;
}

export async function getAccountPositions(pool: Pool, accountId: string): Promise<PositionView[]> {
  const result = await pool.query(
    `select x.instrument_id, iv.trading_symbol, i.exchange, i.instrument_type,
            x.product, x.net_quantity, x.day_buy_quantity, x.day_sell_quantity,
            x.average_price, x.synced_at
     from position x ${INSTRUMENT_JOIN}
     where x.account_id = $1
     order by iv.trading_symbol, x.product`,
    [accountId],
  );
  return result.rows.map((r) => ({
    ...instrumentRefOf(r),
    product: r.product,
    netQuantity: Number(r.net_quantity),
    dayBuyQuantity: Number(r.day_buy_quantity),
    daySellQuantity: Number(r.day_sell_quantity),
    averagePrice: Number(r.average_price),
    syncedAt: r.synced_at.toISOString(),
  }));
}

export interface OrderView extends InstrumentRef {
  brokerOrderId: string;
  transactionType: string;
  quantity: number;
  filledQuantity: number;
  price: number | null;
  triggerPrice: number | null;
  status: string;
  /** Preserved alongside the canonical status, never replaced by it (rule 6). */
  brokerNativeStatus: string;
  /** Always EXTERNAL in Phase 1 — there is no order-placement path (spec §14). */
  origin: string;
  placedAt: string;
  updatedAt: string;
}

export async function getAccountOrders(pool: Pool, accountId: string): Promise<OrderView[]> {
  const result = await pool.query(
    `select x.instrument_id, iv.trading_symbol, i.exchange, i.instrument_type,
            x.broker_order_id, x.transaction_type, x.quantity, x.filled_quantity,
            x.price, x.trigger_price, x.status, x.broker_native_status, x.origin,
            x.placed_at, x.updated_at
     from broker_order x ${INSTRUMENT_JOIN}
     where x.account_id = $1
     order by x.placed_at desc`,
    [accountId],
  );
  return result.rows.map((r) => ({
    ...instrumentRefOf(r),
    brokerOrderId: r.broker_order_id,
    transactionType: r.transaction_type,
    quantity: Number(r.quantity),
    filledQuantity: Number(r.filled_quantity),
    price: r.price === null ? null : Number(r.price),
    triggerPrice: r.trigger_price === null ? null : Number(r.trigger_price),
    status: r.status,
    brokerNativeStatus: r.broker_native_status,
    origin: r.origin,
    placedAt: r.placed_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export interface TradeView extends InstrumentRef {
  brokerTradeId: string;
  brokerOrderId: string;
  transactionType: string;
  quantity: number;
  price: number;
  tradedAt: string;
}

export async function getAccountTrades(pool: Pool, accountId: string): Promise<TradeView[]> {
  const result = await pool.query(
    `select x.instrument_id, iv.trading_symbol, i.exchange, i.instrument_type,
            x.broker_trade_id, x.broker_order_id, x.transaction_type,
            x.quantity, x.price, x.traded_at
     from trade x ${INSTRUMENT_JOIN}
     where x.account_id = $1
     order by x.traded_at desc`,
    [accountId],
  );
  return result.rows.map((r) => ({
    ...instrumentRefOf(r),
    brokerTradeId: r.broker_trade_id,
    brokerOrderId: r.broker_order_id,
    transactionType: r.transaction_type,
    quantity: Number(r.quantity),
    price: Number(r.price),
    tradedAt: r.traded_at.toISOString(),
  }));
}
