/**
 * Daily ingestion of Angel One's instrument master dump into the Security Master
 * schema (migrations/0001_security_master.sql). Source:
 * https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
 * — public, unauthenticated, ~155k rows, regenerated daily per the docs.
 *
 * Everything below is grounded in inspecting the REAL file directly (2026-08-15), not
 * the docs' example, because the two disagree in ways that would have been real bugs:
 *
 * - The docs' example response shows `"exch_seg":"nse_cm"` (lowercase, segment-suffixed).
 *   The actual live file uses `"exch_seg":"NSE"` — uppercase, matching the `exchange`
 *   field used everywhere else (holdings, positions, orders). Trusted the live data.
 * - The docs' "CSV response columns" table claims `instrument_type` is one of
 *   `EQ, FUT, CE, PE`. The real file has none of those values — equities/ETFs/bonds
 *   are `""` (empty string, matching what getHolding/getPosition actually return),
 *   and derivatives use a much larger taxonomy (FUTSTK, OPTIDX, OPTCUR, FUTIRC, ...).
 * - `strike` is the rupee strike price × 100 (confirmed against multiple option
 *   symbols where the strike embedded in the symbol string divided cleanly:
 *   e.g. token 100068 "DIVISLAB29SEP267200CE", strike "720000.000000" → 7200,
 *   matching the "7200" in the symbol). Not documented anywhere found.
 * - There is no `contract_multiplier` field in the dump at all. Defaulted to 1 for
 *   every instrument — a standard Indian-market convention (multiplier is folded
 *   into lot_size, unlike US options), not a guess at broker-specific data.
 *
 * Scope: only NSE/BSE cash-market instruments and NFO/BFO stock/index futures &
 * options are ingested. Angel One's dump also carries MCX (commodities), CDS
 * (currency derivatives), NCDEX, and NCO — together nearly a third of the file
 * (~87k of 155k rows) — none of which are in scope for a Phase 1 single-broker
 * portfolio aggregator, and none of which had the strike-scaling or contract-shape
 * assumptions above verified against. Skipped deliberately, not silently dropped:
 * see `SKIPPED_EXCHANGES` and `classifyRow`'s fallthrough.
 *
 * Also worth noting: `instrumenttype === ""` on NSE/BSE isn't purely "equity" — the
 * same empty value covers Sovereign Gold Bonds and other cash-market instruments
 * (e.g. token 1004 "679AP34-SG"). These get classified as EQUITY too; there's no
 * field in this dump that distinguishes them. Flagged, not solved.
 *
 * Untested against a live database — no Postgres instance is available in this
 * environment.
 */
import type { Pool } from "pg";

const SCRIP_MASTER_URL =
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

const SKIPPED_EXCHANGES = new Set(["MCX", "CDS", "NCDEX", "NCO"]);
const EQUITY_EXCHANGES = new Set(["NSE", "BSE"]);
const DERIVATIVE_EXCHANGES = new Set(["NFO", "BFO"]);
const FUTURES_TYPES = new Set(["FUTSTK", "FUTIDX"]);
const OPTIONS_TYPES = new Set(["OPTSTK", "OPTIDX"]);

interface AngelOneScripMasterRow {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
  tick_size: string;
  freeze_qty?: string;
  is_cas_enabled?: boolean;
}

export interface ClassifiedInstrument {
  instrumentType: "EQUITY" | "FUTURES" | "OPTIONS";
  exchange: string;
  tradingSymbol: string;
  brokerInstrumentToken: string;
  lotSize: number;
  contractMultiplier: number;
  tickSize: number;
  expiry: string | null; // ISO date
  strike: number | null; // actual rupee value
  optionType: "CE" | "PE" | null;
  brokerNativeAttributes: Record<string, unknown>;
}

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** Parses Angel One's "DDMMMYYYY" expiry strings, e.g. "29SEP2026" -> "2026-09-29". */
function parseExpiry(raw: string): string | null {
  if (!raw) return null;
  const match = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(raw);
  if (!match) return null;
  const day = match[1];
  const monAbbr = match[2];
  const year = match[3];
  if (!day || !monAbbr || !year) return null;
  const month = MONTHS[monAbbr];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

/**
 * Pure, no I/O — testable without a network call or database. Returns null for
 * anything out of Phase 1 scope (see file header) rather than forcing a guess.
 */
export function classifyRow(row: AngelOneScripMasterRow): ClassifiedInstrument | null {
  const exchange = row.exch_seg;
  if (SKIPPED_EXCHANGES.has(exchange)) return null;

  const lotSize = Number(row.lotsize);
  // A real tradeable instrument never has a non-positive lot size. Caught in practice:
  // "MIDCPNIFTY" (an index reference row, not a tradeable equity) has
  // instrumenttype:"" on NSE — indistinguishable from a real equity by that field
  // alone — but lotsize:"-1". Guards against that whole class of placeholder/
  // reference rows riding along on the empty-instrumenttype bucket.
  if (!Number.isFinite(lotSize) || lotSize <= 0) return null;

  const tickSize = Number(row.tick_size);
  const brokerNativeAttributes = {
    instrumenttype: row.instrumenttype,
    freeze_qty: row.freeze_qty ?? null,
    is_cas_enabled: row.is_cas_enabled ?? null,
  };
  const base = {
    exchange,
    tradingSymbol: row.symbol,
    brokerInstrumentToken: row.token,
    lotSize,
    // No contract_multiplier field exists in this dump — see file header.
    contractMultiplier: 1,
    tickSize,
    brokerNativeAttributes,
  };

  if (row.instrumenttype === "" && EQUITY_EXCHANGES.has(exchange)) {
    return { ...base, instrumentType: "EQUITY", expiry: null, strike: null, optionType: null };
  }

  if (DERIVATIVE_EXCHANGES.has(exchange) && FUTURES_TYPES.has(row.instrumenttype)) {
    return {
      ...base,
      instrumentType: "FUTURES",
      expiry: parseExpiry(row.expiry),
      strike: null,
      optionType: null,
    };
  }

  if (DERIVATIVE_EXCHANGES.has(exchange) && OPTIONS_TYPES.has(row.instrumenttype)) {
    const optionType = row.symbol.endsWith("CE") ? "CE" : row.symbol.endsWith("PE") ? "PE" : null;
    if (optionType === null) return null; // shape assumption violated — don't guess
    const rawStrike = Number(row.strike);
    return {
      ...base,
      instrumentType: "OPTIONS",
      expiry: parseExpiry(row.expiry),
      strike: Number.isFinite(rawStrike) ? rawStrike / 100 : null,
      optionType,
    };
  }

  return null;
}

export interface IngestionSummary {
  totalRows: number;
  classified: number;
  skipped: number;
  instrumentsCreated: number;
  versionsCreated: number;
  mappingsCreated: number;
}

export async function fetchScripMaster(): Promise<AngelOneScripMasterRow[]> {
  const response = await fetch(SCRIP_MASTER_URL);
  if (!response.ok) {
    throw new Error(`scrip master fetch failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Idempotent: safe to run daily. For each classified row:
 * - If a broker_instrument_mapping already exists for (ANGEL_ONE, token), reuse its
 *   instrument_id — Phase 1 is single-broker, so the mapping IS the identity check;
 *   see the "open question" on cross-broker natural keys in
 *   docs/design/security-master.md, deliberately not solved here.
 * - Otherwise create a new `instrument` row.
 * - Only writes a new `instrument_version` row if the versioned attributes actually
 *   changed from the current one — not on every run.
 */
export async function ingestScripMaster(pool: Pool): Promise<IngestionSummary> {
  const rows = await fetchScripMaster();
  const summary: IngestionSummary = {
    totalRows: rows.length,
    classified: 0,
    skipped: 0,
    instrumentsCreated: 0,
    versionsCreated: 0,
    mappingsCreated: 0,
  };

  for (const row of rows) {
    const classified = classifyRow(row);
    if (classified === null) {
      summary.skipped++;
      continue;
    }
    summary.classified++;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingMapping = await client.query<{ instrument_id: string }>(
        `select instrument_id from broker_instrument_mapping
         where broker = $1 and broker_instrument_token = $2 and effective_to is null`,
        ["ANGEL_ONE", classified.brokerInstrumentToken],
      );

      let instrumentId: string;
      if (existingMapping.rows[0]) {
        instrumentId = existingMapping.rows[0].instrument_id;
      } else {
        const inserted = await client.query<{ instrument_id: string }>(
          `insert into instrument (instrument_type, exchange, expiry, strike, option_type)
           values ($1, $2, $3, $4, $5)
           returning instrument_id`,
          [
            classified.instrumentType,
            classified.exchange,
            classified.expiry,
            classified.strike,
            classified.optionType,
          ],
        );
        instrumentId = inserted.rows[0]!.instrument_id;
        summary.instrumentsCreated++;

        await client.query(
          `insert into broker_instrument_mapping
             (instrument_id, broker, broker_instrument_token, broker_trading_symbol,
              exchange, broker_native_attributes, effective_from, last_verified_date)
           values ($1, $2, $3, $4, $5, $6, now(), current_date)`,
          [
            instrumentId,
            "ANGEL_ONE",
            classified.brokerInstrumentToken,
            classified.tradingSymbol,
            classified.exchange,
            JSON.stringify(classified.brokerNativeAttributes),
          ],
        );
        summary.mappingsCreated++;
      }

      const currentVersion = await client.query<{
        trading_symbol: string;
        lot_size: number;
        contract_multiplier: string;
        tick_size: string;
      }>(
        `select trading_symbol, lot_size, contract_multiplier, tick_size
         from instrument_version
         where instrument_id = $1 and effective_to is null`,
        [instrumentId],
      );

      const changed =
        !currentVersion.rows[0] ||
        currentVersion.rows[0].trading_symbol !== classified.tradingSymbol ||
        currentVersion.rows[0].lot_size !== classified.lotSize ||
        Number(currentVersion.rows[0].contract_multiplier) !== classified.contractMultiplier ||
        Number(currentVersion.rows[0].tick_size) !== classified.tickSize;

      if (changed) {
        if (currentVersion.rows[0]) {
          await client.query(
            `update instrument_version set effective_to = now()
             where instrument_id = $1 and effective_to is null`,
            [instrumentId],
          );
        }
        await client.query(
          `insert into instrument_version
             (instrument_id, trading_symbol, lot_size, contract_multiplier, tick_size,
              effective_from, source, last_verified_date)
           values ($1, $2, $3, $4, $5, now(), $6, current_date)`,
          [
            instrumentId,
            classified.tradingSymbol,
            classified.lotSize,
            classified.contractMultiplier,
            classified.tickSize,
            SCRIP_MASTER_URL,
          ],
        );
        summary.versionsCreated++;
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return summary;
}
