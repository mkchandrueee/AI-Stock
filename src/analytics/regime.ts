/**
 * Market regime classification: BULL / BEAR / SIDEWAYS.
 *
 * ── Attribution ────────────────────────────────────────────────────────────────
 * The SMA-cross classification and the sideways tolerance band are ported from
 * `NSE-Neuron` (utils/regime_detector.py), MIT Licensed, Copyright (c) 2026
 * pythonwadi. Ported to TypeScript and extended.
 *
 * The source's rule, kept intact as the direction call:
 *   fast > slow AND close > slow                  -> BULL
 *   fast < slow AND close < slow                  -> BEAR
 *   |close - slow| / slow < tolerance             -> SIDEWAYS  (checked first)
 *   anything else (ambiguous cross)               -> SIDEWAYS
 *
 * **Extended with ADX**, which the source does not use. SMA structure answers "which
 * way", but says nothing about whether a trend is strong enough to be worth calling.
 * A market drifting fractionally above a rising average satisfies the BULL rule while
 * being, in substance, directionless. ADX is reported alongside the label and folded
 * into `strength`, so a weak BULL is distinguishable from a decisive one instead of
 * both arriving as the bare string "BULL".
 *
 * What this deliberately does NOT do: the source also uses regime to boost or
 * penalise BUY/SELL signal confidence. That part is not ported — it exists to sharpen
 * trade recommendations, and this module reports a market state rather than acting on
 * one.
 */
import { sma } from "./indicators.js";
import { adx as computeAdx, type OhlcvBar } from "./indicators-ohlc.js";

export type Regime = "BULL" | "BEAR" | "SIDEWAYS" | "UNKNOWN";

/** How close to the slow average counts as "no meaningful displacement". The
 * source's REGIME_SIDEWAYS_TOLERANCE; 2% of the slow SMA. */
export const SIDEWAYS_TOLERANCE = 0.02;

/** Conventional ADX reading above which a trend is considered established. */
export const ADX_TREND_THRESHOLD = 25;

export interface RegimeResult {
  regime: Regime;
  /** Null when ADX can't be computed — reported, not silently treated as zero. */
  adx: number | null;
  /** WEAK / MODERATE / STRONG from ADX, or null when ADX is unavailable. Always null
   * for SIDEWAYS, where trend strength isn't a meaningful reading. */
  strength: "WEAK" | "MODERATE" | "STRONG" | null;
  /** How far the latest close sits from the slow SMA, as a percentage. */
  distanceFromSlowPct: number | null;
  /** Plain-language reason, matching the inspectability rule the scanner follows. */
  detail: string;
}

function strengthFor(adxValue: number | null): "WEAK" | "MODERATE" | "STRONG" | null {
  if (adxValue === null) return null;
  if (adxValue >= 40) return "STRONG";
  if (adxValue >= ADX_TREND_THRESHOLD) return "MODERATE";
  return "WEAK";
}

/**
 * Classifies the current regime from a bar series.
 *
 * Returns UNKNOWN rather than guessing when there isn't enough history for the slow
 * average — the source returns a fallback dict for the same reason, so a caller never
 * crashes and never receives a fabricated regime.
 */
export function detectRegime(
  bars: readonly OhlcvBar[],
  fastPeriod = 20,
  slowPeriod = 50,
): RegimeResult {
  const closes = bars.map((b) => b.close);
  const fast = sma(closes, fastPeriod);
  const slow = sma(closes, slowPeriod);
  const last = closes[closes.length - 1];

  if (fast === null || slow === null || last === undefined || slow === 0) {
    return {
      regime: "UNKNOWN",
      adx: null,
      strength: null,
      distanceFromSlowPct: null,
      detail: `needs at least ${slowPeriod} bars, have ${bars.length}`,
    };
  }

  const distancePct = ((last - slow) / slow) * 100;
  const adxResult = computeAdx(bars);
  const adxValue = adxResult?.adx ?? null;

  // Tolerance band first: price sitting on its own average is sideways regardless of
  // which way the averages happen to be crossed.
  if (Math.abs(last - slow) / slow < SIDEWAYS_TOLERANCE) {
    return {
      regime: "SIDEWAYS",
      adx: adxValue,
      strength: null,
      distanceFromSlowPct: distancePct,
      detail: `price within ${(SIDEWAYS_TOLERANCE * 100).toFixed(0)}% of the ${slowPeriod}-SMA (${distancePct.toFixed(2)}%)`,
    };
  }

  if (fast > slow && last > slow) {
    return {
      regime: "BULL",
      adx: adxValue,
      strength: strengthFor(adxValue),
      distanceFromSlowPct: distancePct,
      detail:
        `${fastPeriod}-SMA above ${slowPeriod}-SMA, price ${distancePct.toFixed(2)}% above the slow average` +
        (adxValue === null ? "" : `, ADX ${adxValue.toFixed(1)}`),
    };
  }

  if (fast < slow && last < slow) {
    return {
      regime: "BEAR",
      adx: adxValue,
      strength: strengthFor(adxValue),
      distanceFromSlowPct: distancePct,
      detail:
        `${fastPeriod}-SMA below ${slowPeriod}-SMA, price ${Math.abs(distancePct).toFixed(2)}% below the slow average` +
        (adxValue === null ? "" : `, ADX ${adxValue.toFixed(1)}`),
    };
  }

  // Averages and price disagree — a cross in progress, which is not a trend.
  return {
    regime: "SIDEWAYS",
    adx: adxValue,
    strength: null,
    distanceFromSlowPct: distancePct,
    detail: "moving averages and price disagree — ambiguous cross",
  };
}
