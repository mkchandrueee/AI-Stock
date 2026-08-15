/**
 * Compares stored (previously synced) state against freshly fetched broker state and
 * classifies every difference — spec §13, .claude/rules/reconciliation.md. Pure, no
 * I/O: takes two snapshots, returns findings. Orchestration (reading stored state,
 * calling the adapter, deciding what to do with the findings) lives in
 * reconciliation-service.ts.
 *
 * The severity split (INFORMATIONAL vs REQUIRES_ATTENTION) below is this
 * implementation's own judgment call, not something reconciliation.md specifies
 * precisel — flagged as a design decision to revisit, not presented as settled:
 * - INFORMATIONAL: new data that doesn't contradict anything we already believed
 *   (a new holding appeared, an order's status legitimately progressed, a trade was
 *   observed — every trade is external in Phase 1 since nothing here places orders).
 * - REQUIRES_ATTENTION: something that contradicts what we expected, which could mean
 *   a real event (the user acted outside the platform) or a broker-side glitch, and
 *   reconciliation's job is to say "these disagree," not guess which.
 */
import type { Holding, Order, Trade } from "../core/types.js";

export type ReconciliationFinding =
  | { kind: "MISSING_HOLDING"; instrumentId: string; storedQuantity: number }
  | { kind: "NEW_HOLDING"; instrumentId: string; freshQuantity: number }
  | { kind: "HOLDING_QUANTITY_MISMATCH"; instrumentId: string; storedQuantity: number; freshQuantity: number }
  | { kind: "MISSING_ORDER"; brokerOrderId: string }
  | { kind: "UNEXPECTED_ORDER"; brokerOrderId: string }
  | { kind: "STALE_STATUS"; brokerOrderId: string; storedStatus: string; freshStatus: string }
  | { kind: "PRICE_MISMATCH"; brokerOrderId: string; storedPrice: number | null; freshPrice: number | null }
  | { kind: "MISSING_FILL"; brokerOrderId: string }
  | { kind: "EXTERNAL_TRADE"; brokerTradeId: string };

const REQUIRES_ATTENTION: ReadonlySet<ReconciliationFinding["kind"]> = new Set([
  "MISSING_HOLDING",
  "HOLDING_QUANTITY_MISMATCH",
  "MISSING_ORDER",
  "PRICE_MISMATCH",
  "MISSING_FILL",
]);

export function severityOf(kind: ReconciliationFinding["kind"]): "REQUIRES_ATTENTION" | "INFORMATIONAL" {
  return REQUIRES_ATTENTION.has(kind) ? "REQUIRES_ATTENTION" : "INFORMATIONAL";
}

export function reconcileHoldings(stored: Holding[], fresh: Holding[]): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const storedByInstrument = new Map(stored.map((h) => [h.instrumentId, h]));
  const freshByInstrument = new Map(fresh.map((h) => [h.instrumentId, h]));

  for (const [instrumentId, storedHolding] of storedByInstrument) {
    const freshHolding = freshByInstrument.get(instrumentId);
    if (!freshHolding) {
      findings.push({ kind: "MISSING_HOLDING", instrumentId, storedQuantity: storedHolding.quantity });
    } else if (freshHolding.quantity !== storedHolding.quantity) {
      findings.push({
        kind: "HOLDING_QUANTITY_MISMATCH",
        instrumentId,
        storedQuantity: storedHolding.quantity,
        freshQuantity: freshHolding.quantity,
      });
    }
  }
  for (const [instrumentId, freshHolding] of freshByInstrument) {
    if (!storedByInstrument.has(instrumentId)) {
      findings.push({ kind: "NEW_HOLDING", instrumentId, freshQuantity: freshHolding.quantity });
    }
  }
  return findings;
}

export function reconcileOrders(stored: Order[], fresh: Order[]): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const storedById = new Map(stored.map((o) => [o.brokerOrderId, o]));
  const freshById = new Map(fresh.map((o) => [o.brokerOrderId, o]));

  for (const [brokerOrderId, storedOrder] of storedById) {
    const freshOrder = freshById.get(brokerOrderId);
    if (!freshOrder) {
      findings.push({ kind: "MISSING_ORDER", brokerOrderId });
      continue;
    }
    if (freshOrder.status !== storedOrder.status) {
      findings.push({
        kind: "STALE_STATUS",
        brokerOrderId,
        storedStatus: storedOrder.status,
        freshStatus: freshOrder.status,
      });
    }
    if (freshOrder.price !== storedOrder.price) {
      findings.push({
        kind: "PRICE_MISMATCH",
        brokerOrderId,
        storedPrice: storedOrder.price,
        freshPrice: freshOrder.price,
      });
    }
  }
  for (const brokerOrderId of freshById.keys()) {
    if (!storedById.has(brokerOrderId)) {
      findings.push({ kind: "UNEXPECTED_ORDER", brokerOrderId });
    }
  }
  return findings;
}

/**
 * Every trade observed is external (spec §14) — Phase 1 has no order-placement path,
 * so nothing here could ever have been platform-originated. "New trade we haven't
 * recorded yet" and "external trade" are the same fact in Phase 1's scope.
 *
 * Also checks orders against trades for MISSING_FILL: an order reporting filled
 * quantity with no corresponding trade record is a real data inconsistency, not
 * informational — could mean the trade book's retention window already dropped it
 * (see docs/design/angel-one-verification.md's flagged risk on trade book scope).
 */
export function reconcileTrades(
  storedTrades: Trade[],
  freshTrades: Trade[],
  freshOrders: Order[],
): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const storedTradeIds = new Set(storedTrades.map((t) => t.brokerTradeId));

  for (const trade of freshTrades) {
    if (!storedTradeIds.has(trade.brokerTradeId)) {
      findings.push({ kind: "EXTERNAL_TRADE", brokerTradeId: trade.brokerTradeId });
    }
  }

  const tradesByOrderId = new Set(freshTrades.map((t) => t.brokerOrderId));
  for (const order of freshOrders) {
    const hasFills = order.status === "COMPLETE" || order.status === "PARTIALLY_FILLED";
    if (hasFills && order.filledQuantity > 0 && !tradesByOrderId.has(order.brokerOrderId)) {
      findings.push({ kind: "MISSING_FILL", brokerOrderId: order.brokerOrderId });
    }
  }

  return findings;
}
