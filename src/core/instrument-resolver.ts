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

export type InstrumentResolution =
  | { ok: true; instrumentId: InstrumentId }
  /** Not found is an expected, handled outcome (e.g. instrument-master ingestion
   * hasn't run yet, or a brand-new listing) — not an exception. The caller decides
   * what to do with it; a resolver throwing here would force every caller into
   * try/catch for a case that isn't exceptional. */
  | { ok: false; ref: BrokerNativeInstrumentRef };

export interface InstrumentResolver {
  resolve(ref: BrokerNativeInstrumentRef): Promise<InstrumentResolution>;

  /**
   * The reverse direction: canonical id -> the identifiers a broker will accept.
   *
   * `resolve` covers instruments arriving *in* a broker response. This covers
   * instruments going *out* in a request — asking for an instrument's candles means
   * naming it in the broker's own vocabulary, and the canonical model forbids the
   * caller knowing that vocabulary. The adapter translates; callers pass an
   * InstrumentId and nothing else.
   *
   * Returns null when the instrument has no current mapping for that broker, which
   * is expected (an instrument may be known to the Security Master but not listed by
   * every broker) rather than exceptional.
   */
  toBrokerRef(
    broker: BrokerId,
    instrumentId: InstrumentId,
  ): Promise<BrokerNativeInstrumentRef | null>;
}
