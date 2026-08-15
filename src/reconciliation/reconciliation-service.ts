/**
 * Orchestrates one reconciliation cycle for an account: read stored state, fetch fresh
 * broker state, classify differences (reconciliation-engine.ts), log the run, and only
 * write the fresh state via AccountSyncService if nothing REQUIRES_ATTENTION was found.
 *
 * This is the actual enforcement of "never silently overwrite" (reconciliation.md):
 * if any finding needs attention, the sync write is skipped entirely for this cycle —
 * stored state is left exactly as it was, and the run is marked
 * RECONCILIATION_REQUIRED rather than quietly proceeding to overwrite it with
 * unexplained data. This is an account-level gate (block the whole cycle), not a
 * row-level one (block only the disputed holding) — simpler to reason about correctly
 * for Phase 1's scale; a row-level gate would be more surgical but isn't built here.
 *
 * IMPORTANT: node-postgres returns NUMERIC columns as strings, not numbers, to avoid
 * silent precision loss. Every numeric field read back from storage is explicitly
 * coerced with Number(...) below — comparing a stored string against a fetched number
 * with !== would otherwise always report a mismatch that isn't real.
 */
import type { Pool } from "pg";
import type { AuthSession, BrokerAdapter } from "../core/broker-adapter.js";
import type { Holding, Order, Trade } from "../core/types.js";
import { AccountSyncService } from "../sync/account-sync-service.js";
import {
  reconcileHoldings,
  reconcileOrders,
  reconcileTrades,
  severityOf,
  type ReconciliationFinding,
} from "./reconciliation-engine.js";

export interface ReconciliationResult {
  runId: string;
  status: "CLEAN" | "RECONCILIATION_REQUIRED";
  findings: ReconciliationFinding[];
}

export class ReconciliationService {
  constructor(
    private readonly pool: Pool,
    private readonly adapter: BrokerAdapter,
  ) {}

  async reconcile(
    session: AuthSession,
    accountId: string,
    trigger: "SCHEDULED" | "RECONNECT" | "MANUAL",
  ): Promise<ReconciliationResult> {
    const runId = await this.startRun(accountId, trigger);

    const [storedHoldings, storedOrders, storedTrades] = await Promise.all([
      this.readStoredHoldings(accountId),
      this.readStoredOrders(accountId),
      this.readStoredTrades(accountId),
    ]);

    const [freshHoldingsResult, freshOrdersResult, freshTradesResult] = await Promise.all([
      this.adapter.getHoldings(session, accountId),
      this.adapter.getOrderBook(session, accountId),
      this.adapter.getTradeBook(session, accountId),
    ]);

    if (!freshHoldingsResult.ok || !freshOrdersResult.ok || !freshTradesResult.ok) {
      await this.finishRun(runId, "FAILED");
      throw new Error(
        `reconciliation fetch failed: ${JSON.stringify({
          holdings: freshHoldingsResult.ok ? "ok" : freshHoldingsResult.error,
          orders: freshOrdersResult.ok ? "ok" : freshOrdersResult.error,
          trades: freshTradesResult.ok ? "ok" : freshTradesResult.error,
        })}`,
      );
    }

    const findings: ReconciliationFinding[] = [
      ...reconcileHoldings(storedHoldings, freshHoldingsResult.value),
      ...reconcileOrders(storedOrders, freshOrdersResult.value),
      ...reconcileTrades(storedTrades, freshTradesResult.value, freshOrdersResult.value),
    ];

    await this.recordFindings(runId, findings);

    const requiresAttention = findings.some((f) => severityOf(f.kind) === "REQUIRES_ATTENTION");

    if (requiresAttention) {
      await this.finishRun(runId, "RECONCILIATION_REQUIRED");
      return { runId, status: "RECONCILIATION_REQUIRED", findings };
    }

    // Clean: safe to write the fresh state now that it's been compared, not before.
    // Reuses the data already fetched above rather than re-fetching from the broker —
    // see the file header on AccountSyncService for why that matters.
    const syncService = new AccountSyncService(this.pool, this.adapter);
    await syncService.persistHoldings(freshHoldingsResult.value);
    await syncService.persistOrders(freshOrdersResult.value);
    await syncService.persistTrades(freshTradesResult.value);
    // Positions/funds are synced unconditionally here — they aren't part of this
    // reconciliation pass yet (reconcileHoldings/reconcileOrders/reconcileTrades only).
    // Positions have the same theoretical "disappearance is ambiguous" risk holdings
    // do; that reconciliation isn't built, which is a real gap, not an oversight to
    // hide — see docs/design/reconciliation.md. These two still fetch, since nothing
    // else has already retrieved them.
    await syncService.syncPositions(session, accountId);
    await syncService.syncFunds(session, accountId);

    await this.finishRun(runId, "CLEAN");
    return { runId, status: "CLEAN", findings };
  }

  private async startRun(accountId: string, trigger: string): Promise<string> {
    const result = await this.pool.query<{ run_id: string }>(
      `insert into reconciliation_run (account_id, trigger) values ($1, $2) returning run_id`,
      [accountId, trigger],
    );
    return result.rows[0]!.run_id;
  }

  private async finishRun(runId: string, status: string): Promise<void> {
    await this.pool.query(
      `update reconciliation_run set status = $1, completed_at = now() where run_id = $2`,
      [status, runId],
    );
  }

  private async recordFindings(runId: string, findings: ReconciliationFinding[]): Promise<void> {
    for (const finding of findings) {
      const { kind, ...details } = finding;
      await this.pool.query(
        `insert into reconciliation_finding (run_id, kind, severity, details)
         values ($1, $2, $3, $4)`,
        [runId, kind, severityOf(kind), JSON.stringify(details)],
      );
    }
  }

  private async readStoredHoldings(accountId: string): Promise<Holding[]> {
    const result = await this.pool.query(
      `select account_id, instrument_id, quantity, t1_quantity, average_price,
              last_traded_price, current_value, unrealized_pnl, product, broker_native
       from holding where account_id = $1`,
      [accountId],
    );
    return result.rows.map((r) => ({
      accountId: r.account_id,
      instrumentId: r.instrument_id,
      quantity: Number(r.quantity),
      t1Quantity: Number(r.t1_quantity),
      averagePrice: Number(r.average_price),
      lastTradedPrice: Number(r.last_traded_price),
      currentValue: Number(r.current_value),
      unrealizedPnl: Number(r.unrealized_pnl),
      product: r.product,
      brokerNative: r.broker_native,
    }));
  }

  private async readStoredOrders(accountId: string): Promise<Order[]> {
    const result = await this.pool.query(
      `select account_id, broker_order_id, instrument_id, transaction_type, quantity,
              filled_quantity, price, trigger_price, status, broker_native_status,
              origin, placed_at, updated_at, broker_native
       from broker_order where account_id = $1`,
      [accountId],
    );
    return result.rows.map((r) => ({
      accountId: r.account_id,
      brokerOrderId: r.broker_order_id,
      instrumentId: r.instrument_id,
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
      brokerNative: r.broker_native,
    }));
  }

  private async readStoredTrades(accountId: string): Promise<Trade[]> {
    const result = await this.pool.query(
      `select account_id, broker_trade_id, broker_order_id, instrument_id,
              transaction_type, quantity, price, traded_at, broker_native
       from trade where account_id = $1`,
      [accountId],
    );
    return result.rows.map((r) => ({
      accountId: r.account_id,
      brokerTradeId: r.broker_trade_id,
      brokerOrderId: r.broker_order_id,
      instrumentId: r.instrument_id,
      transactionType: r.transaction_type,
      quantity: Number(r.quantity),
      price: Number(r.price),
      tradedAt: r.traded_at.toISOString(),
      brokerNative: r.broker_native,
    }));
  }
}
