import { describe, expect, test } from "vite-plus/test";
import { prepareOrder } from "../src/execution/order-preparer.ts";
import type { SuggestedTrade } from "../src/trades/mapper.ts";

describe("prepareOrder", () => {
  test("converts a LONG suggested trade to an IG BUY order with position sizing", () => {
    const trade: SuggestedTrade = {
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      rationale: "Energy disruption",
    };

    const order = prepareOrder(trade, {
      accountValue: 5000,
      riskPerTradePct: 0.03,
      signalConfidence: 0.8,
    });

    expect(order.direction).toBe("BUY");
    expect(order.epic).toBe("EN.D.LCO.Month1.IP");
    // Risk amount = 5000 * 0.03 * 0.8 = 120
    // Size = risk / stopDistance, stopDistance defaults to 50 for oil
    expect(order.riskAmount).toBe(120);
    expect(order.size).toBeGreaterThan(0);
    expect(order.stopDistance).toBeGreaterThan(0);
    expect(order.limitDistance).toBeGreaterThan(0);
  });

  test("converts a SHORT suggested trade to an IG SELL order", () => {
    const trade: SuggestedTrade = {
      venue: "IG",
      instrument: "VIX",
      direction: "SHORT",
      rationale: "Volatility declining",
    };

    const order = prepareOrder(trade, {
      accountValue: 5000,
      riskPerTradePct: 0.03,
      signalConfidence: 0.6,
    });

    expect(order.direction).toBe("SELL");
    expect(order.epic).toBeDefined();
  });

  test("scales position size by signal confidence", () => {
    const trade: SuggestedTrade = {
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      rationale: "test",
    };

    const highConf = prepareOrder(trade, {
      accountValue: 5000,
      riskPerTradePct: 0.03,
      signalConfidence: 1.0,
    });
    const lowConf = prepareOrder(trade, {
      accountValue: 5000,
      riskPerTradePct: 0.03,
      signalConfidence: 0.5,
    });

    expect(highConf.riskAmount).toBeGreaterThan(lowConf.riskAmount);
  });

  test("returns null epic for unknown instruments", () => {
    const trade: SuggestedTrade = {
      venue: "IG",
      instrument: "Unknown Thing",
      direction: "LONG",
      rationale: "test",
    };

    const order = prepareOrder(trade, {
      accountValue: 5000,
      riskPerTradePct: 0.03,
      signalConfidence: 0.7,
    });

    expect(order.epic).toBeNull();
  });
});
