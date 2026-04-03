import { describe, expect, test } from "vite-plus/test";
import { SignalEventSchema } from "@sentinel/shared";

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    timestamp: "2026-04-03T14:00:00.000Z",
    event_type: "anomaly_zscore",
    confidence: 0.85,
    direction: "VOLATILITY",
    urgency: "IMMEDIATE",
    contributing_event_ids: ["evt-1", "evt-2"],
    sector_impact: null,
    suggested_instruments: null,
    ...overrides,
  };
}

describe("SignalEventSchema", () => {
  test("validates a well-formed signal", () => {
    const result = SignalEventSchema.safeParse(makeSignal());
    expect(result.success).toBe(true);
  });

  test("rejects signal with missing required fields", () => {
    const result = SignalEventSchema.safeParse({ id: "abc" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid direction", () => {
    const result = SignalEventSchema.safeParse(makeSignal({ direction: "UP" }));
    expect(result.success).toBe(false);
  });

  test("rejects confidence out of range", () => {
    expect(SignalEventSchema.safeParse(makeSignal({ confidence: 1.5 })).success).toBe(false);
    expect(SignalEventSchema.safeParse(makeSignal({ confidence: -0.1 })).success).toBe(false);
  });
});
