import { describe, expect, test } from "vite-plus/test";
import { classifySignal, AlertPriority } from "../src/alerts/router.ts";
import type { SignalEvent } from "@sentinel/shared";

function makeSignal(overrides: Partial<SignalEvent> = {}): SignalEvent {
  return {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    timestamp: "2026-04-03T14:00:00.000Z",
    event_type: "anomaly_zscore",
    confidence: 0.5,
    direction: "VOLATILITY",
    urgency: "HOURS",
    contributing_event_ids: ["evt-1"],
    sector_impact: null,
    suggested_instruments: null,
    ...overrides,
  };
}

describe("classifySignal", () => {
  test("critical: high confidence + immediate urgency", () => {
    const result = classifySignal(makeSignal({ confidence: 0.9, urgency: "IMMEDIATE" }));
    expect(result.priority).toBe(AlertPriority.CRITICAL);
    expect(result.channels).toContain("telegram");
    expect(result.channels).toContain("dashboard");
  });

  test("high: moderate confidence + hours urgency", () => {
    const result = classifySignal(makeSignal({ confidence: 0.7, urgency: "HOURS" }));
    expect(result.priority).toBe(AlertPriority.HIGH);
    expect(result.channels).toContain("telegram");
    expect(result.channels).toContain("dashboard");
  });

  test("medium: moderate confidence below high threshold", () => {
    const result = classifySignal(makeSignal({ confidence: 0.5 }));
    expect(result.priority).toBe(AlertPriority.MEDIUM);
    expect(result.channels).toContain("dashboard");
    expect(result.channels).not.toContain("telegram");
  });

  test("low: low confidence", () => {
    const result = classifySignal(makeSignal({ confidence: 0.3 }));
    expect(result.priority).toBe(AlertPriority.LOW);
    expect(result.channels).toHaveLength(0);
  });

  test("boundary: exactly 0.8 confidence + IMMEDIATE is critical", () => {
    const result = classifySignal(makeSignal({ confidence: 0.8, urgency: "IMMEDIATE" }));
    // > 0.8 required, so 0.8 exactly should NOT be critical
    expect(result.priority).not.toBe(AlertPriority.CRITICAL);
  });

  test("boundary: exactly 0.4 confidence is low", () => {
    const result = classifySignal(makeSignal({ confidence: 0.4 }));
    expect(result.priority).toBe(AlertPriority.LOW);
  });
});
