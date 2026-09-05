/**
 * Option chain assembly and the OI-derived measures built on it: put-call ratio,
 * max pain, and the strikes carrying the largest open interest ("walls").
 *
 * These are computations over exchange-published open interest — spec §92.2 lists
 * OI/PCR/max pain as derived metrics and classifies them T1 (ANALYZE). They describe
 * where positioning sits; none of them says what to do about it.
 *
 * Chain fetching relies on the adapter batching quotes: a 78-strike chain is two
 * broker calls, not 78. Without that, a chain would take over a minute at the
 * per-instrument rate limit and this feature would be unusable.
 */
import type { Pool } from "pg";
import type { AuthSession, BrokerAdapter } from "../core/broker-adapter.js";
import {
  atmStrike,
  computeOiStructure,
  daysToExpiry as computeDte,
  greeks,
  impliedVolatility,
  thetaPressure,
  type Greeks,
  type OiStructure,
} from "./option-metrics.js";

/**
 * Formats a DATE from Postgres as YYYY-MM-DD using LOCAL components.
 *
 * Not `toISOString().slice(0,10)`: node-postgres materialises a DATE as a JS Date at
 * local midnight, so in IST (UTC+5:30) that serialises to 18:30 the PREVIOUS day and
 * the calendar date silently shifts back by one. Observed directly — a 2026-09-29
 * expiry came back as "2026-09-28", which would then match no contracts at all.
 */
function formatLocalDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export interface ChainRow {
  strike: number;
  call: ChainSide | null;
  put: ChainSide | null;
}

export interface ChainSide {
  instrumentId: string;
  tradingSymbol: string;
  ltp: number;
  netChange: number;
  percentChange: number;
  openInterest: number | null;
  volume: number;
  /** Solved from this contract's own premium. Null when the premium admits no
   * solution — see impliedVolatility. */
  impliedVolatility: number | null;
  /** Computed at this contract's own IV. Null whenever IV is. */
  greeks: Greeks | null;
}

export interface OiWall {
  strike: number;
  openInterest: number;
  side: "CALL" | "PUT";
}

export interface OptionChain {
  underlyingSymbol: string;
  expiry: string;
  underlyingLtp: number | null;
  rows: ChainRow[];
  /** Total OI by side across the chain — the inputs to pcr, shown so the ratio can
   * be checked rather than taken on trust. */
  totalCallOi: number;
  totalPutOi: number;
  /** Put OI / Call OI. Null when call OI is zero: the ratio is undefined, and any
   * substituted number would be an invention. */
  pcr: number | null;
  /** Strike where total intrinsic value of open contracts is smallest. Null when the
   * chain has no OI at all to compute it from. */
  maxPain: number | null;
  topCallWalls: OiWall[];
  topPutWalls: OiWall[];
  /** ATM IV, IV skew (put IV - call IV) and the OI-structure measures ported from
   * AI-trader — see option-metrics.ts. */
  atmStrike: number | null;
  atmIv: number | null;
  ivSkew: number | null;
  daysToExpiry: number;
  thetaPressure: number | null;
  oiStructure: OiStructure;
  /** Contracts whose quote the broker didn't return — named, not silently missing. */
  missingQuotes: number;
}

/**
 * Max pain: the strike at which the total intrinsic value owed to option holders is
 * lowest, computed across every strike in the chain. Standard construction — for each
 * candidate settlement strike, sum call payoffs (max(0, S-K) * callOI) and put
 * payoffs (max(0, K-S) * putOI) across all strikes.
 */
export function computeMaxPain(rows: ChainRow[]): number | null {
  const withOi = rows.filter(
    (r) => (r.call?.openInterest ?? 0) > 0 || (r.put?.openInterest ?? 0) > 0,
  );
  if (withOi.length === 0) return null;

  let bestStrike: number | null = null;
  let lowestPain = Number.POSITIVE_INFINITY;

  for (const candidate of withOi) {
    const settlement = candidate.strike;
    let pain = 0;
    for (const row of withOi) {
      const callOi = row.call?.openInterest ?? 0;
      const putOi = row.put?.openInterest ?? 0;
      if (settlement > row.strike) pain += (settlement - row.strike) * callOi;
      if (settlement < row.strike) pain += (row.strike - settlement) * putOi;
    }
    if (pain < lowestPain) {
      lowestPain = pain;
      bestStrike = settlement;
    }
  }
  return bestStrike;
}

function topWalls(rows: ChainRow[], side: "CALL" | "PUT", count: number): OiWall[] {
  return rows
    .map((r) => ({
      strike: r.strike,
      openInterest: (side === "CALL" ? r.call?.openInterest : r.put?.openInterest) ?? 0,
      side,
    }))
    .filter((w) => w.openInterest > 0)
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, count);
}

export class OptionChainService {
  constructor(
    private readonly pool: Pool,
    private readonly adapter: BrokerAdapter,
  ) {}

  /** Expiries available for an underlying, nearest first — only future ones, since a
   * past expiry has no live chain to fetch. */
  async listExpiries(underlyingSymbol: string): Promise<string[]> {
    const result = await this.pool.query<{ expiry: Date }>(
      `select distinct i.expiry
       from instrument i
       join instrument u on u.instrument_id = i.underlying_instrument_id
       join instrument_version uv
         on uv.instrument_id = u.instrument_id and uv.effective_to is null
       where uv.trading_symbol = $1
         and i.instrument_type = 'OPTIONS'
         and i.expiry >= current_date
       order by i.expiry`,
      [underlyingSymbol],
    );
    return result.rows.map((r) => formatLocalDate(r.expiry));
  }

  async getChain(
    session: AuthSession,
    underlyingSymbol: string,
    expiry: string,
  ): Promise<{ ok: true; chain: OptionChain } | { ok: false; reason: string }> {
    const contracts = await this.pool.query<{
      instrument_id: string;
      trading_symbol: string;
      strike: string;
      option_type: string;
      underlying_id: string;
    }>(
      `select i.instrument_id, iv.trading_symbol, i.strike, i.option_type,
              u.instrument_id as underlying_id
       from instrument i
       join instrument_version iv
         on iv.instrument_id = i.instrument_id and iv.effective_to is null
       join instrument u on u.instrument_id = i.underlying_instrument_id
       join instrument_version uv
         on uv.instrument_id = u.instrument_id and uv.effective_to is null
       where uv.trading_symbol = $1
         and i.instrument_type = 'OPTIONS'
         and i.expiry = $2
       order by i.strike`,
      [underlyingSymbol, expiry],
    );

    if (contracts.rows.length === 0) {
      return { ok: false, reason: `no option contracts for ${underlyingSymbol} expiring ${expiry}` };
    }

    const underlyingId = contracts.rows[0]!.underlying_id;
    const ids = contracts.rows.map((r) => r.instrument_id);
    // The underlying's own quote rides along in the same batch — it's needed to place
    // the chain relative to spot, and costs nothing extra.
    const quoteResult = await this.adapter.getQuotes(session, [...ids, underlyingId]);
    if (!quoteResult.ok) {
      return { ok: false, reason: `broker error: ${(quoteResult.error as { kind: string }).kind}` };
    }
    const quoteById = new Map(quoteResult.value.map((q) => [q.instrumentId, q]));

    // Spot and days-to-expiry are needed before any per-contract IV can be solved.
    const spot = quoteById.get(underlyingId)?.ltp ?? null;
    const dte = computeDte(expiry);

    const byStrike = new Map<number, ChainRow>();
    let missingQuotes = 0;
    for (const row of contracts.rows) {
      const strike = Number(row.strike);
      const quote = quoteById.get(row.instrument_id);
      if (!quote) {
        missingQuotes++;
        continue;
      }
      const optionType = row.option_type === "CE" ? "CE" : "PE";
      const iv =
        spot === null
          ? null
          : impliedVolatility(quote.ltp, spot, strike, Math.max(dte, 1), optionType);
      const side: ChainSide = {
        instrumentId: row.instrument_id,
        tradingSymbol: row.trading_symbol,
        ltp: quote.ltp,
        netChange: quote.netChange,
        percentChange: quote.percentChange,
        openInterest: quote.openInterest,
        volume: quote.tradeVolume,
        impliedVolatility: iv,
        greeks:
          iv === null || spot === null
            ? null
            : greeks(
                { spot, strike, timeToExpiry: Math.max(dte, 1) / 365, volatility: iv },
                optionType,
              ),
      };
      const entry = byStrike.get(strike) ?? { strike, call: null, put: null };
      if (row.option_type === "CE") entry.call = side;
      else entry.put = side;
      byStrike.set(strike, entry);
    }

    const rows = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
    const totalCallOi = rows.reduce((sum, r) => sum + (r.call?.openInterest ?? 0), 0);
    const totalPutOi = rows.reduce((sum, r) => sum + (r.put?.openInterest ?? 0), 0);

    const oiStrikes = rows.map((r) => ({
      strike: r.strike,
      callOi: r.call?.openInterest ?? 0,
      putOi: r.put?.openInterest ?? 0,
    }));
    const atm = spot === null ? null : atmStrike(oiStrikes, spot);
    const atmRow = atm === null ? undefined : rows.find((r) => r.strike === atm);
    const atmCallIv = atmRow?.call?.impliedVolatility ?? null;
    const atmPutIv = atmRow?.put?.impliedVolatility ?? null;
    const bothIv = atmCallIv !== null && atmPutIv !== null;

    return {
      ok: true,
      chain: {
        underlyingSymbol,
        expiry,
        underlyingLtp: quoteById.get(underlyingId)?.ltp ?? null,
        rows,
        totalCallOi,
        totalPutOi,
        pcr: totalCallOi === 0 ? null : totalPutOi / totalCallOi,
        maxPain: computeMaxPain(rows),
        topCallWalls: topWalls(rows, "CALL", 3),
        topPutWalls: topWalls(rows, "PUT", 3),
        atmStrike: atm,
        // Average the two ATM IVs when both solve; fall back to whichever did rather
        // than reporting nothing, and null only when neither did.
        atmIv: bothIv ? (atmCallIv! + atmPutIv!) / 2 : (atmCallIv ?? atmPutIv),
        ivSkew: bothIv ? atmPutIv! - atmCallIv! : null,
        daysToExpiry: dte,
        thetaPressure: thetaPressure(atmRow?.call?.ltp ?? 0, atmRow?.put?.ltp ?? 0, dte),
        oiStructure: computeOiStructure(oiStrikes, spot ?? 0),
        missingQuotes,
      },
    };
  }
}
