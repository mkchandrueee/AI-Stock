/**
 * Tests for the OHLC indicators and regime detection.
 *
 * Where a closed form exists the expected value is derived by hand in a comment.
 * Where it doesn't (ADX, MACD), the tests pin invariants that a wrong implementation
 * would violate — direction, bounds, and behaviour on constructed series whose answer
 * is unambiguous.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  adx,
  atr,
  atrPercent,
  bollingerBands,
  cci,
  emaSeries,
  macd,
  rateOfChange,
  realisedVolatility,
  williamsR,
  type OhlcvBar,
} from "./indicators-ohlc.js";
import { detectRegime } from "./regime.js";

/** Clearly-marked synthetic fixture (rule 1). */
function bar(close: number, high = close, low = close, volume = 1000): OhlcvBar {
  return { timestamp: "2026-01-01T00:00:00Z", open: close, high, low, close, volume };
}

function series(closes: number[], spread = 0): OhlcvBar[] {
  return closes.map((c) => bar(c, c + spread, c - spread));
}

function ramp(count: number, start = 100, step = 1): number[] {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

// ── emaSeries ──────────────────────────────────────────────────────────────────

test("emaSeries is null until the seed window fills, then seeds with the SMA", () => {
  const out = emaSeries([1, 2, 3, 4], 3);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
  assert.equal(out[2], 2); // sma(1,2,3)
  // k = 2/(3+1) = 0.5 -> (4 - 2) * 0.5 + 2 = 3
  assert.equal(out[3], 3);
});

// ── MACD ───────────────────────────────────────────────────────────────────────

test("MACD histogram is macd minus signal", () => {
  const result = macd(ramp(80))!;
  assert.notEqual(result, null);
  assert.ok(Math.abs(result.histogram - (result.macd - result.signal)) < 1e-12);
});

test("MACD is positive in a sustained uptrend and negative in a downtrend", () => {
  assert.ok(macd(ramp(80))!.macd > 0, "rising series: fast EMA leads slow");
  assert.ok(macd(ramp(80, 200, -1))!.macd < 0, "falling series: fast EMA lags slow");
});

test("MACD returns null without enough history for the signal line", () => {
  assert.equal(macd(ramp(20)), null);
});

// ── ATR ────────────────────────────────────────────────────────────────────────

test("ATR of a constant-range series equals that range", () => {
  // Every bar spans exactly 2 (close +/- 1) and never gaps, so true range is 2.
  const bars = series(new Array(30).fill(100), 1);
  assert.ok(Math.abs(atr(bars, 14)! - 2) < 1e-9);
});

test("atrPercent scales ATR by price", () => {
  const bars = series(new Array(30).fill(100), 1);
  // ATR 2 on a close of 100 -> 2%
  assert.ok(Math.abs(atrPercent(bars, 14)! - 2) < 1e-9);
});

test("ATR needs period + 1 bars, since true range is a bar-to-bar measure", () => {
  assert.equal(atr(series(ramp(14)), 14), null);
  assert.notEqual(atr(series(ramp(15)), 14), null);
});

// ── Bollinger ──────────────────────────────────────────────────────────────────

test("Bollinger bands collapse onto the mean for a flat series", () => {
  const b = bollingerBands(new Array(25).fill(50), 20)!;
  assert.equal(b.middle, 50);
  assert.equal(b.upper, 50);
  assert.equal(b.lower, 50);
  assert.equal(b.width, 0);
  // Zero-width band: there is no position within it to report.
  assert.equal(b.percentB, null);
});

test("percentB is 1 at the upper band and 0 at the lower", () => {
  const closes = ramp(20);
  const b = bollingerBands(closes, 20)!;
  // Reconstruct where the last close sits, independently of the implementation.
  const expected = (closes[closes.length - 1]! - b.lower) / (b.upper - b.lower);
  assert.ok(Math.abs(b.percentB! - expected) < 1e-12);
  assert.ok(b.upper > b.middle && b.middle > b.lower);
});

// ── ADX ────────────────────────────────────────────────────────────────────────

test("ADX reports +DI above -DI in a clean uptrend, and the reverse in a downtrend", () => {
  const up = adx(series(ramp(60)), 14)!;
  assert.ok(up.diPlus > up.diMinus, `expected +DI > -DI, got ${up.diPlus} / ${up.diMinus}`);

  const down = adx(series(ramp(60, 200, -1)), 14)!;
  assert.ok(down.diMinus > down.diPlus, `expected -DI > +DI, got ${down.diPlus} / ${down.diMinus}`);
});

test("ADX is high for a persistent trend and low for a choppy series", () => {
  const trending = adx(series(ramp(60)), 14)!;
  // Alternating up/down: direction never persists, so trend strength should be low.
  const choppy = adx(series(Array.from({ length: 60 }, (_, i) => 100 + (i % 2))), 14)!;
  assert.ok(
    trending.adx > choppy.adx,
    `trend ${trending.adx.toFixed(1)} should exceed chop ${choppy.adx.toFixed(1)}`,
  );
});

test("ADX needs roughly twice the period of history and returns null below it", () => {
  assert.equal(adx(series(ramp(20)), 14), null);
  assert.notEqual(adx(series(ramp(40)), 14), null);
});

// ── Oscillators ────────────────────────────────────────────────────────────────

test("Williams %R is 0 at the period high and -100 at the period low", () => {
  const rising = series(ramp(20));
  assert.ok(Math.abs(williamsR(rising, 14)!) < 1e-9, "closing at the high -> 0");

  const falling = series(ramp(20, 200, -1));
  assert.ok(Math.abs(williamsR(falling, 14)! + 100) < 1e-9, "closing at the low -> -100");
});

test("Williams %R is null when the window has no range", () => {
  assert.equal(williamsR(series(new Array(20).fill(100)), 14), null);
});

test("CCI is positive above the mean and null with no deviation", () => {
  assert.ok(cci(series(ramp(30)), 20)! > 0);
  assert.equal(cci(series(new Array(30).fill(100)), 20), null);
});

test("rateOfChange measures percentage move over the window", () => {
  // 100 -> 110 over 10 bars = +10%
  assert.ok(Math.abs(rateOfChange([...ramp(10, 100, 0), 110], 10)! - 10) < 1e-9);
  assert.equal(rateOfChange([1, 2], 10), null);
});

test("realisedVolatility is zero for a flat series and positive when it moves", () => {
  assert.ok(Math.abs(realisedVolatility(new Array(30).fill(100), 20)!) < 1e-9);
  assert.ok(realisedVolatility(ramp(30), 20)! > 0);
});

// ── Regime ─────────────────────────────────────────────────────────────────────

test("a sustained advance is BULL", () => {
  const r = detectRegime(series(ramp(80)));
  assert.equal(r.regime, "BULL");
  assert.ok(r.distanceFromSlowPct! > 0);
});

test("a sustained decline is BEAR", () => {
  const r = detectRegime(series(ramp(80, 300, -2)));
  assert.equal(r.regime, "BEAR");
  assert.ok(r.distanceFromSlowPct! < 0);
});

test("a flat market is SIDEWAYS, and reports no trend strength", () => {
  const r = detectRegime(series(new Array(80).fill(100)));
  assert.equal(r.regime, "SIDEWAYS");
  assert.equal(r.strength, null, "trend strength is not meaningful without a trend");
});

test("price hugging the slow average is SIDEWAYS even while averages are crossed", () => {
  // A drift so gentle that the averages cross bullishly while price stays inside the
  // 2% band. 80 bars rising 0.1 each from 150: last close 157.9, SMA(50) 155.45
  // (1.58% away, inside tolerance), SMA(20) 156.95 — so fast > slow > nothing decisive.
  // The first version of this fixture ramped by 1.0 and sat 6.2% above the slow
  // average, which is a real uptrend; the test failed and the fixture was corrected
  // rather than the tolerance loosened.
  const r = detectRegime(series(ramp(80, 150, 0.1)));
  assert.equal(r.regime, "SIDEWAYS", `got ${r.regime}: ${r.detail}`);
  assert.match(r.detail, /within 2%/);
});

test("insufficient history is UNKNOWN, never a guessed regime", () => {
  const r = detectRegime(series(ramp(10)));
  assert.equal(r.regime, "UNKNOWN");
  assert.equal(r.adx, null);
  assert.match(r.detail, /needs at least 50 bars/);
});

test("regime strength distinguishes a decisive trend from a weak one", () => {
  const strong = detectRegime(series(ramp(80)));
  assert.notEqual(strong.adx, null);
  assert.ok(
    ["MODERATE", "STRONG"].includes(strong.strength!),
    `a clean ramp should not read WEAK, got ${strong.strength} at ADX ${strong.adx}`,
  );
});
