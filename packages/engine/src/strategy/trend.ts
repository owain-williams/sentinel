export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TrendIndicators {
  ema20: number;
  ema50: number;
  atr14: number;
  atrAvg50: number;
}

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function trueRanges(bars: PriceBar[]): number[] {
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    ranges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return ranges;
}

export interface TrendSignal {
  instrument: string;
  direction: "LONG" | "SHORT";
  stopLoss: number;
  takeProfit: number;
  size: number;
}

const DEFAULT_RISK_PCT = 0.03;
const ATR_VOLATILITY_THRESHOLD = 2;
const STOP_ATR_MULTIPLE = 2;
const TP_ATR_MULTIPLE = 3;

export function evaluateTrend(
  bars: PriceBar[],
  instrument: string,
  accountValue: number,
  riskPct = DEFAULT_RISK_PCT,
): TrendSignal | null {
  const indicators = computeIndicators(bars);
  const { ema20, ema50, atr14, atrAvg50 } = indicators;

  // Volatility filter: no entry when ATR > 2× its average
  if (atrAvg50 > 0 && atr14 > ATR_VOLATILITY_THRESHOLD * atrAvg50) {
    return null;
  }

  const lastPrice = bars[bars.length - 1].close;
  const stopDistance = STOP_ATR_MULTIPLE * atr14;
  const tpDistance = TP_ATR_MULTIPLE * atr14;
  const riskAmount = accountValue * riskPct;
  const size = stopDistance > 0 ? riskAmount / stopDistance : 0;

  if (ema20 > ema50) {
    return {
      instrument,
      direction: "LONG",
      stopLoss: lastPrice - stopDistance,
      takeProfit: lastPrice + tpDistance,
      size,
    };
  }

  if (ema20 < ema50) {
    return {
      instrument,
      direction: "SHORT",
      stopLoss: lastPrice + stopDistance,
      takeProfit: lastPrice - tpDistance,
      size,
    };
  }

  return null;
}

export interface OpenPosition {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  size: number;
}

export interface ExitAction {
  tradeId: string;
  reason: "trailing_stop" | "regime_override";
  newStopLoss?: number;
}

const TRAILING_TRIGGER_ATR = 2;
const TRAILING_DISTANCE_ATR = 1;
const REGIME_CLOSE_THRESHOLD = 20;

export function evaluateExits(
  openTrades: OpenPosition[],
  currentPrices: Map<string, number>,
  atr: number,
  regimeScore: number | null,
): ExitAction[] {
  const actions: ExitAction[] = [];

  for (const trade of openTrades) {
    const price = currentPrices.get(trade.instrument);
    if (price == null) continue;

    // Regime override: close longs if regime score < 20
    if (trade.direction === "LONG" && regimeScore != null && regimeScore < REGIME_CLOSE_THRESHOLD) {
      actions.push({ tradeId: trade.id, reason: "regime_override" });
      continue;
    }

    // Trailing stop: once profit exceeds 2×ATR, trail at 1×ATR below price
    const profit = trade.direction === "LONG" ? price - trade.entryPrice : trade.entryPrice - price;

    if (profit > TRAILING_TRIGGER_ATR * atr) {
      const newStop =
        trade.direction === "LONG"
          ? price - TRAILING_DISTANCE_ATR * atr
          : price + TRAILING_DISTANCE_ATR * atr;
      actions.push({ tradeId: trade.id, reason: "trailing_stop", newStopLoss: newStop });
    }
  }

  return actions;
}

export function computeIndicators(bars: PriceBar[]): TrendIndicators {
  const closes = bars.map((b) => b.close);
  const trs = trueRanges(bars);

  return {
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    atr14: ema(trs, 14),
    atrAvg50: ema(trs, 50),
  };
}
