/**
 * Applies user-defined technical criteria to a set of instruments. Pure: it takes
 * price series that someone else fetched and returns which instruments match.
 *
 * The user writes the filter; this evaluates it. Nothing here ranks, scores, orders
 * by attractiveness, or decides what's worth looking at — a match is "this
 * instrument satisfies the condition you wrote," not "this is a good buy." That
 * distinction is the whole reason this is buildable while AI-driven selection isn't
 * (see indicators.ts and docs/design/ai-holding-analysis-blueprint.md).
 *
 * Matches are returned in the order the candidates were supplied. Deliberately not
 * sorted by any indicator value — an ordering would imply a ranking, which is the
 * thing being avoided. The caller can sort; the engine won't do it implicitly.
 *
 * Instruments that can't be evaluated (too little price history) are reported in
 * `skipped`, never dropped silently and never treated as non-matching. "We couldn't
 * tell" and "it doesn't match" are different answers, and collapsing them would hide
 * missing data behind an empty result.
 */
import { distanceFromSmaPct, ema, rsi, sma } from "./indicators.js";

export type IndicatorKind = "RSI" | "SMA" | "EMA" | "DISTANCE_FROM_SMA_PCT" | "CLOSE";

export type ComparisonOperator = "LT" | "LTE" | "GT" | "GTE";

export interface ScreenerCriterion {
  indicator: IndicatorKind;
  /** Required by every indicator except CLOSE, which reads the latest price. */
  period?: number;
  operator: ComparisonOperator;
  value: number;
}

export interface ScreenerCandidate {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  /** Closing prices, oldest first — the convention indicators.ts expects. */
  closes: readonly number[];
}

export interface ScreenerMatch {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  /** Every criterion's computed value, keyed by its label — so a result can be
   * inspected rather than taken on trust (the spec's transparency requirement). */
  values: Record<string, number>;
}

export interface ScreenerSkip {
  instrumentId: string;
  tradingSymbol: string;
  reason: string;
}

export interface ScreenerResult {
  matches: ScreenerMatch[];
  skipped: ScreenerSkip[];
  /** How many candidates were evaluated at all — matches + non-matches, excluding
   * skips. Without it, "3 matches" is ambiguous about the size of the field. */
  evaluatedCount: number;
}

export function criterionLabel(criterion: ScreenerCriterion): string {
  return criterion.period === undefined
    ? criterion.indicator
    : `${criterion.indicator}(${criterion.period})`;
}

type Computed = { ok: true; value: number } | { ok: false; reason: string };

function computeIndicator(closes: readonly number[], criterion: ScreenerCriterion): Computed {
  if (criterion.indicator === "CLOSE") {
    const latest = closes[closes.length - 1];
    if (latest === undefined) return { ok: false, reason: "no price data" };
    return { ok: true, value: latest };
  }

  const period = criterion.period;
  if (period === undefined) {
    return { ok: false, reason: `${criterion.indicator} requires a period` };
  }

  let value: number | null;
  switch (criterion.indicator) {
    case "RSI":
      value = rsi(closes, period);
      break;
    case "SMA":
      value = sma(closes, period);
      break;
    case "EMA":
      value = ema(closes, period);
      break;
    case "DISTANCE_FROM_SMA_PCT":
      value = distanceFromSmaPct(closes, period);
      break;
  }

  if (value === null) {
    return {
      ok: false,
      reason: `insufficient price history for ${criterionLabel(criterion)} (have ${closes.length} closes)`,
    };
  }
  return { ok: true, value };
}

function compare(actual: number, operator: ComparisonOperator, threshold: number): boolean {
  switch (operator) {
    case "LT":
      return actual < threshold;
    case "LTE":
      return actual <= threshold;
    case "GT":
      return actual > threshold;
    case "GTE":
      return actual >= threshold;
  }
}

/**
 * All criteria must hold (AND). Only AND is supported — OR and nested grouping are
 * deliberately absent rather than half-implemented; adding them is a real feature
 * with its own UI, not a flag.
 *
 * A candidate is skipped on the FIRST criterion it can't evaluate, and the reason
 * names that criterion, so "why isn't X in my results" has a specific answer.
 */
export function screen(
  candidates: readonly ScreenerCandidate[],
  criteria: readonly ScreenerCriterion[],
): ScreenerResult {
  const matches: ScreenerMatch[] = [];
  const skipped: ScreenerSkip[] = [];
  let evaluatedCount = 0;

  for (const candidate of candidates) {
    const values: Record<string, number> = {};
    let matchesAll = true;
    let skipReason: string | null = null;

    for (const criterion of criteria) {
      const computed = computeIndicator(candidate.closes, criterion);
      if (!computed.ok) {
        skipReason = computed.reason;
        break;
      }
      values[criterionLabel(criterion)] = computed.value;
      if (!compare(computed.value, criterion.operator, criterion.value)) {
        matchesAll = false;
        // Keep going: the remaining values are still worth showing on a near-miss,
        // and computing them costs nothing beyond arithmetic already in memory.
      }
    }

    if (skipReason !== null) {
      skipped.push({
        instrumentId: candidate.instrumentId,
        tradingSymbol: candidate.tradingSymbol,
        reason: skipReason,
      });
      continue;
    }

    evaluatedCount++;
    if (matchesAll) {
      matches.push({
        instrumentId: candidate.instrumentId,
        tradingSymbol: candidate.tradingSymbol,
        exchange: candidate.exchange,
        values,
      });
    }
  }

  return { matches, skipped, evaluatedCount };
}

/** An empty criteria list matches everything, which is almost never what someone
 * meant to ask for — callers should reject it rather than run it. */
export function isUsableCriteriaSet(criteria: readonly ScreenerCriterion[]): boolean {
  return criteria.length > 0;
}
