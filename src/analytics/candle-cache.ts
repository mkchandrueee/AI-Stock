/**
 * Read/write access to the local candle cache (migrations/0006_candle_cache.sql).
 *
 * The cache is what makes screening across a real universe possible at all — see
 * that migration's header for the arithmetic. Everything here is deliberately honest
 * about what the cache does and doesn't hold: a caller must be able to tell "we have
 * no data for this instrument" apart from "this instrument has no matches", because
 * presenting a partial scan as a complete one is exactly the failure CLAUDE.md's
 * first rule is about.
 */
import type { Pool } from "pg";
import type { Candle, CandleInterval } from "../core/types.js";

export type FetchStatus = "OK" | "EMPTY" | "FAILED";

export interface CoverageRow {
  instrumentId: string;
  interval: string;
  firstTs: string | null;
  lastTs: string | null;
  candleCount: number;
  lastFetchAt: string | null;
  lastFetchStatus: FetchStatus | null;
  lastFetchDetail: string | null;
}

export class CandleCache {
  constructor(private readonly pool: Pool) {}

  /**
   * Upserts a batch for one instrument. Re-fetching the same day is expected and
   * overwrites: exchanges revise a session's bar after close, so the newest fetch
   * wins rather than the first one being treated as final.
   */
  async store(instrumentId: string, interval: CandleInterval, candles: Candle[]): Promise<void> {
    if (candles.length > 0) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        for (const c of candles) {
          await client.query(
            `insert into candle (instrument_id, interval, ts, open, high, low, close, volume, fetched_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, now())
             on conflict (instrument_id, interval, ts) do update set
               open = excluded.open, high = excluded.high, low = excluded.low,
               close = excluded.close, volume = excluded.volume, fetched_at = now()`,
            [instrumentId, interval, c.timestamp, c.open, c.high, c.low, c.close, c.volume],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
    await this.recordFetch(
      instrumentId,
      interval,
      candles.length > 0 ? "OK" : "EMPTY",
      candles.length > 0 ? null : "broker returned no candles for the requested window",
    );
  }

  /** Records the outcome of an attempt, including failures — a failed fetch must
   * leave a trace, or the backfill worker will retry it forever with no record. */
  async recordFetch(
    instrumentId: string,
    interval: CandleInterval,
    status: FetchStatus,
    detail: string | null,
  ): Promise<void> {
    await this.pool.query(
      `insert into candle_coverage (
         instrument_id, interval, first_ts, last_ts, candle_count,
         last_fetch_at, last_fetch_status, last_fetch_detail)
       select $1, $2, min(ts), max(ts), count(*), now(), $3, $4
       from candle where instrument_id = $1 and interval = $2
       on conflict (instrument_id, interval) do update set
         first_ts = excluded.first_ts,
         last_ts = excluded.last_ts,
         candle_count = excluded.candle_count,
         last_fetch_at = excluded.last_fetch_at,
         last_fetch_status = excluded.last_fetch_status,
         last_fetch_detail = excluded.last_fetch_detail`,
      [instrumentId, interval, status, detail],
    );
  }

  /**
   * Closing prices for several instruments at once, oldest-first per instrument —
   * the shape indicators.ts expects. One query for the whole set, since the point of
   * the cache is that a scan doesn't make N round trips of any kind.
   */
  async getCloses(
    instrumentIds: string[],
    interval: CandleInterval,
    limitPerInstrument: number,
  ): Promise<Map<string, number[]>> {
    const result = await this.pool.query(
      `select instrument_id, ts, close
       from (
         select instrument_id, ts, close,
                row_number() over (partition by instrument_id order by ts desc) as rn
         from candle
         where interval = $2 and instrument_id = any($1::uuid[])
       ) ranked
       where rn <= $3
       order by instrument_id, ts asc`,
      [instrumentIds, interval, limitPerInstrument],
    );
    const byInstrument = new Map<string, number[]>();
    for (const row of result.rows) {
      const list = byInstrument.get(row.instrument_id) ?? [];
      list.push(Number(row.close));
      byInstrument.set(row.instrument_id, list);
    }
    return byInstrument;
  }

  /** Full OHLCV bars, oldest-first per instrument — scoring needs volume and range,
   * not just closes. Same single-query shape as getCloses. */
  async getBars(
    instrumentIds: string[],
    interval: CandleInterval,
    limitPerInstrument: number,
  ): Promise<Map<string, { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[]>> {
    const result = await this.pool.query(
      `select instrument_id, ts, open, high, low, close, volume
       from (
         select instrument_id, ts, open, high, low, close, volume,
                row_number() over (partition by instrument_id order by ts desc) as rn
         from candle
         where interval = $2 and instrument_id = any($1::uuid[])
       ) ranked
       where rn <= $3
       order by instrument_id, ts asc`,
      [instrumentIds, interval, limitPerInstrument],
    );
    const byInstrument = new Map<string, { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[]>();
    for (const row of result.rows) {
      const list = byInstrument.get(row.instrument_id) ?? [];
      list.push({
        timestamp: row.ts.toISOString(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      });
      byInstrument.set(row.instrument_id, list);
    }
    return byInstrument;
  }

  async getCoverage(instrumentIds: string[], interval: CandleInterval): Promise<Map<string, CoverageRow>> {
    const result = await this.pool.query(
      `select instrument_id, interval, first_ts, last_ts, candle_count,
              last_fetch_at, last_fetch_status, last_fetch_detail
       from candle_coverage
       where interval = $2 and instrument_id = any($1::uuid[])`,
      [instrumentIds, interval],
    );
    const byInstrument = new Map<string, CoverageRow>();
    for (const r of result.rows) {
      byInstrument.set(r.instrument_id, {
        instrumentId: r.instrument_id,
        interval: r.interval,
        firstTs: r.first_ts ? r.first_ts.toISOString() : null,
        lastTs: r.last_ts ? r.last_ts.toISOString() : null,
        candleCount: r.candle_count,
        lastFetchAt: r.last_fetch_at ? r.last_fetch_at.toISOString() : null,
        lastFetchStatus: r.last_fetch_status,
        lastFetchDetail: r.last_fetch_detail,
      });
    }
    return byInstrument;
  }

  /** Cache-wide summary, for reporting how much of the market is actually covered. */
  async summary(interval: CandleInterval): Promise<{
    instrumentsWithData: number;
    instrumentsAttempted: number;
    totalCandles: number;
    oldestTs: string | null;
    newestTs: string | null;
  }> {
    const cov = await this.pool.query(
      `select
         count(*) filter (where candle_count > 0) as with_data,
         count(*) as attempted
       from candle_coverage where interval = $1`,
      [interval],
    );
    const bars = await this.pool.query(
      `select count(*) as total, min(ts) as oldest, max(ts) as newest
       from candle where interval = $1`,
      [interval],
    );
    return {
      instrumentsWithData: Number(cov.rows[0]?.with_data ?? 0),
      instrumentsAttempted: Number(cov.rows[0]?.attempted ?? 0),
      totalCandles: Number(bars.rows[0]?.total ?? 0),
      oldestTs: bars.rows[0]?.oldest ? bars.rows[0].oldest.toISOString() : null,
      newestTs: bars.rows[0]?.newest ? bars.rows[0].newest.toISOString() : null,
    };
  }

  /**
   * Instruments due a fetch, staleness-first (never-attempted before
   * longest-ago-attempted). This is what makes the backfill resumable across runs
   * and across restarts, rather than restarting from the top of the universe every
   * time and never reaching the tail.
   */
  async selectStaleInstruments(
    interval: CandleInterval,
    exchange: string,
    instrumentType: string,
    series: string[],
    limit: number,
    minRefetchIntervalMs: number,
  ): Promise<{ instrumentId: string; tradingSymbol: string }[]> {
    const result = await this.pool.query(
      `select i.instrument_id, iv.trading_symbol
       from instrument i
       join instrument_version iv
         on iv.instrument_id = i.instrument_id and iv.effective_to is null
       left join candle_coverage cc
         on cc.instrument_id = i.instrument_id and cc.interval = $1
       where i.exchange = $2 and i.instrument_type = $3
         and split_part(iv.trading_symbol, '-', 2) = any($4::text[])
         and (cc.last_fetch_at is null or cc.last_fetch_at < now() - ($5::bigint * interval '1 millisecond'))
       order by cc.last_fetch_at asc nulls first, iv.trading_symbol
       limit $6`,
      [interval, exchange, instrumentType, series, minRefetchIntervalMs, limit],
    );
    return result.rows.map((r) => ({
      instrumentId: r.instrument_id,
      tradingSymbol: r.trading_symbol,
    }));
  }
}

/**
 * NSE's instrument_type is `EQUITY` for far more than equities: of 9,862 such NSE
 * rows, 4,298 are `SG` (government securities), 977 are `N0` debentures, and `GS`/
 * `TB`/`GB`/`MF` cover gilts, treasury bills and mutual-fund units. Only the series
 * below are actual tradable shares. Screening without this filter both wastes hours
 * of rate-limited fetching on debt instruments and returns bonds as "stocks" —
 * observed directly, not theorised.
 *
 * EQ  — the main equity series (2,654 on NSE)
 * BE  — trade-to-trade equity: real shares, restricted settlement
 * BZ  — trade-to-trade surveillance series (still shares)
 */
export const DEFAULT_EQUITY_SERIES = ["EQ", "BE", "BZ"];
