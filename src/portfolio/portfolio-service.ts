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
 * Sector/asset/broker exposure percentages from spec §15 are NOT included in this
 * pass — kept deliberately minimal given the strictest scope option was chosen: raw
 * holdings and values only, not the fuller composition-breakdown feature set.
 */
import type { Pool } from "pg";

export interface AccountHoldingRow {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  instrumentType: string;
  accountId: string;
  accountDisplayName: string;
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
  byAccount: {
    accountId: string;
    accountDisplayName: string;
    quantity: number;
    averagePrice: number;
    currentValue: number;
  }[];
}

export interface UnifiedPortfolio {
  totalCurrentValue: number;
  totalInvestedValue: number;
  totalCash: number;
  totalMargin: number;
  holdingCount: number;
  holdings: HoldingAggregate[];
}

async function fetchHoldingRows(pool: Pool, accountId?: string): Promise<AccountHoldingRow[]> {
  const result = await pool.query(
    `select
       h.instrument_id, iv.trading_symbol, i.exchange, i.instrument_type,
       h.account_id, a.display_name as account_display_name,
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
      quantity: row.quantity,
      averagePrice: row.averagePrice,
      currentValue: row.currentValue,
    });
  }
  return Array.from(byInstrument.values());
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
  return {
    totalCurrentValue: holdings.reduce((sum, h) => sum + h.totalCurrentValue, 0),
    totalInvestedValue: holdings.reduce((sum, h) => sum + h.totalInvestedValue, 0),
    totalCash,
    totalMargin,
    holdingCount: holdings.length,
    holdings,
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
  }[];
}

export async function getAccountPortfolio(pool: Pool, accountId: string): Promise<AccountPortfolio> {
  const rows = await fetchHoldingRows(pool, accountId);
  const { totalCash, totalMargin } = await fetchLatestFundsTotals(pool, accountId);
  return {
    accountId,
    totalCurrentValue: rows.reduce((sum, r) => sum + r.currentValue, 0),
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
    })),
  };
}
