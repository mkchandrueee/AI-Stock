/**
 * Tests for the option analytics ported from AI-trader.
 *
 * IV is verified by round-trip rather than against remembered reference values: price
 * an option at a known volatility, then check the solver recovers that volatility from
 * the price. That tests both directions against each other and needs no external table.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  atmStrike,
  blackScholesPrice,
  computeOiStructure,
  daysToExpiry,
  greeks,
  impliedVolatility,
  thetaPressure,
  type OiStrike,
} from "./option-metrics.js";

function close(actual: number | null, expected: number, tolerance: number, label = ""): void {
  assert.notEqual(actual, null, `${label}: expected a value, got null`);
  assert.ok(
    Math.abs((actual as number) - expected) < tolerance,
    `${label}: expected ~${expected}, got ${actual}`,
  );
}

// ---- Black-Scholes pricing ----

test("a call is worth at least its intrinsic value", () => {
  // Spot 100, strike 90 -> intrinsic 10. Time value can only add.
  const price = blackScholesPrice(
    { spot: 100, strike: 90, timeToExpiry: 0.25, volatility: 0.2 },
    "CE",
  );
  assert.ok((price as number) >= 10, `expected >= intrinsic 10, got ${price}`);
});

test("put-call parity holds: C - P = S - K*e^(-rT)", () => {
  const inputs = { spot: 100, strike: 100, timeToExpiry: 0.5, volatility: 0.25, riskFreeRate: 0.065 };
  const call = blackScholesPrice(inputs, "CE")!;
  const put = blackScholesPrice(inputs, "PE")!;
  const expected = 100 - 100 * Math.exp(-0.065 * 0.5);
  close(call - put, expected, 1e-6, "parity");
});

test("a higher volatility is worth more", () => {
  const low = blackScholesPrice({ spot: 100, strike: 100, timeToExpiry: 0.25, volatility: 0.1 }, "CE")!;
  const high = blackScholesPrice({ spot: 100, strike: 100, timeToExpiry: 0.25, volatility: 0.5 }, "CE")!;
  assert.ok(high > low, "price must increase with volatility");
});

test("pricing returns null where the model is undefined, not zero", () => {
  assert.equal(blackScholesPrice({ spot: 100, strike: 100, timeToExpiry: 0, volatility: 0.2 }, "CE"), null);
  assert.equal(blackScholesPrice({ spot: 100, strike: 100, timeToExpiry: 0.5, volatility: 0 }, "CE"), null);
});

// ---- Implied volatility ----

test("IV round-trips: solving a priced option recovers its volatility", () => {
  for (const sigma of [0.12, 0.25, 0.6]) {
    for (const type of ["CE", "PE"] as const) {
      const days = 30;
      const price = blackScholesPrice(
        { spot: 1287, strike: 1300, timeToExpiry: days / 365, volatility: sigma },
        type,
      )!;
      const recovered = impliedVolatility(price, 1287, 1300, days, type);
      close(recovered, sigma, 1e-3, `${type} at sigma ${sigma}`);
    }
  }
});

test("IV is null for a premium outside any solvable volatility", () => {
  // A premium above the spot cannot be produced by any volatility.
  assert.equal(impliedVolatility(5000, 1287, 1300, 30, "CE"), null);
  // Non-positive inputs have no solution either.
  assert.equal(impliedVolatility(0, 1287, 1300, 30, "CE"), null);
  assert.equal(impliedVolatility(50, 1287, 1300, 0, "CE"), null);
});

// ---- Greeks ----

test("call delta sits in [0,1] and put delta in [-1,0]", () => {
  const inputs = { spot: 100, strike: 100, timeToExpiry: 0.25, volatility: 0.2 };
  const call = greeks(inputs, "CE")!;
  const put = greeks(inputs, "PE")!;
  assert.ok(call.delta > 0 && call.delta < 1, `call delta ${call.delta}`);
  assert.ok(put.delta > -1 && put.delta < 0, `put delta ${put.delta}`);
});

test("delta approximates the derivative of price with respect to spot", () => {
  // Numerically differentiate the pricing function and compare to analytic delta.
  const base = { spot: 100, strike: 100, timeToExpiry: 0.25, volatility: 0.2 };
  const h = 0.01;
  const up = blackScholesPrice({ ...base, spot: 100 + h }, "CE")!;
  const down = blackScholesPrice({ ...base, spot: 100 - h }, "CE")!;
  const numeric = (up - down) / (2 * h);
  close(greeks(base, "CE")!.delta, numeric, 1e-4, "delta vs numeric derivative");
});

test("gamma is identical for calls and puts, and positive", () => {
  const inputs = { spot: 100, strike: 100, timeToExpiry: 0.25, volatility: 0.2 };
  const call = greeks(inputs, "CE")!;
  const put = greeks(inputs, "PE")!;
  close(call.gamma, put.gamma, 1e-12, "gamma parity");
  assert.ok(call.gamma > 0);
});

test("theta is negative for a long option — time decay costs the holder", () => {
  const inputs = { spot: 100, strike: 100, timeToExpiry: 0.25, volatility: 0.2 };
  assert.ok(greeks(inputs, "CE")!.theta < 0);
});

// ---- OI structure ----

function chain(): OiStrike[] {
  // 13 strikes so a +/-3 band around ATM (100) is a genuine subset, not the whole
  // chain — the first version of this fixture had 7 strikes, which made near-ATM PCR
  // trivially equal to chain-wide PCR and hid the very thing being tested.
  // Calls build monotonically upward, puts monotonically downward, with heavy far-OTM
  // put OI: the ordinary shape of an equity chain.
  return [
    { strike: 70, callOi: 5, putOi: 2000 },
    { strike: 75, callOi: 5, putOi: 1500 },
    { strike: 80, callOi: 10, putOi: 1000 },
    { strike: 85, callOi: 20, putOi: 400 },
    { strike: 90, callOi: 30, putOi: 300 },
    { strike: 95, callOi: 50, putOi: 250 },
    { strike: 100, callOi: 100, putOi: 200 },
    { strike: 105, callOi: 300, putOi: 60 },
    { strike: 110, callOi: 400, putOi: 30 },
    { strike: 115, callOi: 500, putOi: 20 },
    { strike: 120, callOi: 600, putOi: 10 },
    { strike: 125, callOi: 700, putOi: 5 },
    { strike: 130, callOi: 800, putOi: 5 },
  ];
}

test("atmStrike picks the listed strike nearest spot", () => {
  assert.equal(atmStrike(chain(), 101), 100);
  assert.equal(atmStrike(chain(), 104), 105);
  assert.equal(atmStrike([], 100), null);
});

test("PCR is total put OI over total call OI", () => {
  const s = computeOiStructure(chain(), 100);
  // calls 5+5+10+20+30+50+100+300+400+500+600+700+800 = 3520
  // puts 2000+1500+1000+400+300+250+200+60+30+20+10+5+5 = 5780
  assert.equal(s.totalCallOi, 3520);
  assert.equal(s.totalPutOi, 5780);
  close(s.pcr, 5780 / 3520, 1e-9, "pcr");
});

test("PCR is null when there is no call OI to divide by, never a substituted 1", () => {
  const s = computeOiStructure([{ strike: 100, callOi: 0, putOi: 250 }], 100);
  assert.equal(s.pcr, null, "an undefined ratio must not be reported as a number");
});

test("near-ATM PCR differs sharply from chain-wide PCR — the reason for splitting them", () => {
  const s = computeOiStructure(chain(), 100);
  // Near band is strikes 85..115: puts 1260, calls 1400 -> 0.90
  close(s.pcrNearAtm, 1260 / 1400, 1e-9, "pcrNearAtm");
  // Far band: puts below 85 = 4500, calls above 115 = 2100 -> ~2.14
  close(s.pcrFarOtm, 4500 / 2100, 1e-9, "pcrFarOtm");
  // Chain-wide sits at ~1.64 - between the two, and describing neither. Heavy
  // far-OTM put OI drags the blended figure well away from real near-money
  // positioning, which is exactly what the split exists to separate.
  assert.ok(
    (s.pcrNearAtm as number) < (s.pcr as number) && (s.pcr as number) < (s.pcrFarOtm as number),
    `expected near < chain < far, got ${s.pcrNearAtm} / ${s.pcr} / ${s.pcrFarOtm}`,
  );
});

test("oiSkew is positive when puts dominate at the money", () => {
  const s = computeOiStructure(chain(), 100); // ATM row: 100 calls vs 200 puts
  assert.ok((s.oiSkew as number) > 0);
});

test("oiConcentration is a fraction of total OI", () => {
  const s = computeOiStructure(chain(), 100);
  assert.ok((s.oiConcentration as number) > 0 && (s.oiConcentration as number) <= 1);
});

test("call OI gradient is positive when call OI rises with strike", () => {
  const s = computeOiStructure(chain(), 100);
  assert.ok((s.callOiGradient as number) > 0, "calls build upward in this chain");
  assert.ok((s.putOiGradient as number) < 0, "puts build downward in this chain");
});

// ---- helpers ----

test("thetaPressure is null without a positive premium or remaining time", () => {
  assert.equal(thetaPressure(0, 0, 5), null);
  assert.equal(thetaPressure(10, 12, 0), null);
  close(thetaPressure(10, 20, 5), 3, 1e-9, "avg 15 over 5 days");
});

test("daysToExpiry never goes negative", () => {
  assert.equal(daysToExpiry("2020-01-01", new Date("2026-01-01T00:00:00Z")), 0);
  assert.ok(daysToExpiry("2026-09-29", new Date("2026-08-29T00:00:00Z")) > 25);
});
