/**
 * Option analytics: implied volatility, Greeks, and OI-structure measures.
 *
 * ── Attribution ────────────────────────────────────────────────────────────────
 * The IV solver and the OI-structure measures (PCR near-ATM / far-OTM, OI skew,
 * concentration, gradient, theta pressure) are ported from `AI-trader`
 * (features/option_chain_features.py), MIT Licensed, Copyright (c) 2026 Aaryan Sinha.
 * Ported to TypeScript and adapted; see docs/design/third-party-repo-review.md.
 *
 * Two deliberate departures from the original, both for the same reason. The source
 * returns `0.0` when IV cannot be solved and divides PCR by `max(callOi, 1)`. Both
 * substitute a number where the honest answer is "undefined": an IV of 0 reads as
 * "this option has no volatility", and a PCR computed against a denominator of 1 is
 * arithmetic on a value that isn't there. Every function here returns `null` instead,
 * matching the rest of analytics/ and rule 1.
 *
 * All of this is T1 under spec §92.2 — derived metrics describing where positioning
 * and pricing sit. Nothing here proposes a trade.
 */

/** Indian risk-free rate proxy used for discounting. Same default as the source. */
export const DEFAULT_RISK_FREE_RATE = 0.065;

/** Standard normal CDF via the error function — avoids a stats dependency. */
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Standard normal PDF, needed for gamma and vega. */
function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Abramowitz & Stegun 7.1.26 approximation. Node has no Math.erf, and this is
 * accurate to ~1.5e-7 — far tighter than option premiums are quoted.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export type OptionType = "CE" | "PE";

export interface BlackScholesInputs {
  spot: number;
  strike: number;
  /** Years to expiry. */
  timeToExpiry: number;
  volatility: number;
  riskFreeRate?: number;
}

/** Black-Scholes theoretical price. Returns null for inputs where the model is
 * undefined (non-positive time, vol, spot or strike) rather than a misleading 0. */
export function blackScholesPrice(inputs: BlackScholesInputs, optionType: OptionType): number | null {
  const { spot, strike, timeToExpiry: t, volatility: sigma } = inputs;
  const r = inputs.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
  if (spot <= 0 || strike <= 0 || t <= 0 || sigma <= 0) return null;

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discountedStrike = strike * Math.exp(-r * t);

  return optionType === "CE"
    ? spot * normalCdf(d1) - discountedStrike * normalCdf(d2)
    : discountedStrike * normalCdf(-d2) - spot * normalCdf(-d1);
}

/**
 * Implied volatility by bisection on the Black-Scholes price, which is monotonically
 * increasing in volatility so bisection is guaranteed to converge inside the bracket.
 *
 * Returns null rather than a clamped bound when the premium lies outside the
 * searchable range [0.1%, 500%] — a premium below intrinsic value or above the spot
 * has no implied volatility, and reporting the bracket edge would present a solver
 * failure as a measurement.
 */
export function impliedVolatility(
  premium: number,
  spot: number,
  strike: number,
  daysToExpiry: number,
  optionType: OptionType,
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE,
): number | null {
  if (premium <= 0 || daysToExpiry <= 0 || spot <= 0 || strike <= 0) return null;

  const t = daysToExpiry / 365;
  const priceAt = (sigma: number) =>
    blackScholesPrice({ spot, strike, timeToExpiry: t, volatility: sigma, riskFreeRate }, optionType);

  let lo = 0.001;
  let hi = 5.0;
  const loPrice = priceAt(lo);
  const hiPrice = priceAt(hi);
  // Outside the bracket there is no solution to find.
  if (loPrice === null || hiPrice === null) return null;
  if (premium < loPrice || premium > hiPrice) return null;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const price = priceAt(mid);
    if (price === null) return null;
    if (Math.abs(price - premium) < 1e-6) return mid;
    if (price > premium) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface Greeks {
  delta: number;
  gamma: number;
  /** Per calendar day, not per year — the form traders actually read. */
  theta: number;
  /** Per 1 percentage-point change in volatility. */
  vega: number;
  rho: number;
}

/**
 * Analytic Black-Scholes Greeks. Not in the ported source — added because once IV is
 * known these fall directly out of the same machinery, and spec §92.2 names Greeks as
 * T1 derived metrics.
 */
export function greeks(inputs: BlackScholesInputs, optionType: OptionType): Greeks | null {
  const { spot, strike, timeToExpiry: t, volatility: sigma } = inputs;
  const r = inputs.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
  if (spot <= 0 || strike <= 0 || t <= 0 || sigma <= 0) return null;

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdfD1 = normalPdf(d1);
  const discountedStrike = strike * Math.exp(-r * t);

  const delta = optionType === "CE" ? normalCdf(d1) : normalCdf(d1) - 1;
  const gamma = pdfD1 / (spot * sigma * sqrtT);
  const vega = (spot * pdfD1 * sqrtT) / 100;

  const thetaYearly =
    optionType === "CE"
      ? -(spot * pdfD1 * sigma) / (2 * sqrtT) - r * discountedStrike * normalCdf(d2)
      : -(spot * pdfD1 * sigma) / (2 * sqrtT) + r * discountedStrike * normalCdf(-d2);

  const rho =
    optionType === "CE"
      ? (t * discountedStrike * normalCdf(d2)) / 100
      : (-t * discountedStrike * normalCdf(-d2)) / 100;

  return { delta, gamma, theta: thetaYearly / 365, vega, rho };
}

// ── OI structure ───────────────────────────────────────────────────────────────

/** Minimal shape the OI measures need — decoupled from the chain type so these stay
 * pure and testable without constructing a full chain. */
export interface OiStrike {
  strike: number;
  callOi: number;
  putOi: number;
}

/** How many strikes either side of ATM count as "near". Matches the source's
 * NEAR_ATM_STRIKES. */
export const NEAR_ATM_STRIKES = 3;

/** The listed strike closest to spot. Derived from the chain's own strikes rather
 * than a hardcoded strike gap, which the source assumed. */
export function atmStrike(strikes: readonly OiStrike[], spot: number): number | null {
  if (strikes.length === 0) return null;
  let best = strikes[0]!.strike;
  let bestDistance = Math.abs(best - spot);
  for (const s of strikes) {
    const distance = Math.abs(s.strike - spot);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = s.strike;
    }
  }
  return best;
}

export interface OiStructure {
  /** Put OI / call OI across the whole chain. Null when call OI is zero. */
  pcr: number | null;
  /** Same ratio restricted to ±NEAR_ATM_STRIKES around ATM, where real positioning
   * concentrates. A chain-wide PCR blends this with far-strike lottery tickets. */
  pcrNearAtm: number | null;
  /** Puts below the near band vs calls above it — the tail positioning. */
  pcrFarOtm: number | null;
  /** (ATM put OI − ATM call OI) / total OI. Positive means puts dominate at the money. */
  oiSkew: number | null;
  /** Share of total OI held by the three largest strikes per side. High values mean
   * positioning is pinned to a few strikes. */
  oiConcentration: number | null;
  /** Least-squares slope of OI against strike offset, per side. */
  callOiGradient: number | null;
  putOiGradient: number | null;
  totalCallOi: number;
  totalPutOi: number;
}

/** Least-squares slope of y against x. Null when x has no spread to regress on. */
function slope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    num += dx * (ys[i]! - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den;
}

export function computeOiStructure(strikes: readonly OiStrike[], spot: number): OiStructure {
  const totalCallOi = strikes.reduce((sum, s) => sum + s.callOi, 0);
  const totalPutOi = strikes.reduce((sum, s) => sum + s.putOi, 0);
  const totalOi = totalCallOi + totalPutOi;
  const atm = atmStrike(strikes, spot);

  const ratio = (put: number, call: number): number | null => (call === 0 ? null : put / call);

  if (atm === null || totalOi === 0) {
    return {
      pcr: ratio(totalPutOi, totalCallOi),
      pcrNearAtm: null,
      pcrFarOtm: null,
      oiSkew: null,
      oiConcentration: null,
      callOiGradient: null,
      putOiGradient: null,
      totalCallOi,
      totalPutOi,
    };
  }

  // Strike offsets are measured in listed strikes from ATM, so the bands adapt to
  // whatever strike gap the contract actually uses.
  const sorted = [...strikes].sort((a, b) => a.strike - b.strike);
  const atmIndex = sorted.findIndex((s) => s.strike === atm);
  const offsets = sorted.map((_, i) => i - atmIndex);

  let nearCall = 0;
  let nearPut = 0;
  let farCall = 0;
  let farPut = 0;
  for (let i = 0; i < sorted.length; i++) {
    const offset = offsets[i]!;
    const row = sorted[i]!;
    if (Math.abs(offset) <= NEAR_ATM_STRIKES) {
      nearCall += row.callOi;
      nearPut += row.putOi;
    } else if (offset > NEAR_ATM_STRIKES) {
      farCall += row.callOi; // OTM calls sit above spot
    } else {
      farPut += row.putOi; // OTM puts sit below spot
    }
  }

  const atmRow = sorted[atmIndex];
  const oiSkew = atmRow ? (atmRow.putOi - atmRow.callOi) / totalOi : null;

  const top3 = (values: number[]) =>
    [...values].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const oiConcentration =
    (top3(sorted.map((s) => s.callOi)) + top3(sorted.map((s) => s.putOi))) / totalOi;

  return {
    pcr: ratio(totalPutOi, totalCallOi),
    pcrNearAtm: ratio(nearPut, nearCall),
    pcrFarOtm: ratio(farPut, farCall),
    oiSkew,
    oiConcentration,
    callOiGradient: slope(offsets, sorted.map((s) => s.callOi)),
    putOiGradient: slope(offsets, sorted.map((s) => s.putOi)),
    totalCallOi,
    totalPutOi,
  };
}

/** Premium decay per remaining day at the money — the source's "theta pressure".
 * A crude proxy for time decay that needs no IV, kept alongside the analytic theta
 * above rather than replacing it. */
export function thetaPressure(atmCallPremium: number, atmPutPremium: number, daysToExpiry: number): number | null {
  if (daysToExpiry <= 0) return null;
  const premiums = [atmCallPremium, atmPutPremium].filter((p) => p > 0);
  if (premiums.length === 0) return null;
  const avg = premiums.reduce((a, b) => a + b, 0) / premiums.length;
  return avg / daysToExpiry;
}

/** Whole calendar days from now until expiry, never negative. */
export function daysToExpiry(expiry: string, from: Date = new Date()): number {
  const expiryDate = new Date(`${expiry}T15:30:00+05:30`);
  const ms = expiryDate.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
