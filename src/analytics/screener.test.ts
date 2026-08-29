/**
 * Tests for the screening engine. The cases that matter most here aren't the happy
 * path — they're the ones where an instrument *can't* be evaluated, since the design
 * rule is that "we couldn't tell" must never be reported as "doesn't match."
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { criterionLabel, isUsableCriteriaSet, screen, type ScreenerCandidate } from "./screener.js";

function candidate(symbol: string, closes: number[]): ScreenerCandidate {
  return { instrumentId: `id-${symbol}`, tradingSymbol: symbol, exchange: "NSE", closes };
}

test("matches a candidate that satisfies a CLOSE criterion", () => {
  const result = screen(
    [candidate("AAA", [10, 20, 30])],
    [{ indicator: "CLOSE", operator: "GT", value: 25 }],
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]!.tradingSymbol, "AAA");
  assert.equal(result.matches[0]!.values["CLOSE"], 30);
  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.skipped.length, 0);
});

test("excludes a candidate that fails the criterion, but still counts it as evaluated", () => {
  const result = screen(
    [candidate("AAA", [10, 20, 30])],
    [{ indicator: "CLOSE", operator: "LT", value: 25 }],
  );
  assert.equal(result.matches.length, 0);
  // Evaluated but not matched - distinct from skipped, which is the whole point.
  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.skipped.length, 0);
});

test("skips - does not exclude - a candidate with too little history", () => {
  // RSI(14) needs 15 closes; this candidate has 3.
  const result = screen(
    [candidate("SHORT", [10, 11, 12])],
    [{ indicator: "RSI", period: 14, operator: "LT", value: 30 }],
  );
  assert.equal(result.matches.length, 0);
  assert.equal(result.evaluatedCount, 0, "an unevaluatable candidate must not count as evaluated");
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0]!.tradingSymbol, "SHORT");
  assert.match(result.skipped[0]!.reason, /insufficient price history for RSI\(14\)/);
});

test("all criteria must hold, not just one", () => {
  // CLOSE = 30 (passes > 25), SMA(3) = 20 (fails > 25)
  const result = screen(
    [candidate("AAA", [10, 20, 30])],
    [
      { indicator: "CLOSE", operator: "GT", value: 25 },
      { indicator: "SMA", period: 3, operator: "GT", value: 25 },
    ],
  );
  assert.equal(result.matches.length, 0);
  assert.equal(result.evaluatedCount, 1);
});

test("reports every criterion's value on a match, so the result is inspectable", () => {
  // closes [10,20,30]: CLOSE = 30, SMA(3) = 60/3 = 20
  const result = screen(
    [candidate("AAA", [10, 20, 30])],
    [
      { indicator: "CLOSE", operator: "GT", value: 5 },
      { indicator: "SMA", period: 3, operator: "GT", value: 5 },
    ],
  );
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0]!.values, { CLOSE: 30, "SMA(3)": 20 });
});

test("separates matches, non-matches and skips across a mixed set", () => {
  const result = screen(
    [
      candidate("MATCH", [10, 20, 30]), // CLOSE 30 > 25
      candidate("NOMATCH", [10, 20, 21]), // CLOSE 21, fails
      candidate("TOOSHORT", []), // no data at all
    ],
    [{ indicator: "CLOSE", operator: "GT", value: 25 }],
  );
  assert.deepEqual(result.matches.map((m) => m.tradingSymbol), ["MATCH"]);
  assert.deepEqual(result.skipped.map((s) => s.tradingSymbol), ["TOOSHORT"]);
  assert.equal(result.evaluatedCount, 2);
});

test("preserves input order and applies no ranking of its own", () => {
  // Descending closes: if the engine sorted by value, ZZZ would come first.
  const result = screen(
    [candidate("ZZZ", [1, 1, 5]), candidate("AAA", [1, 1, 99])],
    [{ indicator: "CLOSE", operator: "GT", value: 0 }],
  );
  assert.deepEqual(result.matches.map((m) => m.tradingSymbol), ["ZZZ", "AAA"]);
});

test("skips a periodless criterion that requires a period, rather than guessing one", () => {
  const result = screen([candidate("AAA", [1, 2, 3])], [{ indicator: "SMA", operator: "GT", value: 1 }]);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0]!.reason, /requires a period/);
});

test("each comparison operator behaves as written", () => {
  const only = (op: "LT" | "LTE" | "GT" | "GTE", threshold: number) =>
    screen([candidate("AAA", [10])], [{ indicator: "CLOSE", operator: op, value: threshold }])
      .matches.length === 1;

  assert.equal(only("LT", 10), false, "10 < 10 is false");
  assert.equal(only("LTE", 10), true, "10 <= 10 is true");
  assert.equal(only("GT", 10), false, "10 > 10 is false");
  assert.equal(only("GTE", 10), true, "10 >= 10 is true");
});

test("criterionLabel includes the period only when there is one", () => {
  assert.equal(criterionLabel({ indicator: "CLOSE", operator: "GT", value: 1 }), "CLOSE");
  assert.equal(criterionLabel({ indicator: "RSI", period: 14, operator: "LT", value: 30 }), "RSI(14)");
});

test("an empty criteria set is flagged as unusable rather than matching everything", () => {
  assert.equal(isUsableCriteriaSet([]), false);
  assert.equal(isUsableCriteriaSet([{ indicator: "CLOSE", operator: "GT", value: 1 }]), true);
});
