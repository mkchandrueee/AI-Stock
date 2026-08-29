/**
 * Populates `instrument.underlying_instrument_id` for derivatives.
 *
 * Why this exists: the schema has modelled the derivative→underlying link since
 * migration 0001, but ingestion never filled it — all 35,282 NFO rows (and the BFO
 * ones) had it NULL. Expiry and strike were captured; the link wasn't. Without it
 * there is no path from an equity to its option chain, no per-underlying PCR, and no
 * way to connect F&O activity to the equity scanner.
 *
 * The link is taken from Angel One's own scrip master `name` field, which for a
 * derivative is the underlying's symbol (`DIVISLAB` for `DIVISLAB29SEP267200CE`).
 * The ingestion module declares that field in its row type and then never reads it.
 * Using the broker's own value is materially better than parsing the trading symbol:
 * symbol formats vary by segment and would need guesswork about where the expiry
 * begins, and rule 2 rules out inferring what a source already states outright.
 *
 * Deliberately additive and idempotent: it only fills rows where the column is NULL,
 * and never rewrites an existing link. Index derivatives (NIFTY, BANKNIFTY, ...)
 * have no equity row to point at and are reported as unmatched rather than forced
 * onto some near-miss symbol.
 */
import type { Pool } from "pg";
import { fetchScripMaster } from "./angel-one-instrument-ingestion.js";

const DERIVATIVE_EXCHANGES = new Set(["NFO", "BFO"]);

/** Cash exchange each derivative segment's underlying lists on. */
const UNDERLYING_EXCHANGE: Record<string, string> = { NFO: "NSE", BFO: "BSE" };

export interface UnderlyingLinkSummary {
  derivativeRowsSeen: number;
  alreadyLinked: number;
  linked: number;
  unmatchedUnderlyings: { name: string; exchange: string; contracts: number }[];
  /** Derivatives whose token is absent from the CURRENT scrip master. Overwhelmingly
   * expired contracts: they were ingested when live and the broker has since dropped
   * them from the dump, so there is nothing left to link them against. Reported, not
   * treated as an error. */
  unknownTokens: number;
}

export async function backfillUnderlyingLinks(pool: Pool): Promise<UnderlyingLinkSummary> {
  const rows = await fetchScripMaster();

  // token -> underlying name, from the broker's own data.
  const underlyingNameByToken = new Map<string, { name: string; exchange: string }>();
  for (const row of rows) {
    if (!DERIVATIVE_EXCHANGES.has(row.exch_seg)) continue;
    const name = (row.name ?? "").trim().toUpperCase();
    if (!name) continue;
    underlyingNameByToken.set(String(row.token), { name, exchange: row.exch_seg });
  }

  // Equity symbols -> instrument_id. Angel One's cash symbols carry a series suffix
  // (`RELIANCE-EQ`) while the derivative's `name` does not (`RELIANCE`), so match on
  // the part before the dash.
  const equities = await pool.query<{ instrument_id: string; trading_symbol: string; exchange: string }>(
    `select i.instrument_id, iv.trading_symbol, i.exchange
     from instrument i
     join instrument_version iv
       on iv.instrument_id = i.instrument_id and iv.effective_to is null
     where i.instrument_type in ('EQUITY', 'ETF')`,
  );
  // Two indexes, tried in order. Splitting on the FIRST dash is wrong: `BAJAJ-AUTO-EQ`
  // would reduce to `BAJAJ` and never match the derivative's `BAJAJ-AUTO` — observed,
  // not hypothetical. Only a trailing series segment is stripped, and the exact symbol
  // is preferred so a stripped near-miss can't shadow a real listing.
  const equityExact = new Map<string, string>();
  const equityStripped = new Map<string, string>();
  for (const e of equities.rows) {
    const symbol = e.trading_symbol.toUpperCase();
    const exactKey = `${e.exchange}:${symbol}`;
    if (!equityExact.has(exactKey)) equityExact.set(exactKey, e.instrument_id);

    const lastDash = symbol.lastIndexOf("-");
    if (lastDash > 0) {
      const strippedKey = `${e.exchange}:${symbol.slice(0, lastDash)}`;
      // First writer wins: one company lists across several series (EQ, BE, BZ) and
      // any of them is a correct underlying reference.
      if (!equityStripped.has(strippedKey)) equityStripped.set(strippedKey, e.instrument_id);
    }
  }
  const lookupEquity = (exchange: string, name: string): string | undefined =>
    equityExact.get(`${exchange}:${name}`) ?? equityStripped.get(`${exchange}:${name}`);

  // Derivatives still needing a link, with their broker token.
  const pending = await pool.query<{ instrument_id: string; token: string | null; exchange: string }>(
    `select i.instrument_id, bim.broker_instrument_token as token, i.exchange
     from instrument i
     join broker_instrument_mapping bim
       on bim.instrument_id = i.instrument_id and bim.effective_to is null
     where i.instrument_type in ('FUTURES', 'OPTIONS')
       and i.underlying_instrument_id is null`,
  );

  const alreadyLinked = await pool.query<{ count: string }>(
    `select count(*) from instrument
     where instrument_type in ('FUTURES','OPTIONS') and underlying_instrument_id is not null`,
  );

  const unmatched = new Map<string, { name: string; exchange: string; contracts: number }>();
  let unknownTokens = 0;
  let linked = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of pending.rows) {
      if (!row.token) {
        unknownTokens++;
        continue;
      }
      const underlying = underlyingNameByToken.get(row.token);
      if (!underlying) {
        unknownTokens++;
        continue;
      }
      const cashExchange = UNDERLYING_EXCHANGE[underlying.exchange];
      if (!cashExchange) {
        unknownTokens++;
        continue;
      }
      const underlyingId = lookupEquity(cashExchange, underlying.name);
      if (!underlyingId) {
        // Expected for index derivatives — there is no equity row for NIFTY.
        const key = `${cashExchange}:${underlying.name}`;
        const existing = unmatched.get(key);
        if (existing) existing.contracts++;
        else unmatched.set(key, { name: underlying.name, exchange: cashExchange, contracts: 1 });
        continue;
      }
      await client.query(
        `update instrument set underlying_instrument_id = $1
         where instrument_id = $2 and underlying_instrument_id is null`,
        [underlyingId, row.instrument_id],
      );
      linked++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    derivativeRowsSeen: pending.rows.length,
    alreadyLinked: Number(alreadyLinked.rows[0]?.count ?? 0),
    linked,
    unknownTokens,
    unmatchedUnderlyings: Array.from(unmatched.values()).sort((a, b) => b.contracts - a.contracts),
  };
}
