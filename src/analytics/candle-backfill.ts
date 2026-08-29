/**
 * Builds the candle cache by walking the instrument universe at the broker's rate
 * limit. This is the piece that turns screening from "25 instruments you picked" into
 * "everything we've cached so far".
 *
 * Design constraints, all of them consequences of 1 req/sec:
 *
 * - **Resumable, staleness-ordered.** Never-attempted instruments come first, then
 *   longest-ago-attempted. A run that covers 500 of 9,862 instruments and stops
 *   leaves the next run starting where it left off, rather than re-walking the head
 *   of the alphabet forever and never reaching the tail.
 * - **Failures are recorded, not just retried.** A failed fetch writes FAILED with a
 *   reason, so it doesn't look identical to "never tried" and doesn't silently spin.
 * - **Bounded per run.** A run takes a batch, not the universe. The caller decides
 *   how long to run for; nothing here loops indefinitely on its own.
 * - **Stops early on session expiry.** Once the broker session is dead every
 *   subsequent call fails, so continuing would just burn the remaining budget writing
 *   identical failures.
 */
import type { AuthSession, BrokerAdapter } from "../core/broker-adapter.js";
import type { CandleInterval } from "../core/types.js";
import type { CandleCache } from "./candle-cache.js";

/** Stricter than Angel One's published 1 req/sec, per broker-adapters.md. */
const REQUEST_SPACING_MS = 1200;

export interface BackfillOptions {
  interval: CandleInterval;
  exchange: string;
  instrumentType: string;
  /** Symbol series forming the equity universe — see DEFAULT_EQUITY_SERIES. */
  series: string[];
  /** How many instruments to attempt this run. */
  batchSize: number;
  /** Calendar days of history to request per instrument. */
  lookbackDays: number;
  /** Don't re-fetch an instrument attempted more recently than this. */
  minRefetchIntervalMs: number;
}

export interface BackfillReport {
  attempted: number;
  succeeded: number;
  empty: number;
  failed: number;
  stoppedEarly: boolean;
  stoppedReason: string | null;
  elapsedMs: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CandleBackfillWorker {
  constructor(
    private readonly adapter: BrokerAdapter,
    private readonly cache: CandleCache,
  ) {}

  async run(
    session: AuthSession,
    options: BackfillOptions,
    shouldStop?: () => boolean,
  ): Promise<BackfillReport> {
    const startedAt = Date.now();
    const targets = await this.cache.selectStaleInstruments(
      options.interval,
      options.exchange,
      options.instrumentType,
      options.series,
      options.batchSize,
      options.minRefetchIntervalMs,
    );

    const report: BackfillReport = {
      attempted: 0,
      succeeded: 0,
      empty: 0,
      failed: 0,
      stoppedEarly: false,
      stoppedReason: null,
      elapsedMs: 0,
    };

    const to = new Date();
    const from = new Date(to.getTime() - options.lookbackDays * 24 * 60 * 60 * 1000);

    for (let i = 0; i < targets.length; i++) {
      if (shouldStop?.()) {
        report.stoppedEarly = true;
        report.stoppedReason = "cancelled";
        break;
      }
      const target = targets[i]!;
      if (i > 0) await delay(REQUEST_SPACING_MS);

      report.attempted++;
      const result = await this.adapter.getCandles(session, {
        instrumentId: target.instrumentId,
        interval: options.interval,
        from,
        to,
      });

      if (!result.ok) {
        const kind = (result.error as { kind: string }).kind;
        await this.cache.recordFetch(target.instrumentId, options.interval, "FAILED", kind);
        report.failed++;

        // Nothing after this point can succeed on a dead session, and re-authenticating
        // isn't possible from here (this flow has no refresh token by design).
        if (kind === "TOKEN_EXPIRED") {
          report.stoppedEarly = true;
          report.stoppedReason = "broker session expired — reconnect and run again";
          break;
        }
        continue;
      }

      await this.cache.store(target.instrumentId, options.interval, result.value);
      if (result.value.length > 0) report.succeeded++;
      else report.empty++;
    }

    report.elapsedMs = Date.now() - startedAt;
    return report;
  }
}
