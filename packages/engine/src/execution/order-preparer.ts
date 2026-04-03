import type { SuggestedTrade } from "../trades/mapper.ts";

// IG Market epics from PRD §7.2
const INSTRUMENT_EPICS: Record<string, string> = {
  "Crude Oil": "EN.D.LCO.Month1.IP",
  "FTSE 100": "IX.D.FTSE.DAILY.IP",
  "S&P 500": "IX.D.SPTRD.DAILY.IP",
  Gold: "CS.D.USCGC.TODAY.IP",
  "EUR/USD": "CS.D.EURUSD.TODAY.IP",
  VIX: "IX.D.VIX.DAILY.IP",
};

// Default stop distances in points per instrument
const DEFAULT_STOP_DISTANCES: Record<string, number> = {
  "EN.D.LCO.Month1.IP": 50,
  "IX.D.FTSE.DAILY.IP": 40,
  "IX.D.SPTRD.DAILY.IP": 30,
  "CS.D.USCGC.TODAY.IP": 15,
  "CS.D.EURUSD.TODAY.IP": 30,
  "IX.D.VIX.DAILY.IP": 200,
};

export interface OrderSizingParams {
  accountValue: number;
  riskPerTradePct: number;
  signalConfidence: number;
}

export interface PreparedOrder {
  epic: string | null;
  direction: "BUY" | "SELL";
  size: number;
  stopDistance: number;
  limitDistance: number;
  riskAmount: number;
  rationale: string;
}

export function prepareOrder(trade: SuggestedTrade, params: OrderSizingParams): PreparedOrder {
  const epic = INSTRUMENT_EPICS[trade.instrument] ?? null;
  const direction = trade.direction === "LONG" ? ("BUY" as const) : ("SELL" as const);

  const riskAmount = params.accountValue * params.riskPerTradePct * params.signalConfidence;

  const stopDistance = epic ? (DEFAULT_STOP_DISTANCES[epic] ?? 50) : 50;
  // 1.5:1 reward-to-risk per PRD §7.3
  const limitDistance = Math.round(stopDistance * 1.5);

  // Size in £/point = risk amount / stop distance
  const size = Math.max(0.5, Math.round((riskAmount / stopDistance) * 10) / 10);

  return {
    epic,
    direction,
    size,
    stopDistance,
    limitDistance,
    riskAmount,
    rationale: trade.rationale,
  };
}
