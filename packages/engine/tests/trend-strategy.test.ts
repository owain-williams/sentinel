import { describe, expect, test } from "vite-plus/test";
import {
  computeIndicators,
  evaluateTrend,
  evaluateExits,
  type PriceBar,
} from "../src/strategy/trend.ts";

// Helper: generate synthetic price bars with a known pattern
function makeBars(closes: number[]): PriceBar[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  }));
}

describe("computeIndicators", () => {
  test("computes EMA-50 weighted towards recent prices", () => {
    // First 40 bars at 100, last 10 bars at 200 — EMA-50 should be pulled towards 200
    const bars = makeBars([
      ...Array.from({ length: 40 }, () => 100),
      ...Array.from({ length: 10 }, () => 200),
    ]);

    const result = computeIndicators(bars);

    // EMA-50 with 10 recent bars at 200 should be noticeably above 100 but well below 200
    expect(result.ema50).toBeGreaterThan(110);
    expect(result.ema50).toBeLessThan(160);
  });

  test("computes ATR-14 from price bar true ranges", () => {
    // Bars with consistent high-low spread of 2 (high=close+1, low=close-1)
    const bars = makeBars(Array.from({ length: 50 }, (_, i) => 100 + i));

    const result = computeIndicators(bars);

    // True range for each bar: max(high-low, |high-prevClose|, |low-prevClose|)
    // With our data: high-low=2, gaps of 1 between bars, so TR ≈ 2-3
    expect(result.atr14).toBeGreaterThan(1.5);
    expect(result.atr14).toBeLessThan(4);
  });

  test("computes EMA-20 from 50 price bars", () => {
    // 50 bars with a steady uptrend from 100 to 149
    const bars = makeBars(Array.from({ length: 50 }, (_, i) => 100 + i));

    const result = computeIndicators(bars);

    // EMA-20 should be closer to recent prices than a simple average
    // With a steady uptrend, EMA-20 should be between the midpoint and the end
    expect(result.ema20).toBeGreaterThan(130);
    expect(result.ema20).toBeLessThan(149);
  });
});

describe("evaluateTrend", () => {
  test("generates LONG signal when EMA-20 crosses above EMA-50 with low volatility", () => {
    // Simulate: 40 bars flat at 100, then 20 bars rising to 120
    // This creates EMA-20 > EMA-50 (recent prices pull short EMA up faster)
    const bars = makeBars([
      ...Array.from({ length: 40 }, () => 100),
      ...Array.from({ length: 20 }, (_, i) => 100 + i),
    ]);

    const signal = evaluateTrend(bars, "FTSE_100", 10000);

    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe("LONG");
    expect(signal!.instrument).toBe("FTSE_100");
    expect(signal!.stopLoss).toBeGreaterThan(0);
    expect(signal!.takeProfit).toBeGreaterThan(signal!.stopLoss);
    expect(signal!.size).toBeGreaterThan(0);
  });

  test("generates SHORT signal when EMA-20 crosses below EMA-50 with low volatility", () => {
    // Simulate: 40 bars flat at 200, then 20 bars falling to 181
    const bars = makeBars([
      ...Array.from({ length: 40 }, () => 200),
      ...Array.from({ length: 20 }, (_, i) => 200 - i),
    ]);

    const signal = evaluateTrend(bars, "CRUDE_OIL", 10000);

    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe("SHORT");
    // Short stop is above current price
    expect(signal!.stopLoss).toBeGreaterThan(bars[bars.length - 1].close);
    // Short TP is below current price
    expect(signal!.takeProfit).toBeLessThan(bars[bars.length - 1].close);
  });

  test("returns null when ATR exceeds 2x its 50-day average (choppy market)", () => {
    // 50 bars with very low volatility, then 10 bars with extreme swings
    // The 50-bar ATR average stays low, but recent 14-bar ATR spikes well above 2×
    const lowVol = Array.from({ length: 50 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      open: 100,
      high: 100.5,
      low: 99.5,
      close: 100 + (i < 25 ? 0 : 0.2), // slight uptrend for EMA crossover
    }));
    const highVol = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-02-${String(i + 1).padStart(2, "0")}`,
      open: 110,
      high: 160, // range of 110 per bar
      low: 50,
      close: 110 + i,
    }));
    const bars: PriceBar[] = [...lowVol, ...highVol];

    const signal = evaluateTrend(bars, "SP500", 10000);

    expect(signal).toBeNull();
  });

  test("sizes position at 3% risk with stop at 2×ATR and TP at 3×ATR", () => {
    const bars = makeBars([
      ...Array.from({ length: 40 }, () => 100),
      ...Array.from({ length: 20 }, (_, i) => 100 + i),
    ]);
    const accountValue = 10000;

    const signal = evaluateTrend(bars, "FTSE_100", accountValue);
    const indicators = computeIndicators(bars);

    expect(signal).not.toBeNull();

    const stopDistance = 2 * indicators.atr14;
    const tpDistance = 3 * indicators.atr14;
    const lastPrice = bars[bars.length - 1].close;

    // Stop and TP distances match ATR multiples
    expect(signal!.stopLoss).toBeCloseTo(lastPrice - stopDistance, 5);
    expect(signal!.takeProfit).toBeCloseTo(lastPrice + tpDistance, 5);

    // Size = riskAmount / stopDistance = (10000 * 0.03) / stopDistance
    const expectedSize = (accountValue * 0.03) / stopDistance;
    expect(signal!.size).toBeCloseTo(expectedSize, 5);
  });
});

describe("evaluateExits", () => {
  test("triggers trailing stop when profit exceeds 2×ATR", () => {
    const atr = 5;
    const openTrade = {
      id: "trade-1",
      instrument: "FTSE_100",
      direction: "LONG" as const,
      entryPrice: 100,
      stopLoss: 90,
      size: 10,
    };

    // Current price 115 — profit is 15, which is 3×ATR (exceeds 2×ATR threshold)
    const currentPrice = 115;

    const exits = evaluateExits([openTrade], new Map([["FTSE_100", currentPrice]]), atr, null);

    expect(exits).toHaveLength(1);
    expect(exits[0].tradeId).toBe("trade-1");
    expect(exits[0].reason).toBe("trailing_stop");
    // Trailing stop: 1×ATR below current price
    expect(exits[0].newStopLoss).toBeCloseTo(currentPrice - atr, 5);
  });

  test("regime override closes long positions when score < 20", () => {
    const longTrade = {
      id: "trade-long",
      instrument: "FTSE_100",
      direction: "LONG" as const,
      entryPrice: 100,
      stopLoss: 90,
      size: 10,
    };
    const shortTrade = {
      id: "trade-short",
      instrument: "CRUDE_OIL",
      direction: "SHORT" as const,
      entryPrice: 80,
      stopLoss: 90,
      size: 5,
    };

    const prices = new Map([
      ["FTSE_100", 105],
      ["CRUDE_OIL", 75],
    ]);

    const exits = evaluateExits([longTrade, shortTrade], prices, 5, 15);

    // Only the long should be closed
    expect(exits).toHaveLength(1);
    expect(exits[0].tradeId).toBe("trade-long");
    expect(exits[0].reason).toBe("regime_override");
  });

  test("no trailing stop when profit is below 2×ATR threshold", () => {
    const trade = {
      id: "trade-1",
      instrument: "GOLD",
      direction: "LONG" as const,
      entryPrice: 100,
      stopLoss: 90,
      size: 10,
    };

    // Profit is only 5 (1×ATR), below the 2×ATR trigger
    const exits = evaluateExits([trade], new Map([["GOLD", 105]]), 5, null);

    expect(exits).toHaveLength(0);
  });
});
