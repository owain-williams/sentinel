import { describe, expect, test } from "vite-plus/test";
import { mapSignalToTrades } from "../src/trades/mapper.ts";
import type { SignalEvent } from "@sentinel/shared";

function makeSignal(overrides: Partial<SignalEvent> = {}): SignalEvent {
  return {
    id: "sig-001",
    timestamp: "2026-04-03T14:00:00.000Z",
    event_type: "military_action",
    confidence: 0.85,
    direction: "BULLISH",
    urgency: "IMMEDIATE",
    contributing_event_ids: ["evt-1"],
    sector_impact: null,
    suggested_instruments: null,
    ...overrides,
  };
}

describe("mapSignalToTrades", () => {
  test("maps military_action to crude oil long on IG", () => {
    const trades = mapSignalToTrades(makeSignal({ event_type: "military_action" }));

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
    });
  });

  test("maps energy_disruption to crude oil long on IG", () => {
    const trades = mapSignalToTrades(makeSignal({ event_type: "energy_disruption" }));

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
    });
  });

  test("maps financial_stress to VIX long on IG", () => {
    const trades = mapSignalToTrades(makeSignal({ event_type: "financial_stress" }));

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      venue: "IG",
      instrument: "VIX",
      direction: "LONG",
    });
  });

  test("maps market_event to Betfair", () => {
    const trades = mapSignalToTrades(makeSignal({ event_type: "market_event" }));

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      venue: "BETFAIR",
    });
  });

  test("maps policy_shift with BEARISH direction to sector short", () => {
    const trades = mapSignalToTrades(
      makeSignal({ event_type: "policy_shift", direction: "BEARISH", sector_impact: ["Energy"] }),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].direction).toBe("SHORT");
    expect(trades[0].venue).toBe("IG");
  });

  test("maps policy_shift with BULLISH direction to sector long", () => {
    const trades = mapSignalToTrades(
      makeSignal({
        event_type: "policy_shift",
        direction: "BULLISH",
        sector_impact: ["Financials"],
      }),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].direction).toBe("LONG");
  });

  test("returns empty array for unknown event types", () => {
    const trades = mapSignalToTrades(makeSignal({ event_type: "unknown_type" }));

    expect(trades).toEqual([]);
  });
});
