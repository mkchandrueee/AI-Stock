/**
 * Postgres-backed InstrumentResolver against the schema in
 * migrations/0001_security_master.sql. Untested against a live database — no Postgres
 * instance is available in this environment. Reviewed by hand against the migration
 * and the interface contract, not executed.
 *
 * Looks up by token first (if present), falling back to (exchange, tradingSymbol) —
 * matching the two unique indexes on broker_instrument_mapping. Only currently
 * effective mappings are considered (effective_to is null); this resolver is for live
 * sync, not point-in-time historical resolution.
 */
import type { Pool } from "pg";
import type {
  BrokerNativeInstrumentRef,
  InstrumentResolution,
  InstrumentResolver,
} from "../core/instrument-resolver.js";

export class PostgresInstrumentResolver implements InstrumentResolver {
  constructor(private readonly pool: Pool) {}

  async resolve(ref: BrokerNativeInstrumentRef): Promise<InstrumentResolution> {
    if (ref.brokerInstrumentToken !== null) {
      const byToken = await this.pool.query<{ instrument_id: string }>(
        `select instrument_id from broker_instrument_mapping
         where broker = $1 and broker_instrument_token = $2 and effective_to is null`,
        [ref.broker, ref.brokerInstrumentToken],
      );
      if (byToken.rows[0]) {
        return { ok: true, instrumentId: byToken.rows[0].instrument_id };
      }
    }

    if (ref.tradingSymbol !== null) {
      const bySymbol = await this.pool.query<{ instrument_id: string }>(
        `select instrument_id from broker_instrument_mapping
         where broker = $1 and exchange = $2 and broker_trading_symbol = $3
           and effective_to is null`,
        [ref.broker, ref.exchange, ref.tradingSymbol],
      );
      if (bySymbol.rows[0]) {
        return { ok: true, instrumentId: bySymbol.rows[0].instrument_id };
      }
    }

    return { ok: false, ref };
  }
}
