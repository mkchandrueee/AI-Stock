/**
 * Angel One (SmartAPI) adapter implementation. See:
 * - docs/design/angel-one-verification.md — capability verification this is built from
 * - docs/design/canonical-model-and-adapter-interface.md — interface rationale
 *
 * Assumptions/gaps that are NOT resolved by this implementation, flagged rather than
 * silently guessed at (see also inline comments at each site):
 * - X-ClientLocalIP / X-ClientPublicIP / X-MACAddress: Angel One's docs assume a single
 *   desktop trading app, where these identify the end user's own machine. What they
 *   should be for a server-side multi-user platform (the server's IP? a placeholder?)
 *   is not addressed anywhere in the docs reviewed. Passed in as required config here
 *   rather than hardcoded, so the operational decision is visible and explicit, not
 *   buried in the adapter.
 * - Rate-limit detection assumes HTTP 403 means "rate limited," per a Search finding
 *   ("403 Access denied") — not confirmed against a live response, and could collide
 *   with a genuine 403 authorization failure. Needs verification against a real call.
 * - MARKET_CLOSED is not wired to any specific error code — none of the verified error
 *   codes correspond to it, and it's unlikely to ever fire on Phase 1's read-only
 *   endpoints (holdings/positions/funds/order-book/trade-book don't require market
 *   hours). Left unmapped rather than invented.
 */
import type {
  AdapterResult,
  AuthSession,
  BrokerAdapter,
  BrokerAdapterMetadata,
} from "../../core/broker-adapter.js";
import type {
  Account,
  BrokerAdapterError,
  FundsSnapshot,
  Holding,
  Order,
  Position,
  Trade,
} from "../../core/types.js";
import type { InstrumentResolver } from "../../core/instrument-resolver.js";
import {
  coerceSymbolToken,
  mapFunds,
  mapHolding,
  mapOrder,
  mapPosition,
  mapTrade,
} from "./mappers.js";
import type {
  AngelOneApiResponse,
  AngelOneHoldingRaw,
  AngelOneOrderRaw,
  AngelOnePositionRaw,
  AngelOneRmsRaw,
  AngelOneTradeRaw,
} from "./raw-types.js";

const API_ROOT = "https://apiconnect.angelone.in";
const PUBLISHER_LOGIN_ROOT = "https://smartapi.angelone.in/publisher-login";

/** Error codes verified at smartapi.angelbroking.com/docs/Exceptions, 2026-08-15.
 * Bucketed into canonical kinds; codes with no clean canonical fit (e.g. AB1009
 * "Symbol Not Found") fall through to MALFORMED_RESPONSE as the closest match,
 * flagged rather than forcing an inexact fit silently. */
const TOKEN_ERROR_CODES = new Set([
  "AG8001", // Invalid Token
  "AG8002", // Token Expired
  "AG8003", // Token missing
  "AB8050", // Invalid Refresh Token (unreachable — this adapter never holds one)
  "AB8051", // Refresh Token Expired (unreachable — see above)
  "AB1010", // AMX Session Expired
  "AB1011", // Client not login
]);

/** "Not found" codes mean an empty result, not a failure — e.g. a user with zero
 * holdings gets AB1015, which is a correct answer, not an error. */
const EMPTY_RESULT_CODES = new Set([
  "AB1013", // Order not found
  "AB1014", // Trade not found
  "AB1015", // Holding not found
  "AB1016", // Position not found
]);

export interface AngelOneAdapterConfig {
  apiKey: string;
  clientLocalIp: string;
  clientPublicIp: string;
  macAddress: string;
  instrumentResolver: InstrumentResolver;
}

/**
 * Verified against https://smartapi.angelbroking.com/docs (Introduction, User, Orders,
 * Portfolio, Instruments, RateLimit, Exceptions pages), 2026-08-15.
 *
 * Rate governance is deliberately NOT enforced in this class — broker-adapters.md
 * requires platform-side governors stricter than the broker's limits, which is a
 * shared scheduling/queueing concern across all adapters, not something one adapter
 * should own. Angel One's published limits (1 req/sec on every portfolio-read
 * endpoint used here) are recorded in docs/design/angel-one-verification.md for
 * whatever service ends up owning that governor.
 */
export class AngelOneAdapter implements BrokerAdapter {
  readonly metadata: BrokerAdapterMetadata = {
    broker: "ANGEL_ONE",
    apiVersion: "v1",
    authVersion: "publisher-login-redirect",
    lastVerifiedDate: "2026-08-15",
    docUrl: "https://smartapi.angelbroking.com/docs",
    capabilityMap: {
      LOGIN: "SUPPORTED",
      HOLDINGS: "SUPPORTED",
      POSITIONS: "SUPPORTED",
      ORDER_BOOK: "SUPPORTED",
      // Supported by the API, but retention window unconfirmed beyond "current day" —
      // see docs/design/angel-one-verification.md.
      TRADE_BOOK: "LIMITED_SUPPORT",
      PLACE_ORDER: "SUPPORTED", // verified from docs; NOT exposed by this interface (Phase 1 is read-only)
      MODIFY_ORDER: "SUPPORTED", // ditto
      CANCEL_ORDER: "SUPPORTED", // ditto
      FUNDS: "SUPPORTED",
      MARGIN: "SUPPORTED",
      WEBSOCKET: "UNVERIFIED",
      HISTORICAL_DATA: "UNVERIFIED",
      OPTIONS_DATA: "UNVERIFIED",
      GTT: "UNVERIFIED",
      MULTI_LEG: "UNVERIFIED",
    },
    infrastructureRequirements: {
      // False for THIS adapter's actual traffic (reads only). Angel One's own docs
      // scope the static-IP requirement to order placement/modify/cancel, which this
      // adapter never calls. This does not override the platform-wide fixed-egress
      // policy in CLAUDE.md rule 7 — that's a deployment decision layered on top of
      // this fact, not a contradiction of it.
      staticIpRequired: false,
      staticIpScope: ["PLACE_ORDER", "MODIFY_ORDER", "CANCEL_ORDER"],
      webhookEndpointRequired: false,
      totpMechanism: true,
      // Session lifetime isn't "N hours from issue" — it's "until 12 midnight IST
      // regardless of issue time." No field here captures that shape faithfully;
      // recorded as null rather than a misleading number.
      tokenLifetimeHours: null,
    },
  };

  constructor(private readonly config: AngelOneAdapterConfig) {}

  getLoginUrl(params: { redirectUrl: string; state?: string }): string {
    const url = new URL(PUBLISHER_LOGIN_ROOT);
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set("redirect_url", params.redirectUrl);
    if (params.state) url.searchParams.set("state", params.state);
    return url.toString();
  }

  async completeLogin(
    callbackParams: Record<string, string>,
  ): Promise<AdapterResult<AuthSession>> {
    const jwtToken = callbackParams["auth_token"];
    const feedToken = callbackParams["feed_token"];
    if (!jwtToken || !feedToken) {
      return {
        ok: false,
        error: {
          kind: "MALFORMED_RESPONSE",
          detail: "publisher-login callback missing auth_token or feed_token",
        },
      };
    }
    return {
      ok: true,
      value: {
        accountRef: callbackParams["state"] ?? "",
        jwtToken,
        feedToken,
        expiresAt: nextMidnightIst(),
      },
    };
  }

  async getAccount(session: AuthSession): Promise<AdapterResult<Account>> {
    const result = await this.request<{
      clientcode: string;
      name: string;
      exchanges: string[];
      products: string[];
    }>(session, "GET", "/rest/secure/angelbroking/user/v1/getProfile");
    if (!result.ok) return result;
    const profile = result.value;
    return {
      ok: true,
      value: {
        // accountId left blank: this method doesn't invent platform ids — see
        // BrokerAdapter.getAccount doc comment. The caller fills it in.
        accountId: "",
        brokerId: "ANGEL_ONE",
        brokerAccountRef: profile.clientcode,
        displayName: profile.name,
        exchanges: profile.exchanges,
        products: profile.products,
      },
    };
  }

  async getHoldings(
    session: AuthSession,
    accountId: string,
  ): Promise<AdapterResult<Holding[]>> {
    const result = await this.request<AngelOneHoldingRaw[]>(
      session,
      "GET",
      "/rest/secure/angelbroking/portfolio/v1/getHolding",
    );
    if (!result.ok) return result;
    const holdings: Holding[] = [];
    const unresolved: string[] = [];
    // Confirmed against a real account with zero holdings, 2026-08-16: Angel One
    // returns status:true with data:null, not data:[] — a successful-but-empty
    // response the docs don't distinguish from the array case. Same "not found means
    // empty, not broken" principle as EMPTY_RESULT_CODES above, just for the shape
    // that shows up when the response succeeds instead of erroring.
    for (const raw of result.value ?? []) {
      const token = coerceSymbolToken(raw.symboltoken);
      const resolution = await this.config.instrumentResolver.resolve({
        broker: "ANGEL_ONE",
        brokerInstrumentToken: token,
        tradingSymbol: raw.tradingsymbol,
        exchange: raw.exchange,
      });
      if (!resolution.ok) {
        unresolved.push(`${raw.exchange}:${raw.tradingsymbol}`);
        continue;
      }
      holdings.push(mapHolding(raw, resolution.instrumentId, accountId));
    }
    if (unresolved.length > 0) {
      return { ok: false, error: { kind: "PARTIAL_DATA", missing: unresolved } };
    }
    return { ok: true, value: holdings };
  }

  async getPositions(
    session: AuthSession,
    accountId: string,
  ): Promise<AdapterResult<Position[]>> {
    const result = await this.request<AngelOnePositionRaw[]>(
      session,
      "GET",
      "/rest/secure/angelbroking/order/v1/getPosition",
    );
    if (!result.ok) return result;
    const positions: Position[] = [];
    const unresolved: string[] = [];
    // See the matching comment in getHoldings above — same status:true/data:null shape.
    for (const raw of result.value ?? []) {
      const token = coerceSymbolToken(raw.symboltoken);
      const resolution = await this.config.instrumentResolver.resolve({
        broker: "ANGEL_ONE",
        brokerInstrumentToken: token,
        tradingSymbol: raw.tradingsymbol,
        exchange: raw.exchange,
      });
      if (!resolution.ok) {
        unresolved.push(`${raw.exchange}:${raw.tradingsymbol}`);
        continue;
      }
      positions.push(mapPosition(raw, resolution.instrumentId, accountId));
    }
    if (unresolved.length > 0) {
      return { ok: false, error: { kind: "PARTIAL_DATA", missing: unresolved } };
    }
    return { ok: true, value: positions };
  }

  async getFunds(
    session: AuthSession,
    accountId: string,
  ): Promise<AdapterResult<FundsSnapshot>> {
    const result = await this.request<AngelOneRmsRaw>(
      session,
      "GET",
      "/rest/secure/angelbroking/user/v1/getRMS",
    );
    if (!result.ok) return result;
    return { ok: true, value: mapFunds(result.value, accountId) };
  }

  async getOrderBook(
    session: AuthSession,
    accountId: string,
  ): Promise<AdapterResult<Order[]>> {
    const result = await this.request<AngelOneOrderRaw[]>(
      session,
      "GET",
      "/rest/secure/angelbroking/order/v1/getOrderBook",
    );
    if (!result.ok) return result;
    const orders: Order[] = [];
    const unresolved: string[] = [];
    // See the matching comment in getHoldings above — same status:true/data:null shape.
    for (const raw of result.value ?? []) {
      const token = coerceSymbolToken(raw.symboltoken);
      // Order Book records can have a null symboltoken (seen in the docs' own
      // example response) — the resolver falls back to (exchange, tradingSymbol)
      // when that happens, same fallback the trade book always needs.
      const resolution = await this.config.instrumentResolver.resolve({
        broker: "ANGEL_ONE",
        brokerInstrumentToken: token,
        tradingSymbol: raw.tradingsymbol,
        exchange: raw.exchange,
      });
      if (!resolution.ok) {
        unresolved.push(`${raw.exchange}:${raw.tradingsymbol}`);
        continue;
      }
      const order = mapOrder(raw, resolution.instrumentId, accountId);
      if (order === null) {
        return {
          ok: false,
          error: {
            kind: "MALFORMED_RESPONSE",
            detail: `unrecognized order status: ${raw.orderstatus || raw.status}`,
          },
        };
      }
      orders.push(order);
    }
    if (unresolved.length > 0) {
      return { ok: false, error: { kind: "PARTIAL_DATA", missing: unresolved } };
    }
    return { ok: true, value: orders };
  }

  async getTradeBook(
    session: AuthSession,
    accountId: string,
  ): Promise<AdapterResult<Trade[]>> {
    const result = await this.request<AngelOneTradeRaw[]>(
      session,
      "GET",
      "/rest/secure/angelbroking/order/v1/getTradeBook",
    );
    if (!result.ok) return result;
    const trades: Trade[] = [];
    const unresolved: string[] = [];
    // See the matching comment in getHoldings above — same status:true/data:null shape.
    for (const raw of result.value ?? []) {
      // No symboltoken on trade records at all (confirmed absent from the documented
      // shape) — always resolve by (exchange, tradingSymbol) here.
      const resolution = await this.config.instrumentResolver.resolve({
        broker: "ANGEL_ONE",
        brokerInstrumentToken: null,
        tradingSymbol: raw.tradingsymbol,
        exchange: raw.exchange,
      });
      if (!resolution.ok) {
        unresolved.push(`${raw.exchange}:${raw.tradingsymbol}`);
        continue;
      }
      trades.push(mapTrade(raw, resolution.instrumentId, accountId));
    }
    if (unresolved.length > 0) {
      return { ok: false, error: { kind: "PARTIAL_DATA", missing: unresolved } };
    }
    return { ok: true, value: trades };
  }

  private async request<T>(
    session: AuthSession,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<AdapterResult<T>> {
    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${session.jwtToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": this.config.clientLocalIp,
          "X-ClientPublicIP": this.config.clientPublicIp,
          "X-MACAddress": this.config.macAddress,
          "X-PrivateKey": this.config.apiKey,
        },
      };
      if (body) init.body = JSON.stringify(body);
      response = await fetch(`${API_ROOT}${path}`, init);
    } catch {
      return { ok: false, error: { kind: "NETWORK_TIMEOUT" } };
    }

    // Unconfirmed against a live 429/403 rate-limit response — see file header.
    if (response.status === 403) {
      return { ok: false, error: { kind: "RATE_LIMITED" } };
    }
    if (response.status !== 200) {
      return {
        ok: false,
        error: { kind: "UNEXPECTED_STATUS", httpStatus: response.status },
      };
    }

    let parsed: AngelOneApiResponse<T>;
    try {
      parsed = await response.json();
    } catch {
      return {
        ok: false,
        error: { kind: "MALFORMED_RESPONSE", detail: "response body was not valid JSON" },
      };
    }

    if (!parsed.status) {
      const mapped = mapErrorCode(parsed.errorcode);
      if (mapped) return { ok: false, error: mapped };
      // "not found" means empty, not broken — but only for endpoints returning an
      // array; a single-object endpoint (e.g. getRMS) has no empty-array shape to
      // return, so this path only applies where T is inferably array-like at the
      // call site. Left to the caller's raw type; the cast here reflects that.
      if (EMPTY_RESULT_CODES.has(parsed.errorcode)) {
        return { ok: true, value: [] as unknown as T };
      }
      return {
        ok: false,
        error: { kind: "MALFORMED_RESPONSE", detail: `${parsed.errorcode}: ${parsed.message}` },
      };
    }

    return { ok: true, value: parsed.data };
  }
}

function mapErrorCode(code: string): BrokerAdapterError | null {
  if (TOKEN_ERROR_CODES.has(code)) return { kind: "TOKEN_EXPIRED" };
  return null;
}

/** Angel One sessions are valid "till 12 midnight" (docs), not a fixed duration from
 * issue time. Assumes IST (UTC+5:30) — the docs don't state the timezone explicitly,
 * but Angel One is an Indian broker serving Indian exchanges; flagged as an assumption,
 * not a confirmed fact. */
function nextMidnightIst(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const nextMidnightIstLocal = new Date(
    Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() + 1),
  );
  return new Date(nextMidnightIstLocal.getTime() - IST_OFFSET_MS).toISOString();
}
