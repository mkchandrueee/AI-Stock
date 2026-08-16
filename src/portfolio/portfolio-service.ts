/**
 * Unified and per-account portfolio views (spec §15, §16) with duplicate holding
 * aggregation (spec §17). Deliberately excludes P&L/performance figures — CLAUDE.md's
 * Phase 1 OUT-of-scope list is explicit: "Performance display. No win rates, no
 * returns, no statistics shown to a user." Confirmed with the user rather than
 * resolved by picking a reading: no P&L anywhere in this view, not even what the
 * broker itself already reports (holding.unrealized_pnl exists in storage — it's
 * needed for reconciliation — it's just never surfaced here).
 *
 * totalCurrentValue and totalInvestedValue are included: they're aggregations of raw
 * stored fields (quantity × price), not derived performance statistics — they don't
 * say whether the user is up or down, only what's currently held and what was paid.
 *
 * Asset-type and broker exposure, and per-holding concentration weight, ARE included
 * (unlike the earlier pass) — see docs/design/ai-holding-analysis-blueprint.md: none
 * of these are return/performance figures, they're weight computations over data
 * already stored (current value ÷ total), so they don't touch the P&L question above.
 * Sector exposure (spec §15) is still NOT included — the Security Master has no
 * sector classification field at all (spec §18's mapped fields are identity/contract
 * fields, not GICS/sector), and inventing one would violate "no fabricated data."
 */
import type { Pool } from "pg";

export interface AccountHoldingRow {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  instrumentType: string;
  accountId: string;
  accountDisplayName: string;
  broker: string;
  quantity: number;
  averagePrice: number;
  currentValue: number;
}

export interface HoldingAggregate {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  instrumentType: string;
  totalQuantity: number;
  totalCurrentValue: number;
  totalInvestedValue: number;
  /** Share of this holding in the portfolio's total current value, 0-100.
   * Concentration risk (spec §20) reduced to its arithmetic form — a weight, not a
   * return, so it doesn't touch the P&L question in the file header above. */
  weightPct: number;
  byAccount: {
    accountId: string;
    accountDisplayName: string;
    broker: string;
    quantity: number;
    averagePrice: number;
    currentValue: number;
  }[];
}

/** A grouping of current value by some dimension (instrument type, broker), each
 * bucket's share of the whole — spec §15's exposure fields, minus sector (see file
 * header) and minus anything return-based. */
export interface ExposureBucket {
  label: string;
  value: number;
  pct: number;
}

function computeExposure<T>(
  items: T[],
  labelOf: (item: T) => string,
  valueOf: (item: T) => number,
): ExposureBucket[] {
  const totalsByLabel = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    const value = valueOf(item);
    total += value;
    totalsByLabel.set(labelOf(item), (totalsByLabel.get(labelOf(item)) ?? 0) + value);
  }
  return Array.from(totalsByLabel.entries())
    .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface UnifiedPortfolio {
  totalCurrentValue: number;
  totalInvestedValue: number;
  totalCash: number;
  totalMargin: number;
  holdingCount: number;
  holdings: HoldingAggregate[];
  assetTypeExposure: ExposureBucket[];
  brokerExposure: ExposureBucket[];
}

async function fetchHoldingRows(pool: Pool, accountId?: string): Promise<AccountHoldingRow[]> {
  const result = await pool.query(
    `select
       h.instrument_id, iv.trading_symbol, i.exchange, i.instrument_type,
       h.account_id, a.display_name as account_display_name, a.broker,
       h.quantity, h.average_price, h.current_value
     from holding h
     join instrument i on i.instrument_id = h.instrument_id
     join instrument_version iv on iv.instrument_id = h.instrument_id and iv.effective_to is null
     join account a on a.account_id = h.account_id
     ${accountId ? "where h.account_id = $1" : ""}
     order by iv.trading_symbol, a.display_name`,
    accountId ? [accountId] : [],
  );
  return result.rows.map((r) => ({
    instrumentId: r.instrument_id,
    tradingSymbol: r.trading_symbol,
    exchange: r.exchange,
    instrumentType: r.instrument_type,
    accountId: r.account_id,
    accountDisplayName: r.account_display_name,
    broker: r.broker,
    quantity: Number(r.quantity),
    averagePrice: Number(r.average_price),
    currentValue: Number(r.current_value),
  }));
}

/** Sums the same instrument across accounts into one line (spec §17) — never shows
 * the same instrument as separate, uncombined rows just because it's held in more
 * than one connected account. */
function aggregateHoldings(rows: AccountHoldingRow[]): HoldingAggregate[] {
  const byInstrument = new Map<string, HoldingAggregate>();
  for (const row of rows) {
    let aggregate = byInstrument.get(row.instrumentId);
    if (!aggregate) {
      aggregate = {
        instrumentId: row.instrumentId,
        tradingSymbol: row.tradingSymbol,
        exchange: row.exchange,
        instrumentType: row.instrumentType,
        totalQuantity: 0,
        totalCurrentValue: 0,
        totalInvestedValue: 0,
        weightPct: 0, // filled in by the caller once the portfolio total is known
        byAccount: [],
      };
      byInstrument.set(row.instrumentId, aggregate);
    }
    aggregate.totalQuantity += row.quantity;
    aggregate.totalCurrentValue += row.currentValue;
    aggregate.totalInvestedValue += row.quantity * row.averagePrice;
    aggregate.byAccount.push({
      accountId: row.accountId,
      accountDisplayName: row.accountDisplayName,
      broker: row.broker,
      quantity: row.quantity,
      averagePrice: row.averagePrice,
      currentValue: row.currentValue,
    });
  }
  return Array.from(byInstrument.values());
}

/** Mutates weightPct on each aggregate in place — a holding's share of the total
 * current value passed in, 0 if the total is 0 (avoids a divide-by-zero NaN). */
function applyWeights(holdings: HoldingAggregate[], totalCurrentValue: number): void {
  for (const h of holdings) {
    h.weightPct = totalCurrentValue > 0 ? (h.totalCurrentValue / totalCurrentValue) * 100 : 0;
  }
}

async function fetchLatestFundsTotals(
  pool: Pool,
  accountId?: string,
): Promise<{ totalCash: number; totalMargin: number }> {
  const result = await pool.query(
    `select distinct on (account_id) account_id, available_cash, utilised_margin
     from funds_snapshot
     ${accountId ? "where account_id = $1" : ""}
     order by account_id, as_of desc`,
    accountId ? [accountId] : [],
  );
  let totalCash = 0;
  let totalMargin = 0;
  for (const row of result.rows) {
    totalCash += Number(row.available_cash);
    totalMargin += Number(row.utilised_margin);
  }
  return { totalCash, totalMargin };
}

export async function getUnifiedPortfolio(pool: Pool): Promise<UnifiedPortfolio> {
  const rows = await fetchHoldingRows(pool);
  const holdings = aggregateHoldings(rows);
  const { totalCash, totalMargin } = await fetchLatestFundsTotals(pool);
  const totalCurrentValue = holdings.reduce((sum, h) => sum + h.totalCurrentValue, 0);
  applyWeights(holdings, totalCurrentValue);
  return {
    totalCurrentValue,
    totalInvestedValue: holdings.reduce((sum, h) => sum + h.totalInvestedValue, 0),
    totalCash,
    totalMargin,
    holdingCount: holdings.length,
    holdings,
    assetTypeExposure: computeExposure(holdings, (h) => h.instrumentType, (h) => h.totalCurrentValue),
    brokerExposure: computeExposure(rows, (r) => r.broker, (r) => r.currentValue),
  };
}

export interface AccountPortfolio {
  accountId: string;
  totalCurrentValue: number;
  totalInvestedValue: number;
  cash: number;
  margin: number;
  holdings: {
    instrumentId: string;
    tradingSymbol: string;
    exchange: string;
    instrumentType: string;
    quantity: number;
    averagePrice: number;
    currentValue: number;
    weightPct: number;
  }[];
  assetTypeExposure: ExposureBucket[];
}

export async function getAccountPortfolio(pool: Pool, accountId: string): Promise<AccountPortfolio> {
  const rows = await fetchHoldingRows(pool, accountId);
  const { totalCash, totalMargin } = await fetchLatestFundsTotals(pool, accountId);
  const totalCurrentValue = rows.reduce((sum, r) => sum + r.currentValue, 0);
  return {
    accountId,
    totalCurrentValue,
    totalInvestedValue: rows.reduce((sum, r) => sum + r.quantity * r.averagePrice, 0),
    cash: totalCash,
    margin: totalMargin,
    holdings: rows.map((r) => ({
      instrumentId: r.instrumentId,
      tradingSymbol: r.tradingSymbol,
      exchange: r.exchange,
      instrumentType: r.instrumentType,
      quantity: r.quantity,
      averagePrice: r.averagePrice,
      currentValue: r.currentValue,
      weightPct: totalCurrentValue > 0 ? (r.currentValue / totalCurrentValue) * 100 : 0,
    })),
    assetTypeExposure: computeExposure(rows, (r) => r.instrumentType, (r) => r.currentValue),
  };
}
