import { describe, expect, test } from "vite-plus/test";
import { classifySignal, AlertPriority } from "../src/alerts/router.ts";
import type { SignalEvent } from "@sentinel/shared";

function makeSignal(overrides: Partial<SignalEvent> = {}): SignalEvent {
  return {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    timestamp: "2026-04-03T14:00:00.000Z",
    // Use unique event_type per test to avoid rate limiter interference
    event_type: `test_${Math.random()}`,
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
  test("critical: high confidence + immediate + multiple events", () => {
    const result = classifySignal(
      makeSignal({
        confidence: 0.9,
        urgency: "IMMEDIATE",
        contributing_event_ids: ["evt-1", "evt-2"],
      }),
    );
    expect(result.priority).toBe(AlertPriority.CRITICAL);
    expect(result.channels).toContain("telegram");
    expect(result.channels).toContain("dashboard");
  });

  test("high: strong confidence + immediate urgency", () => {
    const result = classifySignal(makeSignal({ confidence: 0.85, urgency: "IMMEDIATE" }));
    expect(result.priority).toBe(AlertPriority.HIGH);
    expect(result.channels).toContain("telegram");
    expect(result.channels).toContain("dashboard");
  });

  test("medium: moderate confidence goes to dashboard only", () => {
    const result = classifySignal(makeSignal({ confidence: 0.7, urgency: "HOURS" }));
    expect(result.priority).toBe(AlertPriority.MEDIUM);
    expect(result.channels).toContain("dashboard");
    expect(result.channels).not.toContain("telegram");
  });

  test("low: weak confidence gets no channels", () => {
    const result = classifySignal(makeSignal({ confidence: 0.3 }));
    expect(result.priority).toBe(AlertPriority.LOW);
    expect(result.channels).toHaveLength(0);
  });

  test("boundary: 0.85 confidence + IMMEDIATE but single event is HIGH not CRITICAL", () => {
    const result = classifySignal(
      makeSignal({
        confidence: 0.86,
        urgency: "IMMEDIATE",
        contributing_event_ids: ["evt-1"],
      }),
    );
    expect(result.priority).toBe(AlertPriority.HIGH);
  });

  test("boundary: exactly 0.6 confidence is low", () => {
    const result = classifySignal(makeSignal({ confidence: 0.6 }));
    expect(result.priority).toBe(AlertPriority.LOW);
  });
});
