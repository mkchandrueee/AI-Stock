/**
 * Angel One (SmartAPI) raw response shapes, exactly as documented at
 * smartapi.angelbroking.com/docs, verified 2026-08-15. These types never leave this
 * module — see broker-adapters.md ("no broker-specific type... may cross the adapter
 * boundary").
 *
 * Field values are typed as documented, including inconsistencies: `symboltoken`
 * appears as a string in Holdings/Instruments but as a number in the LTP example —
 * the mapper coerces to string rather than trusting either representation.
 */

export interface AngelOneHoldingRaw {
  tradingsymbol: string;
  exchange: string;
  isin: string;
  t1quantity: number;
  realisedquantity: number;
  quantity: number;
  authorisedquantity: number;
  product: string;
  averageprice: number;
  ltp: number;
  symboltoken: string | number;
  close: number;
  profitandloss: number;
  pnlpercentage: number;
}

export interface AngelOnePositionRaw {
  exchange: string;
  symboltoken: string | number;
  producttype: string;
  tradingsymbol: string;
  symbolname: string;
  instrumenttype: string;
  strikeprice: string;
  optiontype: string;
  expirydate: string;
  lotsize: string;
  buyqty: string;
  sellqty: string;
  netqty: string;
  avgnetprice: string;
  netvalue: string;
  netprice: string;
}

export interface AngelOneRmsRaw {
  net: string;
  availablecash: string;
  availableintradaypayin: string;
  availablelimitmargin: string;
  collateral: string;
  m2munrealized: string;
  m2mrealized: string;
  utiliseddebits: string;
}

/**
 * `status`/`orderstatus` values confirmed from doc examples: "cancelled", "rejected".
 * Other values below ("open", "complete", "pending", "trigger pending") are the
 * platform's expectation based on standard order-lifecycle terminology, NOT confirmed
 * against a live response — see mapOrderStatus in mappers.ts, which flags this.
 */
export interface AngelOneOrderRaw {
  variety: string;
  ordertype: string;
  producttype: string;
  duration: string;
  price: string | number;
  triggerprice: string | number;
  quantity: string;
  tradingsymbol: string;
  transactiontype: "BUY" | "SELL";
  exchange: string;
  symboltoken: string | number | null;
  instrumenttype: string;
  strikeprice: string | number;
  optiontype: string;
  expirydate: string;
  lotsize: string;
  averageprice: string | number;
  filledshares: string;
  unfilledshares: string;
  orderid: string | number;
  text: string;
  status: string;
  orderstatus: string;
  updatetime: string;
  exchtime: string;
  uniqueorderid: string;
  exchangeorderid: string;
}

/**
 * No `symboltoken` on trade records — confirmed absent from the documented response.
 * Instrument resolution for trades must go via (exchange, tradingsymbol), not token.
 * `filltime` is a bare time ("13:27:53"), no date — consistent with the docs' own
 * "provides the trades for the current day" statement; there is nothing in this shape
 * to reconstruct a trade date from if a sync cycle is missed.
 */
export interface AngelOneTradeRaw {
  exchange: string;
  producttype: string;
  tradingsymbol: string;
  instrumenttype: string;
  strikeprice: string;
  optiontype: string;
  expirydate: string;
  transactiontype: "BUY" | "SELL";
  fillprice: string;
  fillsize: string;
  orderid: string;
  fillid: string;
  filltime: string;
}

export interface AngelOneApiResponse<T> {
  status: boolean;
  message: string;
  errorcode: string;
  data: T;
}

/**
 * market/v1/quote FULL response. Field names observed directly from a live call
 * (2026-08-29), not from docs: `opnInterest` is spelled exactly that way, and is
 * absent entirely for cash instruments.
 */
export interface AngelOneQuoteRaw {
  exchange: string;
  tradingSymbol: string;
  symbolToken: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  netChange: number;
  percentChange: number;
  tradeVolume: number;
  opnInterest?: number | null;
  exchFeedTime?: string;
}

export interface AngelOneQuoteResponseRaw {
  fetched: AngelOneQuoteRaw[];
  /** Tokens the broker declined to return — reported by it, not inferred. */
  unfetched: { exchange: string; symbolToken: string; message?: string; errorCode?: string }[];
}
