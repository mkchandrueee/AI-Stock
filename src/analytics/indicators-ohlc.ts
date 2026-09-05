/**
 * Indicators that need full OHLC bars, not just closing prices.
 *
 * Separate from indicators.ts deliberately: those take a close-only series, these
 * need highs, lows and volume. Keeping the split explicit means a caller with only
 * closes can't accidentally reach for something that silently needs more.
 *
 * ── Attribution ────────────────────────────────────────────────────────────────
 * Indicator selection follows `AI-trader` (features/indicators.py), MIT Licensed,
 * Copyright (c) 2026 Aaryan Sinha. That file leans on pandas-ta/TA-Lib; these are
 * independent TypeScript implementations of the same standard formulas, written to
 * this project's conventions rather than transliterated.
 *
 * Same rule as everywhere else in analytics/: insufficient data returns `null`, never
 * a value computed from a partial window. Wilder's smoothing is used for ATR and ADX
 * (the conventional choice for both) and stated rather than left implicit, since the
 * simple-average variants produce different numbers.
 */

export interface OhlcvBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── shared helpers ─────────────────────────────────────────────────────────────

/** Full EMA series, null until the seed window fills. Needed because MACD's signal
 * line is an EMA *of the MACD series*, which a final-value-only EMA can't provide. */
export function emaSeries(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = (values[i]! - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

/** Population standard deviation of the final `period` values. */
function stdDev(values: readonly number[], period: number): number | null {
  if (period <= 1 || values.length < period) return null;
  const window = values.slice(values.length - period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

/** True range for bar i (i > 0): the widest of today's range and the two gaps to
 * yesterday's close. */
function trueRange(bars: readonly OhlcvBar[], i: number): number {
  const current = bars[i]!;
  const prevClose = bars[i - 1]!.close;
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - prevClose),
    Math.abs(current.low - prevClose),
  );
}

/** Wilder's smoothing: seed with a simple average, then prev*(n-1)/n + current/n. */
function wilderSmooth(values: readonly number[], period: number): number | null {
  if (values.length < period) return null;
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i]!;
  let smoothed = acc / period;
  for (let i = period; i < values.length; i++) {
    smoothed = (smoothed * (period - 1) + values[i]!) / period;
  }
  return smoothed;
}

// ── MACD ───────────────────────────────────────────────────────────────────────

export interface Macd {
  macd: number;
  signal: number;
  histogram: number;
}

/** MACD(fast, slow, signal) on closing prices. Needs slow + signal bars before the
 * signal line exists at all. */
export function macd(
  closes: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): Macd | null {
  if (closes.length < slowPeriod + signalPeriod) return null;

  const fast = emaSeries(closes, fastPeriod);
  const slow = emaSeries(closes, slowPeriod);

  // MACD line only exists where both EMAs do.
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const f = fast[i];
    const s = slow[i];
    if (f === null || f === undefined || s === null || s === undefined) continue;
    macdLine.push(f - s);
  }
  if (macdLine.length < signalPeriod) return null;

  const signalSeries = emaSeries(macdLine, signalPeriod);
  const macdValue = macdLine[macdLine.length - 1]!;
  const signalValue = signalSeries[signalSeries.length - 1];
  if (signalValue === null || signalValue === undefined) return null;

  return { macd: macdValue, signal: signalValue, histogram: macdValue - signalValue };
}

// ── ATR ────────────────────────────────────────────────────────────────────────

/** Average True Range, Wilder-smoothed. Needs period + 1 bars (true range is a
 * bar-to-bar measure). */
export function atr(bars: readonly OhlcvBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i++) ranges.push(trueRange(bars, i));
  return wilderSmooth(ranges, period);
}

/** ATR as a percentage of the latest close — comparable across price levels in a way
 * raw ATR is not. */
export function atrPercent(bars: readonly OhlcvBar[], period = 14): number | null {
  const value = atr(bars, period);
  const last = bars[bars.length - 1]?.close;
  if (value === null || last === undefined || last === 0) return null;
  return (value / last) * 100;
}

// ── Bollinger Bands ────────────────────────────────────────────────────────────

export interface BollingerBands {
  middle: number;
  upper: number;
  lower: number;
  /** Band width relative to the middle band — a volatility-squeeze reading. */
  width: number;
  /** Where price sits in the band: 0 at the lower band, 1 at the upper. Can fall
   * outside [0,1] when price breaks out, which is meaningful, not an error. */
  percentB: number | null;
}

export function bollingerBands(
  closes: readonly number[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerBands | null {
  if (closes.length < period) return null;
  const window = closes.slice(closes.length - period);
  const middle = window.reduce((a, b) => a + b, 0) / period;
  const sd = stdDev(closes, period);
  if (sd === null) return null;

  const upper = middle + stdDevMultiplier * sd;
  const lower = middle - stdDevMultiplier * sd;
  const last = closes[closes.length - 1]!;
  const span = upper - lower;

  return {
    middle,
    upper,
    lower,
    width: middle === 0 ? 0 : (span / middle) * 100,
    // A zero-width band (flat series) has no position to report.
    percentB: span === 0 ? null : (last - lower) / span,
  };
}

// ── ADX / Directional Movement ─────────────────────────────────────────────────

export interface Adx {
  /** Trend strength, direction-agnostic. Conventionally >25 is a trending market. */
  adx: number;
  diPlus: number;
  diMinus: number;
}

/**
 * Wilder's ADX with +DI/-DI. Needs roughly 2x the period of history, since ADX is a
 * smoothed average of DX which is itself built from smoothed components.
 */
export function adx(bars: readonly OhlcvBar[], period = 14): Adx | null {
  if (bars.length < period * 2 + 1) return null;

  const plusDm: number[] = [];
  const minusDm: number[] = [];
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i]!.high - bars[i - 1]!.high;
    const downMove = bars[i - 1]!.low - bars[i]!.low;
    // Only the larger move counts, and only if positive — Wilder's rule.
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    ranges.push(trueRange(bars, i));
  }

  // Build the DX series by advancing all three smoothed values together.
  const dxSeries: number[] = [];
  let smoothTr = 0;
  let smoothPlus = 0;
  let smoothMinus = 0;
  for (let i = 0; i < ranges.length; i++) {
    if (i < period) {
      smoothTr += ranges[i]!;
      smoothPlus += plusDm[i]!;
      smoothMinus += minusDm[i]!;
      if (i < period - 1) continue;
    } else {
      smoothTr = smoothTr - smoothTr / period + ranges[i]!;
      smoothPlus = smoothPlus - smoothPlus / period + plusDm[i]!;
      smoothMinus = smoothMinus - smoothMinus / period + minusDm[i]!;
    }
    if (smoothTr === 0) continue;
    const di1 = (smoothPlus / smoothTr) * 100;
    const di2 = (smoothMinus / smoothTr) * 100;
    const sum = di1 + di2;
    dxSeries.push(sum === 0 ? 0 : (Math.abs(di1 - di2) / sum) * 100);
  }

  if (dxSeries.length < period) return null;
  const adxValue = wilderSmooth(dxSeries, period);
  if (adxValue === null) return null;

  const finalDiPlus = smoothTr === 0 ? 0 : (smoothPlus / smoothTr) * 100;
  const finalDiMinus = smoothTr === 0 ? 0 : (smoothMinus / smoothTr) * 100;
  return { adx: adxValue, diPlus: finalDiPlus, diMinus: finalDiMinus };
}

// ── Oscillators ────────────────────────────────────────────────────────────────

/** Williams %R: 0 at the period high, -100 at the period low. */
export function williamsR(bars: readonly OhlcvBar[], period = 14): number | null {
  if (bars.length < period) return null;
  const window = bars.slice(bars.length - period);
  const highest = Math.max(...window.map((b) => b.high));
  const lowest = Math.min(...window.map((b) => b.low));
  if (highest === lowest) return null; // no range to locate price within
  const last = bars[bars.length - 1]!.close;
  return ((highest - last) / (highest - lowest)) * -100;
}

/** Commodity Channel Index over typical price. The 0.015 constant is Lambert's
 * original scaling, chosen so most values land within ±100. */
export function cci(bars: readonly OhlcvBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const typical = bars.map((b) => (b.high + b.low + b.close) / 3);
  const window = typical.slice(typical.length - period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const meanDeviation = window.reduce((sum, v) => sum + Math.abs(v - mean), 0) / period;
  if (meanDeviation === 0) return null;
  return (typical[typical.length - 1]! - mean) / (0.015 * meanDeviation);
}

/** Rate of change over `period` bars, as a percentage. */
export function rateOfChange(closes: readonly number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  const past = closes[closes.length - 1 - period]!;
  if (past === 0) return null;
  return ((closes[closes.length - 1]! - past) / past) * 100;
}

/** Annualised realised volatility from log returns. 252 trading days is the standard
 * Indian-market convention. */
export function realisedVolatility(closes: readonly number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const logReturns: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const current = closes[i]!;
    if (prev <= 0 || current <= 0) return null;
    logReturns.push(Math.log(current / prev));
  }
  const sd = stdDev(logReturns, logReturns.length);
  if (sd === null) return null;
  return sd * Math.sqrt(252) * 100;
}
