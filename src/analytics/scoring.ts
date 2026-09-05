/**
 * Composite technical scoring — the system ranks instruments itself, rather than
 * applying filters the user typed.
 *
 * Built under the explicit owner override recorded in CLAUDE.md (2026-08-29):
 * ranking and conviction scoring are T2 under spec §67/§74 and sit above the T0/T1
 * ceiling the Option B working position implies. That override is an owner decision,
 * not a Gate A resolution.
 *
 * Two design rules carried over from everything else in this repo:
 *
 * 1. **Every point is attributable.** A score with no breakdown is exactly the opaque
 *    number spec §20 forbids ("Do NOT collapse everything into one meaningless
 *    score... each contributing dimension inspectable"). Each factor reports its own
 *    points, its maximum, and a plain sentence saying why it scored that.
 * 2. **Missing inputs are reported, never imputed.** A factor that cannot be computed
 *    (too little history, no benchmark supplied) is marked UNAVAILABLE and excluded
 *    from both the earned total and the attainable maximum, so a stock is never
 *    penalised for data this platform didn't have. The alternative — scoring it zero —
 *    silently converts "unknown" into "bad", which is the fabrication rule in a
 *    different costume.
 */
import { ema, rsi, sma } from "./indicators.js";
import { adx as computeAdx, macd as computeMacd } from "./indicators-ohlc.js";
import { detectRegime } from "./regime.js";

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type FactorStatus = "SCORED" | "UNAVAILABLE";

export interface FactorScore {
  factor: string;
  status: FactorStatus;
  /** Points earned. 0 when UNAVAILABLE — and `max` is then excluded from the total. */
  points: number;
  max: number;
  /** Plain-language reason, in the spirit of the reference product's expandable "why". */
  detail: string;
}

export interface StockScore {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  /** Market regime for this instrument — reported alongside the score rather than
   * folded into it, so a strong score in a BEAR regime stays visible as exactly that. */
  regime: string;
  regimeDetail: string;
  /** 0–100, normalised over the factors that could actually be computed. */
  conviction: number;
  earnedPoints: number;
  attainablePoints: number;
  /** How many factors actually contributed. Conviction normalises over available
   * factors so missing history isn't punished — but that means a 100 scored on two
   * factors and a 100 scored on seven look identical unless the evidence base is
   * reported. It is, and it also breaks ties in ranking. */
  factorsScored: number;
  factorsTotal: number;
  band: ScoreBand;
  factors: FactorScore[];
}

/**
 * Descriptive of the score itself, deliberately — not an instruction. Mapping these
 * to action words (the reference product uses ACCUMULATE/WATCH) is a display choice
 * the owner can make; it isn't baked into the engine.
 */
export type ScoreBand = "STRONG" | "MODERATE" | "NEUTRAL" | "WEAK";

export function bandFor(conviction: number): ScoreBand {
  if (conviction >= 75) return "STRONG";
  if (conviction >= 55) return "MODERATE";
  if (conviction >= 35) return "NEUTRAL";
  return "WEAK";
}

const unavailable = (factor: string, max: number, why: string): FactorScore => ({
  factor,
  status: "UNAVAILABLE",
  points: 0,
  max,
  detail: why,
});

/** Percentage change between two closes. Used only for technical momentum and
 * relative strength — never presented as the user's own return or P&L. */
function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

function closeNBarsAgo(bars: Bar[], n: number): number | null {
  const index = bars.length - 1 - n;
  return index >= 0 ? bars[index]!.close : null;
}

/** Momentum: price change over ~1 month and ~3 months, rewarding sustained advance
 * rather than a single spike. */
function scoreMomentum(bars: Bar[]): FactorScore {
  const MAX = 25;
  const latest = bars[bars.length - 1]?.close;
  const c20 = closeNBarsAgo(bars, 20);
  const c60 = closeNBarsAgo(bars, 60);
  if (latest === undefined || c20 === null || c60 === null) {
    return unavailable("Momentum", MAX, "needs at least 61 bars of history");
  }
  const m20 = pctChange(c20, latest);
  const m60 = pctChange(c60, latest);
  if (m20 === null || m60 === null) {
    return unavailable("Momentum", MAX, "a reference close was zero");
  }

  // Banded rather than linear: a 40% move isn't four times as meaningful as 10%.
  const band = (v: number, cap: number) => {
    if (v >= 20) return cap;
    if (v >= 10) return cap * 0.8;
    if (v >= 3) return cap * 0.6;
    if (v >= 0) return cap * 0.4;
    if (v >= -10) return cap * 0.2;
    return 0;
  };
  const points = Math.round(band(m20, 12.5) + band(m60, 12.5));
  return {
    factor: "Momentum",
    status: "SCORED",
    points,
    max: MAX,
    detail: `20-bar ${m20.toFixed(1)}%, 60-bar ${m60.toFixed(1)}%`,
  };
}

/** Trend structure: price above its averages, and the fast average above the slow —
 * the standard stacked-EMA reading. */
function scoreTrend(bars: Bar[]): FactorScore {
  const MAX = 25;
  const closes = bars.map((b) => b.close);
  const latest = closes[closes.length - 1];
  const fast = ema(closes, 20);
  const slow = ema(closes, 50);
  if (latest === undefined || fast === null || slow === null) {
    return unavailable("Trend", MAX, "needs at least 50 bars of history");
  }

  let points = 0;
  const notes: string[] = [];
  if (latest > fast) {
    points += 10;
    notes.push("price above 20-EMA");
  } else {
    notes.push("price below 20-EMA");
  }
  if (latest > slow) {
    points += 8;
    notes.push("price above 50-EMA");
  } else {
    notes.push("price below 50-EMA");
  }
  if (fast > slow) {
    points += 7;
    notes.push("20-EMA above 50-EMA");
  } else {
    notes.push("20-EMA below 50-EMA");
  }
  return { factor: "Trend", status: "SCORED", points, max: MAX, detail: notes.join(", ") };
}

/**
 * Relative strength against a benchmark over the same window. Genuinely UNAVAILABLE
 * when no benchmark series is supplied — an absolute move says nothing about strength
 * if the whole market moved with it, so guessing here would be worse than abstaining.
 */
function scoreRelativeStrength(bars: Bar[], benchmark: Bar[] | undefined): FactorScore {
  const MAX = 20;
  if (!benchmark || benchmark.length === 0) {
    return unavailable("Relative strength", MAX, "no benchmark series supplied");
  }
  const stockNow = bars[bars.length - 1]?.close;
  const stockThen = closeNBarsAgo(bars, 20);
  const benchNow = benchmark[benchmark.length - 1]?.close;
  const benchThen = closeNBarsAgo(benchmark, 20);
  if (stockNow === undefined || stockThen === null || benchNow === undefined || benchThen === null) {
    return unavailable("Relative strength", MAX, "needs 21 bars for both instrument and benchmark");
  }
  const stockMove = pctChange(stockThen, stockNow);
  const benchMove = pctChange(benchThen, benchNow);
  if (stockMove === null || benchMove === null) {
    return unavailable("Relative strength", MAX, "a reference close was zero");
  }

  const spread = stockMove - benchMove;
  let points: number;
  if (spread >= 10) points = MAX;
  else if (spread >= 5) points = 16;
  else if (spread >= 0) points = 12;
  else if (spread >= -5) points = 6;
  else points = 0;

  return {
    factor: "Relative strength",
    status: "SCORED",
    points,
    max: MAX,
    detail: `${stockMove.toFixed(1)}% vs benchmark ${benchMove.toFixed(1)}% (spread ${spread >= 0 ? "+" : ""}${spread.toFixed(1)}pp)`,
  };
}

/** Volume expansion: recent activity against its own longer-run baseline. Participation
 * confirming a move is the signal; the ratio is to the instrument's own history, so it
 * is comparable across large and small names. */
function scoreVolume(bars: Bar[]): FactorScore {
  const MAX = 15;
  if (bars.length < 50) return unavailable("Volume", MAX, "needs at least 50 bars of history");
  const volumes = bars.map((b) => b.volume);
  const recent = sma(volumes.slice(-10), 10);
  const baseline = sma(volumes, 50);
  if (recent === null || baseline === null || baseline === 0) {
    return unavailable("Volume", MAX, "insufficient or zero baseline volume");
  }
  const ratio = recent / baseline;
  let points: number;
  if (ratio >= 2) points = MAX;
  else if (ratio >= 1.5) points = 12;
  else if (ratio >= 1.1) points = 9;
  else if (ratio >= 0.8) points = 5;
  else points = 0;

  return {
    factor: "Volume",
    status: "SCORED",
    points,
    max: MAX,
    detail: `10-bar average ${ratio.toFixed(2)}x its 50-bar baseline`,
  };
}

/**
 * Trend quality from ADX. Distinct from the Trend factor, which asks "which way";
 * this asks "is the trend strong enough to mean anything". A stacked-EMA reading in a
 * directionless market scores well on Trend and poorly here, which is the point.
 */
function scoreTrendQuality(bars: Bar[]): FactorScore {
  const MAX = 15;
  const result = computeAdx(bars);
  if (result === null) return unavailable("Trend quality", MAX, "needs at least 29 bars of history");

  let points: number;
  if (result.adx >= 40) points = MAX;
  else if (result.adx >= 25) points = 11;
  else if (result.adx >= 20) points = 7;
  else points = 3;
  // Direction matters too: a strong trend pointing down shouldn't score like one
  // pointing up, since every other factor here reads long.
  if (result.diMinus > result.diPlus) points = Math.round(points * 0.4);

  return {
    factor: "Trend quality",
    status: "SCORED",
    points,
    max: MAX,
    detail: `ADX ${result.adx.toFixed(1)}, +DI ${result.diPlus.toFixed(1)} vs -DI ${result.diMinus.toFixed(1)}`,
  };
}

/** MACD histogram — momentum confirmation independent of raw price change. */
function scoreMacd(bars: Bar[]): FactorScore {
  const MAX = 10;
  const result = computeMacd(bars.map((b) => b.close));
  if (result === null) return unavailable("MACD", MAX, "needs at least 35 bars of history");

  let points: number;
  if (result.macd > 0 && result.histogram > 0) points = MAX; // trending up, still expanding
  else if (result.macd > 0) points = 6; // above zero but contracting
  else if (result.histogram > 0) points = 4; // below zero but improving
  else points = 0;

  return {
    factor: "MACD",
    status: "SCORED",
    points,
    max: MAX,
    detail: `MACD ${result.macd.toFixed(2)}, signal ${result.signal.toFixed(2)}, histogram ${result.histogram.toFixed(2)}`,
  };
}

/**
 * RSI positioning. Scores the healthy-but-not-extended middle highest: deeply
 * overbought readings score low here not as a bearish call but because they mark a
 * stretched entry, and that is what this factor measures.
 */
function scoreRsiPosition(bars: Bar[]): FactorScore {
  const MAX = 15;
  const value = rsi(bars.map((b) => b.close), 14);
  if (value === null) return unavailable("RSI position", MAX, "needs at least 15 bars of history");

  let points: number;
  if (value >= 45 && value <= 65) points = MAX;
  else if (value > 65 && value <= 75) points = 10;
  else if (value >= 35 && value < 45) points = 10;
  else if (value > 75) points = 4;
  else points = 6; // below 35 — oversold, neither confirmed strength nor exhaustion
  return {
    factor: "RSI position",
    status: "SCORED",
    points,
    max: MAX,
    detail: `RSI(14) at ${value.toFixed(1)}`,
  };
}

export interface ScoreInput {
  instrumentId: string;
  tradingSymbol: string;
  exchange: string;
  bars: Bar[];
}

/** Scores one instrument. `benchmark` is the index series used for relative strength;
 * omit it and that factor reports UNAVAILABLE rather than being silently skipped. */
export function scoreInstrument(input: ScoreInput, benchmark?: Bar[]): StockScore {
  const factors: FactorScore[] = [
    scoreMomentum(input.bars),
    scoreTrend(input.bars),
    scoreRelativeStrength(input.bars, benchmark),
    scoreVolume(input.bars),
    scoreRsiPosition(input.bars),
    scoreTrendQuality(input.bars),
    scoreMacd(input.bars),
  ];

  let earnedPoints = 0;
  let attainablePoints = 0;
  for (const f of factors) {
    if (f.status !== "SCORED") continue;
    earnedPoints += f.points;
    attainablePoints += f.max;
  }
  const conviction = attainablePoints === 0 ? 0 : Math.round((earnedPoints / attainablePoints) * 100);
  const factorsScored = factors.filter((f) => f.status === "SCORED").length;

  const regime = detectRegime(input.bars);

  return {
    instrumentId: input.instrumentId,
    tradingSymbol: input.tradingSymbol,
    exchange: input.exchange,
    regime: regime.regime,
    regimeDetail: regime.detail,
    conviction,
    earnedPoints,
    attainablePoints,
    factorsScored,
    factorsTotal: factors.length,
    band: bandFor(conviction),
    factors,
  };
}

/**
 * Scores and ranks a set of instruments, highest conviction first.
 *
 * Unlike screener.ts — which deliberately preserves input order because ordering
 * would imply a ranking — ranking IS the purpose here. That difference is the whole
 * substance of the override in CLAUDE.md, so the two modules stay separate rather
 * than one growing a "sort" flag.
 *
 * Instruments whose every factor is UNAVAILABLE are returned in `unscorable` instead
 * of being ranked last, which would read as "we assessed this and it came bottom".
 */
export function rankInstruments(
  inputs: readonly ScoreInput[],
  benchmark?: Bar[],
): { ranked: StockScore[]; unscorable: { instrumentId: string; tradingSymbol: string; reason: string }[] } {
  const ranked: StockScore[] = [];
  const unscorable: { instrumentId: string; tradingSymbol: string; reason: string }[] = [];

  for (const input of inputs) {
    const score = scoreInstrument(input, benchmark);
    if (score.attainablePoints === 0) {
      unscorable.push({
        instrumentId: input.instrumentId,
        tradingSymbol: input.tradingSymbol,
        reason: `no factor could be computed from ${input.bars.length} bars`,
      });
      continue;
    }
    ranked.push(score);
  }

  // Conviction first, then evidence: two instruments at the same conviction are NOT
  // equally informative if one was judged on seven factors and the other on two.
  // Observed directly — a stock with 28 bars of history tied at 100 with one scored on
  // its full history, which reads as equal confidence and isn't.
  ranked.sort(
    (a, b) =>
      b.conviction - a.conviction ||
      b.attainablePoints - a.attainablePoints ||
      a.tradingSymbol.localeCompare(b.tradingSymbol),
  );
  return { ranked, unscorable };
}
