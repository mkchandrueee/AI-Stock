/**
 * The only sanctioned path from a broker-native instrument identifier to a canonical
 * InstrumentId (spec §18: "No order may be constructed from an instrument identifier
 * that did not resolve through it" — applies equally to read-side resolution here).
 *
 * A real implementation lives against the Security Master schema in
 * docs/design/security-master.md, which doesn't exist as running code yet. Adapters
 * depend on this interface, not on that schema, so an adapter can be written and
 * reviewed before the Security Master is implemented.
 */
import type { BrokerId, InstrumentId } from "./types.js";

/**
 * Either identifier may be the only one available, depending on which broker endpoint
 * produced the record — e.g. Angel One's trade book has no instrument token at all,
 * only (exchange, tradingSymbol); its order book can have a null token on some rows
 * too. A resolver implementation must be able to look up by whichever is present.
 */
export interface BrokerNativeInstrumentRef {
  broker: BrokerId;
  /** e.g. Angel One's symboltoken — always coerced to string at the adapter boundary,
   * since Angel One's own docs show it typed inconsistently across endpoints. */
  brokerInstrumentToken: string | null;
  tradingSymbol: string | null;
  exchange: string;
}

export interface InstrumentResolver {
  resolve(ref: BrokerNativeInstrumentRef): Promise<InstrumentId>;
}
