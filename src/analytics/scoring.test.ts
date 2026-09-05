/**
 * Tests for the scoring engine. The cases that matter most are the ones about
 * *missing* data: a factor that can't be computed must not quietly become a zero,
 * because that turns "unknown" into "bad" and corrupts every ranking below it.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bandFor, rankInstruments, scoreInstrument, type Bar } from "./scoring.js";

/** Builds a synthetic series. Clearly-marked test fixture, per CLAUDE.md rule 1. */
function bars(closes: number[], volume = 1000): Bar[] {
  return closes.map((close, i) => ({
    timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume,
  }));
}

function rising(count: number, start = 100, step = 1): number[] {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

test("a steadily rising series scores well and lands in a strong band", () => {
  const score = scoreInstrument({
    instrumentId: "i1",
    tradingSymbol: "UP",
    exchange: "NSE",
    bars: bars(rising(120)),
  });
  assert.ok(score.conviction > 60, `expected a high conviction, got ${score.conviction}`);
  assert.equal(score.factors.find((f) => f.factor === "Trend")!.status, "SCORED");
});

test("a steadily falling series scores poorly", () => {
  const score = scoreInstrument({
    instrumentId: "i2",
    tradingSymbol: "DOWN",
    exchange: "NSE",
    bars: bars(rising(120, 220, -1)),
  });
  assert.ok(score.conviction < 40, `expected a low conviction, got ${score.conviction}`);
});

test("an uncomputable factor is UNAVAILABLE and leaves the attainable total smaller", () => {
  // 30 bars: enough for trend/RSI/volume?  Volume needs 50, momentum needs 61.
  const score = scoreInstrument({
    instrumentId: "i3",
    tradingSymbol: "SHORT",
    exchange: "NSE",
    bars: bars(rising(30)),
  });
  const momentum = score.factors.find((f) => f.factor === "Momentum")!;
  assert.equal(momentum.status, "UNAVAILABLE");
  assert.equal(momentum.points, 0);
  // The key property: an unavailable factor's max is excluded, so the stock isn't
  // penalised for history we didn't have.
  assert.ok(
    score.attainablePoints < 100,
    `attainable should shrink when factors are unavailable, got ${score.attainablePoints}`,
  );
});

test("missing history does not drag conviction down", () => {
  // Same price path, different amounts of history. The shorter one is missing
  // factors, but must not therefore score worse on the factors it does have.
  const long = scoreInstrument({
    instrumentId: "a",
    tradingSymbol: "LONG",
    exchange: "NSE",
    bars: bars(rising(120)),
  });
  const short = scoreInstrument({
    instrumentId: "b",
    tradingSymbol: "SHORTER",
    exchange: "NSE",
    bars: bars(rising(55)),
  });
  assert.ok(
    Math.abs(long.conviction - short.conviction) < 25,
    `normalisation should keep these comparable: ${long.conviction} vs ${short.conviction}`,
  );
});

test("relative strength is UNAVAILABLE without a benchmark, not zero", () => {
  const score = scoreInstrument({
    instrumentId: "i4",
    tradingSymbol: "NOBENCH",
    exchange: "NSE",
    bars: bars(rising(120)),
  });
  const rs = score.factors.find((f) => f.factor === "Relative strength")!;
  assert.equal(rs.status, "UNAVAILABLE");
  assert.match(rs.detail, /no benchmark/);
});

test("relative strength scores when a benchmark is supplied", () => {
  const strong = scoreInstrument(
    { instrumentId: "i5", tradingSymbol: "STRONG", exchange: "NSE", bars: bars(rising(120, 100, 2)) },
    bars(rising(120, 100, 0.1)), // benchmark barely moves
  );
  const rs = strong.factors.find((f) => f.factor === "Relative strength")!;
  assert.equal(rs.status, "SCORED");
  assert.ok(rs.points > 0, "outperforming the benchmark should earn points");
});

test("every factor reports an inspectable reason, per spec §20", () => {
  const score = scoreInstrument({
    instrumentId: "i6",
    tradingSymbol: "ANY",
    exchange: "NSE",
    bars: bars(rising(120)),
  });
  for (const factor of score.factors) {
    assert.ok(factor.detail.length > 0, `${factor.factor} has no detail`);
    assert.ok(factor.max > 0, `${factor.factor} has no maximum`);
  }
});

test("ranking orders by conviction, highest first", () => {
  const { ranked } = rankInstruments([
    { instrumentId: "d", tradingSymbol: "DOWN", exchange: "NSE", bars: bars(rising(120, 220, -1)) },
    { instrumentId: "u", tradingSymbol: "UP", exchange: "NSE", bars: bars(rising(120)) },
  ]);
  assert.equal(ranked[0]!.tradingSymbol, "UP");
  assert.ok(ranked[0]!.conviction >= ranked[1]!.conviction);
});

test("instruments with no computable factor are set aside, not ranked last", () => {
  const { ranked, unscorable } = rankInstruments([
    { instrumentId: "u", tradingSymbol: "UP", exchange: "NSE", bars: bars(rising(120)) },
    { instrumentId: "e", tradingSymbol: "EMPTY", exchange: "NSE", bars: [] },
  ]);
  assert.deepEqual(ranked.map((r) => r.tradingSymbol), ["UP"]);
  assert.equal(unscorable.length, 1);
  assert.equal(unscorable[0]!.tradingSymbol, "EMPTY");
});

test("score bands map as documented", () => {
  assert.equal(bandFor(80), "STRONG");
  assert.equal(bandFor(75), "STRONG");
  assert.equal(bandFor(60), "MODERATE");
  assert.equal(bandFor(40), "NEUTRAL");
  assert.equal(bandFor(10), "WEAK");
});

test("equal conviction ranks the better-evidenced instrument first", () => {
  // Both should reach a high conviction, but one has only enough history for a
  // couple of factors. Tying them would present thin evidence as equal confidence.
  const { ranked } = rankInstruments([
    { instrumentId: "thin", tradingSymbol: "THIN", exchange: "NSE", bars: bars(rising(28)) },
    { instrumentId: "full", tradingSymbol: "FULL", exchange: "NSE", bars: bars(rising(120)) },
  ]);
  const thin = ranked.find((r) => r.tradingSymbol === "THIN")!;
  const full = ranked.find((r) => r.tradingSymbol === "FULL")!;
  assert.ok(full.factorsScored > thin.factorsScored, "fixture should differ in evidence");
  if (thin.conviction === full.conviction) {
    assert.equal(ranked[0]!.tradingSymbol, "FULL", "more evidence must win the tie");
  }
  assert.ok(full.attainablePoints > thin.attainablePoints);
});

test("factorsScored reports the evidence base behind a conviction", () => {
  const score = scoreInstrument({
    instrumentId: "x",
    tradingSymbol: "X",
    exchange: "NSE",
    bars: bars(rising(28)),
  });
  assert.ok(score.factorsScored < score.factorsTotal, "thin history should leave factors unscored");
  assert.ok(score.factorsScored > 0);
});
