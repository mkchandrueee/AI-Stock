/**
 * Deterministic technical indicators. Pure functions over a price series — no I/O,
 * no broker, no AI.
 *
 * Why these are not gated on Gate A: nothing here selects, ranks, or suggests an
 * instrument. They compute a number from a price series, the same way
 * portfolio-service.ts computes a weight from stored values. The user supplies the
 * filter; this supplies the arithmetic. An AI that *chose* which stocks to surface
 * would be a different thing entirely (spec's own catalogue puts `draft_trade_idea`
 * at T2 and `schedule_scan` at T3, above the T0/T1 ceiling) — see
 * docs/design/ai-holding-analysis-blueprint.md.
 *
 * Deliberately absent: any "return" or "% change" figure. Whether a price-movement
 * percentage is permitted at all is the unresolved contradiction recorded in
 * ai-holding-analysis-blueprint.md (spec §19/§15 want returns; CLAUDE.md forbids
 * them). Not resolving it by quietly shipping one.
 *
 * Every function returns `null` rather than a value computed from insufficient data.
 * A short series is an unavailable answer, not a rough one (rule 1).
 *
 * Series convention throughout: `closes` is oldest-first, and every function reads
 * the most recent value from the end.
 */

/** Simple moving average of the last `period` closes. */
export function sma(closes: readonly number[], period: number): number | null {
  if (period <= 0 || closes.length < period) return null;
  const window = closes.slice(closes.length - period);
  let total = 0;
  for (const value of window) total += value;
  return total / period;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` closes and
 * then advanced across the remainder — the standard construction. Smoothing factor
 * is 2/(period+1).
 */
export function ema(closes: readonly number[], period: number): number | null {
  if (period <= 0 || closes.length < period) return null;
  const seed = sma(closes.slice(0, period), period);
  if (seed === null) return null;

  const k = 2 / (period + 1);
  let value = seed;
  for (let i = period; i < closes.length; i++) {
    value = (closes[i]! - value) * k + value;
  }
  return value;
}

/**
 * Relative Strength Index using **Wilder's smoothing** (not a simple average of
 * gains/losses — the two give different numbers, so the choice is stated rather than
 * left implicit). Needs at least `period + 1` closes, since it works on changes.
 *
 * Edge cases, chosen explicitly:
 * - No losses in the window but some gains → 100. Standard, and the formula's limit.
 * - No gains and no losses (a perfectly flat series) → 50. RSI is genuinely
 *   undefined there (0/0); 50 is the neutral reading and the common convention.
 *   Called out because it's a convention, not a computed result.
 */
export function rsi(closes: readonly number[], period: number): number | null {
  if (period <= 0 || closes.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i]! - closes[i - 1]!);
  }

  // Seed: simple average of the first `period` changes.
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i]!;
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  // Then Wilder-smooth across the remaining changes.
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * How far the latest close sits from its own `period` SMA, as a percentage of that
 * SMA. A position-relative-to-trend reading, not a return: it compares price to an
 * indicator at a single point in time, never one price to an earlier price.
 */
export function distanceFromSmaPct(closes: readonly number[], period: number): number | null {
  const average = sma(closes, period);
  if (average === null || average === 0) return null;
  const latest = closes[closes.length - 1];
  if (latest === undefined) return null;
  return ((latest - average) / average) * 100;
}
