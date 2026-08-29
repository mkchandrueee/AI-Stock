/**
 * Tests for max pain. Expected values are worked out by hand in each comment — the
 * calculation is a nested sum that's easy to get subtly wrong (an inverted comparison
 * still returns a plausible-looking strike), so the cases below pin the direction.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { computeMaxPain, type ChainRow } from "./option-chain-service.js";

function row(strike: number, callOi: number | null, putOi: number | null): ChainRow {
  const side = (oi: number | null, symbol: string) =>
    oi === null
      ? null
      : {
          instrumentId: `${symbol}${strike}`,
          tradingSymbol: `${symbol}${strike}`,
          ltp: 1,
          netChange: 0,
          percentChange: 0,
          openInterest: oi,
          volume: 0,
        };
  return { strike, call: side(callOi, "CE"), put: side(putOi, "PE") };
}

test("max pain is null when the chain carries no open interest", () => {
  assert.equal(computeMaxPain([row(100, 0, 0), row(110, 0, 0)]), null);
  assert.equal(computeMaxPain([]), null);
});

test("max pain sits where option writers owe least", () => {
  // Two strikes. All the call OI is at 100, all the put OI at 110.
  //   settle 100 -> calls: 0 (not ITM) ; puts at 110: (110-100)*10 = 100  -> pain 100
  //   settle 110 -> calls at 100: (110-100)*10 = 100 ; puts: 0            -> pain 100
  // Tie, so the first-seen lowest wins: 100.
  assert.equal(computeMaxPain([row(100, 10, 0), row(110, 0, 10)]), 100);
});

test("max pain moves toward the strike with the heaviest opposing OI", () => {
  // Huge call OI at 120 means settling high is expensive; pain is minimised low.
  //   settle 100 -> calls at 120 not ITM, puts at 100 not ITM        -> pain 0
  //   settle 120 -> calls at 100: (120-100)*1 = 20; calls at 120: 0
  //                 puts at 100: 0                                   -> pain 20
  const rows = [row(100, 1, 1), row(120, 1000, 1)];
  assert.equal(computeMaxPain(rows), 100);
});

test("max pain ignores strikes with no open interest on either side", () => {
  // The 105 strike is empty and must not be considered a candidate settlement.
  const rows = [row(100, 5, 0), row(105, 0, 0), row(110, 0, 5)];
  const result = computeMaxPain(rows);
  assert.notEqual(result, 105, "an empty strike must not be chosen as max pain");
  assert.ok(result === 100 || result === 110);
});

test("a missing side is treated as zero OI, not as an error", () => {
  // Calls only; nothing should throw and a strike must still be returned.
  const result = computeMaxPain([row(100, 7, null), row(110, 3, null)]);
  assert.equal(result, 100);
});
