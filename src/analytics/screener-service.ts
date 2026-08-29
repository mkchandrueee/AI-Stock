/**
 * Orchestrates a screening run: fetch price history for a set of instruments, then
 * hand it to the pure engine in screener.ts.
 *
 * Two constraints shape this more than anything else:
 *
 * 1. **Rate limits.** Angel One's portfolio-read endpoints are documented at 1 req/sec,
 *    and broker-adapters.md requires platform-side governance stricter than the
 *    broker's published limit. Candles are therefore fetched strictly sequentially
 *    with deliberate spacing — never in parallel. This makes a run take roughly
 *    (instruments × spacing) seconds, which is the real reason the instrument count
 *    is capped rather than left open.
 *
 * 2. **A screening run must not be all-or-nothing.** One instrument failing to fetch
 *    (unmapped, delisted, a transient broker error) records that instrument as
 *    skipped with its reason and the run continues. Failing the whole run over one
 *    symbol would make the feature useless on exactly the messy real-world data it
 *    exists to handle.
 *
 * This module fetches and coordinates; it makes no judgement about which instruments
 * are worth screening. The caller supplies the list and the criteria.
 */
import type { Pool } from "pg";
import type { AuthSession, BrokerAdapter } from "../core/broker-adapter.js";
import type { CandleInterval } from "../core/types.js";
import type { CandleCache } from "./candle-cache.js";
import {
  isUsableCriteriaSet,
  screen,
  type ScreenerCandidate,
  type ScreenerCriterion,
  type ScreenerResult,
  type ScreenerSkip,
} from "./screener.js";

/** Stricter than Angel One's published 1 req/sec, per broker-adapters.md. */
const REQUEST_SPACING_MS = 1200;

/**
 * A run holds a broker connection open for roughly (count × spacing) seconds, so this
 * bounds how long one request can occupy the session and how hard a single run can
 * lean on the broker. Screening a whole exchange is not possible at this rate — that
 * needs bulk licensed market data, which is Gate B and unresolved.
 */
export const MAX_INSTRUMENTS_PER_RUN = 25;

export interface ScreenerRunRequest {
  instrumentIds: string[];
  interval: CandleInterval;
  /** Calendar days of history to request. Trading days will be fewer. */
  lookbackDays: number;
  criteria: ScreenerCriterion[];
}

export type ScreenerRunOutcome =
  | { ok: true; result: ScreenerResult; requestedCount: number }
  | { ok: false; reason: string };

/** Universe-wide screen, reading the local cache instead of the broker. */
export interface CachedScreenRequest {
  exchange: string;
  instrumentType: string;
  /** Symbol series to treat as the equity universe — see DEFAULT_EQUITY_SERIES. */
  series: string[];
  interval: CandleInterval;
  /** How many recent closes to feed the indicators. */
  barsPerInstrument: number;
  criteria: ScreenerCriterion[];
}

export interface CachedScreenOutcome {
  ok: true;
  result: ScreenerResult;
  /** Deliberately explicit: a scan over a partially-built cache must never read as a
   * complete market sweep. `universeSize` is how many instruments exist in the
   * requested slice; `scannedCount` is how many the cache could actually supply. */
  coverage: {
    universeSize: number;
    scannedCount: number;
    coveragePct: number;
    cacheNewestTs: string | null;
  };
}

interface InstrumentDisplay {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
}

async function loadInstrumentDisplay(
  pool: Pool,
  instrumentIds: string[],
): Promise<Map<string, InstrumentDisplay>> {
  const result = await pool.query(
    `select i.instrument_id, iv.trading_symbol, i.exchange
     from instrument i
     join instrument_version iv
       on iv.instrument_id = i.instrument_id and iv.effective_to is null
     where i.instrument_id = any($1::uuid[])`,
    [instrumentIds],
  );
  const byId = new Map<string, InstrumentDisplay>();
  for (const row of result.rows) {
    byId.set(row.instrument_id, {
      instrumentId: row.instrument_id,
      tradingSymbol: row.trading_symbol,
      exchange: row.exchange,
    });
  }
  return byId;
}

function describeAdapterError(error: unknown): string {
  if (typeof error === "object" && error !== null && "kind" in error) {
    const kind = (error as { kind: string }).kind;
    if (kind === "PARTIAL_DATA") return "not mapped to this broker";
    if (kind === "RATE_LIMITED") return "broker rate-limited this request";
    if (kind === "TOKEN_EXPIRED") return "broker session expired";
    return `broker error: ${kind}`;
  }
  return "broker error";
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ScreenerService {
  constructor(
    private readonly pool: Pool,
    private readonly adapter: BrokerAdapter,
    private readonly cache?: CandleCache,
  ) {}

  /**
   * Screens everything the cache holds for a slice of the universe. No broker calls,
   * so this is fast and unbounded by the rate limit — that's the entire point of the
   * cache, and the reason a screen can cover thousands of instruments instead of 25.
   *
   * Reports coverage rather than quietly scanning whatever happens to be cached:
   * "142 matched" means nothing without "out of 380 scanned, of a 9,862 universe".
   */
  async runCached(request: CachedScreenRequest): Promise<CachedScreenOutcome | { ok: false; reason: string }> {
    if (!this.cache) return { ok: false, reason: "candle cache is not configured" };
    if (!isUsableCriteriaSet(request.criteria)) {
      return { ok: false, reason: "at least one criterion is required" };
    }

    const universe = await this.pool.query(
      `select i.instrument_id, iv.trading_symbol, i.exchange
       from instrument i
       join instrument_version iv
         on iv.instrument_id = i.instrument_id and iv.effective_to is null
       where i.exchange = $1 and i.instrument_type = $2
         and split_part(iv.trading_symbol, '-', 2) = any($3::text[])`,
      [request.exchange, request.instrumentType, request.series],
    );

    const ids = universe.rows.map((r) => r.instrument_id as string);
    const closesById = await this.cache.getCloses(ids, request.interval, request.barsPerInstrument);

    const candidates: ScreenerCandidate[] = [];
    for (const row of universe.rows) {
      const closes = closesById.get(row.instrument_id);
      // Instruments the cache has nothing for aren't skips — they were never in the
      // scan. Listing thousands of "not cached yet" rows would drown the real skips;
      // the coverage numbers carry that information instead.
      if (!closes || closes.length === 0) continue;
      candidates.push({
        instrumentId: row.instrument_id,
        tradingSymbol: row.trading_symbol,
        exchange: row.exchange,
        closes,
      });
    }

    const result = screen(candidates, request.criteria);
    const summary = await this.cache.summary(request.interval);
    return {
      ok: true,
      result,
      coverage: {
        universeSize: ids.length,
        scannedCount: candidates.length,
        coveragePct: ids.length === 0 ? 0 : (candidates.length / ids.length) * 100,
        cacheNewestTs: summary.newestTs,
      },
    };
  }

  async run(session: AuthSession, request: ScreenerRunRequest): Promise<ScreenerRunOutcome> {
    if (!isUsableCriteriaSet(request.criteria)) {
      return { ok: false, reason: "at least one criterion is required" };
    }
    if (request.instrumentIds.length === 0) {
      return { ok: false, reason: "at least one instrument is required" };
    }
    if (request.instrumentIds.length > MAX_INSTRUMENTS_PER_RUN) {
      return {
        ok: false,
        reason:
          `at most ${MAX_INSTRUMENTS_PER_RUN} instruments per run ` +
          `(requested ${request.instrumentIds.length}) — the broker's rate limit makes ` +
          `larger runs impractically slow`,
      };
    }
    if (request.lookbackDays <= 0) {
      return { ok: false, reason: "lookbackDays must be positive" };
    }

    const display = await loadInstrumentDisplay(this.pool, request.instrumentIds);
    const to = new Date();
    const from = new Date(to.getTime() - request.lookbackDays * 24 * 60 * 60 * 1000);

    const candidates: ScreenerCandidate[] = [];
    const fetchSkips: ScreenerSkip[] = [];

    for (let i = 0; i < request.instrumentIds.length; i++) {
      const instrumentId = request.instrumentIds[i]!;
      const info = display.get(instrumentId);
      if (!info) {
        fetchSkips.push({
          instrumentId,
          tradingSymbol: instrumentId,
          reason: "unknown to the security master",
        });
        continue;
      }

      // Sequential and spaced, deliberately — see the file header.
      if (i > 0) await delay(REQUEST_SPACING_MS);

      const candles = await this.adapter.getCandles(session, {
        instrumentId,
        interval: request.interval,
        from,
        to,
      });

      if (!candles.ok) {
        fetchSkips.push({
          instrumentId,
          tradingSymbol: info.tradingSymbol,
          reason: describeAdapterError(candles.error),
        });
        continue;
      }
      if (candles.value.length === 0) {
        // An empty window is a real, reportable state — not silently a non-match.
        fetchSkips.push({
          instrumentId,
          tradingSymbol: info.tradingSymbol,
          reason: "no candles returned for the requested window",
        });
        continue;
      }

      candidates.push({
        instrumentId,
        tradingSymbol: info.tradingSymbol,
        exchange: info.exchange,
        closes: candles.value.map((c) => c.close),
      });
    }

    const result = screen(candidates, request.criteria);
    return {
      ok: true,
      requestedCount: request.instrumentIds.length,
      result: {
        ...result,
        // Fetch-time skips and evaluation-time skips are the same kind of answer to
        // the user ("couldn't tell you about this one, here's why"), so they're
        // reported together rather than in two separate lists.
        skipped: [...fetchSkips, ...result.skipped],
      },
    };
  }
}
