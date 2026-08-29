/**
 * Tests for the indicator math. Every expected value here is derived by hand in the
 * comment above it — none are copied from a reference implementation or a remembered
 * table, so a passing test means the arithmetic is actually right rather than merely
 * matching whatever was asserted.
 *
 * Uses node:test, so there's no test-framework dependency to add.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { distanceFromSmaPct, ema, rsi, sma } from "./indicators.js";

/** Float comparison — several expected values are exact in decimal but not binary. */
function assertClose(actual: number | null, expected: number, tolerance = 1e-9): void {
  assert.notEqual(actual, null, "expected a value, got null");
  assert.ok(
    Math.abs((actual as number) - expected) < tolerance,
    `expected ~${expected}, got ${actual}`,
  );
}

// ---- SMA ----

test("sma averages the whole series when period equals its length", () => {
  // (1+2+3+4+5)/5 = 15/5 = 3
  assertClose(sma([1, 2, 3, 4, 5], 5), 3);
});

test("sma uses only the most recent `period` values", () => {
  // last two of [2,4,6] are 4 and 6 -> (4+6)/2 = 5
  assertClose(sma([2, 4, 6], 2), 5);
});

test("sma returns null rather than averaging a short series", () => {
  assert.equal(sma([1, 2], 5), null);
  assert.equal(sma([], 1), null);
  assert.equal(sma([1, 2, 3], 0), null);
});

// ---- EMA ----

test("ema of a constant series is that constant", () => {
  // seed = sma([5,5,5]) = 5; each step: (5 - 5) * k + 5 = 5
  assertClose(ema([5, 5, 5, 5, 5], 3), 5);
});

test("ema with exactly `period` values is just the seed SMA", () => {
  // seed = sma([1,2,3], 3) = 2, and there are no further values to advance through
  assertClose(ema([1, 2, 3], 3), 2);
});

test("ema advances from the seed by the smoothing factor", () => {
  // seed = sma([1,2,3],3) = 2. k = 2/(3+1) = 0.5.
  // next close 4 -> (4 - 2) * 0.5 + 2 = 3
  assertClose(ema([1, 2, 3, 4], 3), 3);
});

test("ema returns null on insufficient data", () => {
  assert.equal(ema([1, 2], 3), null);
});

// ---- RSI ----

test("rsi is 100 when the window contains only gains", () => {
  // changes [1,1,1,1] -> avgLoss = 0, avgGain > 0 -> 100 by definition
  assertClose(rsi([1, 2, 3, 4, 5], 4), 100);
});

test("rsi is 0 when the window contains only losses", () => {
  // changes [-1,-1,-1,-1] -> avgGain = 0 -> RS = 0 -> 100 - 100/1 = 0
  assertClose(rsi([5, 4, 3, 2, 1], 4), 0);
});

test("rsi is 50 when average gain equals average loss", () => {
  // closes [10,11,10,11,10] -> changes [+1,-1,+1,-1]
  // avgGain = 2/4 = 0.5, avgLoss = 2/4 = 0.5 -> RS = 1 -> 100 - 100/2 = 50
  assertClose(rsi([10, 11, 10, 11, 10], 4), 50);
});

test("rsi applies Wilder smoothing beyond the seed window", () => {
  // closes [10,11,10,11,10,11] -> changes [+1,-1,+1,-1,+1]
  // seed over first 4 changes: avgGain = 0.5, avgLoss = 0.5
  // 5th change is +1 (gain 1, loss 0):
  //   avgGain = (0.5*3 + 1)/4 = 2.5/4 = 0.625
  //   avgLoss = (0.5*3 + 0)/4 = 1.5/4 = 0.375
  // RS = 0.625/0.375 = 5/3 -> RSI = 100 - 100/(1 + 5/3) = 100 - 37.5 = 62.5
  assertClose(rsi([10, 11, 10, 11, 10, 11], 4), 62.5);
});

test("rsi treats a perfectly flat series as neutral, by stated convention", () => {
  // no gains and no losses: RSI is genuinely undefined (0/0); the function
  // documents 50 as a convention rather than a computed result
  assertClose(rsi([3, 3, 3, 3, 3], 4), 50);
});

test("rsi needs period + 1 closes, since it works on changes", () => {
  assert.equal(rsi([1, 2, 3], 4), null); // 3 closes -> only 2 changes
  assert.notEqual(rsi([1, 2, 3, 4, 5], 4), null); // 5 closes -> 4 changes
});

// ---- distance from SMA ----

test("distanceFromSmaPct measures the latest close against its own average", () => {
  // sma([1,3], 2) = 2; latest = 3 -> (3 - 2)/2 * 100 = 50
  assertClose(distanceFromSmaPct([1, 3], 2), 50);
});

test("distanceFromSmaPct is 0 when price sits on its average", () => {
  assertClose(distanceFromSmaPct([5, 5, 5], 3), 0);
});

test("distanceFromSmaPct is negative below the average", () => {
  // sma([3,1], 2) = 2; latest = 1 -> (1 - 2)/2 * 100 = -50
  assertClose(distanceFromSmaPct([3, 1], 2), -50);
});

test("distanceFromSmaPct returns null on insufficient data", () => {
  assert.equal(distanceFromSmaPct([1], 5), null);
});
