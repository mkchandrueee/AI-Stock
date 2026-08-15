/**
 * Drives a BrokerAdapter with an already-established session and persists the results
 * against migrations/0002_account_data.sql. Does NOT handle obtaining the session
 * itself (the getLoginUrl/completeLogin redirect flow needs an HTTP layer that doesn't
 * exist yet — a separate decision, not assumed here).
 *
 * This is sync, not reconciliation, and the boundary is deliberate, not an oversight:
 * every write here is upsert-only. An earlier version of this file deleted holdings/
 * positions that were absent from a fresh fetch, on the reasoning that a successful
 * AdapterResult means every record resolved. That's true, but it doesn't mean the
 * broker's response was a complete picture — a transient partial response that still
 * reports `status: true` would cause real holdings to be silently deleted. Whether a
 * holding's disappearance means "the user sold it" or "the broker glitched" is exactly
 * the classification reconciliation.md and spec §13 say must be surfaced, not assumed:
 * "Never silently overwrite. A mismatch surfaces as RECONCILIATION_REQUIRED." So this
 * layer only ever records what it observed, stamped with `synced_at`; deciding what a
 * holding's absence from the latest sync *means* is reconciliation's job, not built yet.
 *
 * Holdings/orders/trades persistence is split from their fetch (persistX vs syncX)
 * because ReconciliationService already fetches all three to compare against stored
 * state — verified end-to-end testing caught the version where reconcile() then called
 * syncHoldings/syncOrders/syncTrades, which fetched the same data from the broker a
 * second time for no reason, doubling real API calls against endpoints whose rate
 * limits are already 1 req/sec (see angel-one-verification.md). Positions/funds don't
 * have this problem — nothing else fetches them first — so they stay fetch-and-persist.
 */
import type { Pool } from "pg";
import type { AuthSession, BrokerAdapter } from "../core/broker-adapter.js";
import type { Holding, Order, Trade } from "../core/types.js";

export type SyncResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export class AccountSyncService {
  constructor(
    private readonly pool: Pool,
    private readonly adapter: BrokerAdapter,
  ) {}

  async syncHoldings(session: AuthSession, accountId: string): Promise<SyncResult> {
    const result = await this.adapter.getHoldings(session, accountId);
    if (!result.ok) return { ok: false, error: describeError(result.error) };
    return this.persistHoldings(result.value);
  }

  async persistHoldings(holdings: Holding[]): Promise<SyncResult> {
    for (const h of holdings) {
      await this.pool.query(
        `insert into holding
           (account_id, instrument_id, quantity, t1_quantity, average_price,
            last_traded_price, current_value, unrealized_pnl, product, broker_native, synced_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         on conflict (account_id, instrument_id) do update set
           quantity = excluded.quantity,
           t1_quantity = excluded.t1_quantity,
           average_price = excluded.average_price,
           last_traded_price = excluded.last_traded_price,
           current_value = excluded.current_value,
           unrealized_pnl = excluded.unrealized_pnl,
           product = excluded.product,
           broker_native = excluded.broker_native,
           synced_at = now()`,
        [
          h.accountId, h.instrumentId, h.quantity, h.t1Quantity, h.averagePrice,
          h.lastTradedPrice, h.currentValue, h.unrealizedPnl, h.product,
          JSON.stringify(h.brokerNative),
        ],
      );
    }
    return { ok: true, count: holdings.length };
  }

  async syncPositions(session: AuthSession, accountId: string): Promise<SyncResult> {
    const result = await this.adapter.getPositions(session, accountId);
    if (!result.ok) return { ok: false, error: describeError(result.error) };
    for (const p of result.value) {
      await this.pool.query(
        `insert into position
           (account_id, instrument_id, product, net_quantity, day_buy_quantity,
            day_sell_quantity, average_price, unrealized_pnl, broker_native, synced_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         on conflict (account_id, instrument_id, product) do update set
           net_quantity = excluded.net_quantity,
           day_buy_quantity = excluded.day_buy_quantity,
           day_sell_quantity = excluded.day_sell_quantity,
           average_price = excluded.average_price,
           unrealized_pnl = excluded.unrealized_pnl,
           broker_native = excluded.broker_native,
           synced_at = now()`,
        [
          p.accountId, p.instrumentId, p.product, p.netQuantity, p.dayBuyQuantity,
          p.daySellQuantity, p.averagePrice, p.unrealizedPnl, JSON.stringify(p.brokerNative),
        ],
      );
    }
    return { ok: true, count: result.value.length };
  }

  async syncFunds(session: AuthSession, accountId: string): Promise<SyncResult> {
    const result = await this.adapter.getFunds(session, accountId);
    if (!result.ok) return { ok: false, error: describeError(result.error) };
    const f = result.value;
    await this.pool.query(
      `insert into funds_snapshot
         (account_id, as_of, available_cash, utilised_margin, collateral, net, broker_native, synced_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())`,
      [f.accountId, f.asOf, f.availableCash, f.utilisedMargin, f.collateral, f.net, JSON.stringify(f.brokerNative)],
    );
    return { ok: true, count: 1 };
  }

  async syncOrders(session: AuthSession, accountId: string): Promise<SyncResult> {
    const result = await this.adapter.getOrderBook(session, accountId);
    if (!result.ok) return { ok: false, error: describeError(result.error) };
    return this.persistOrders(result.value);
  }

  async persistOrders(orders: Order[]): Promise<SyncResult> {
    for (const o of orders) {
      await this.pool.query(
        `insert into broker_order
           (account_id, broker_order_id, instrument_id, transaction_type, quantity,
            filled_quantity, price, trigger_price, status, broker_native_status,
            origin, placed_at, updated_at, broker_native, synced_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
         on conflict (account_id, broker_order_id) do update set
           quantity = excluded.quantity,
           filled_quantity = excluded.filled_quantity,
           price = excluded.price,
           trigger_price = excluded.trigger_price,
           status = excluded.status,
           broker_native_status = excluded.broker_native_status,
           updated_at = excluded.updated_at,
           broker_native = excluded.broker_native,
           synced_at = now()`,
        [
          o.accountId, o.brokerOrderId, o.instrumentId, o.transactionType, o.quantity,
          o.filledQuantity, o.price, o.triggerPrice, o.status, o.brokerNativeStatus,
          o.origin, o.placedAt, o.updatedAt, JSON.stringify(o.brokerNative),
        ],
      );
    }
    return { ok: true, count: orders.length };
  }

  /** A fill never changes once it exists, so this is the one table where "do nothing
   * on conflict" (rather than update) is correct, not just convenient. */
  async syncTrades(session: AuthSession, accountId: string): Promise<SyncResult> {
    const result = await this.adapter.getTradeBook(session, accountId);
    if (!result.ok) return { ok: false, error: describeError(result.error) };
    return this.persistTrades(result.value);
  }

  async persistTrades(trades: Trade[]): Promise<SyncResult> {
    for (const t of trades) {
      await this.pool.query(
        `insert into trade
           (account_id, broker_trade_id, broker_order_id, instrument_id,
            transaction_type, quantity, price, traded_at, broker_native, synced_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         on conflict (account_id, broker_trade_id) do nothing`,
        [
          t.accountId, t.brokerTradeId, t.brokerOrderId, t.instrumentId,
          t.transactionType, t.quantity, t.price, t.tradedAt, JSON.stringify(t.brokerNative),
        ],
      );
    }
    return { ok: true, count: trades.length };
  }
}

function describeError(error: { kind: string }): string {
  return error.kind;
}
