import { describe, expect, test } from "vite-plus/test";
import { NormalisedEventSchema, DataSource, EventCategory } from "@sentinel/shared";

describe("cross-package import from @sentinel/shared", () => {
  test("can import and use NormalisedEventSchema to validate an event", () => {
    const event = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      timestamp: "2026-04-03T12:00:00.000Z",
      source: DataSource.FINNHUB,
      category: EventCategory.OPTIONS_FLOW,
      subcategory: "unusual_volume",
      ticker: "AAPL",
      rawValue: 15000,
      baselineValue: 5000,
      confidence: 0.85,
      rawPayload: { volume: 15000 },
    };

    const result = NormalisedEventSchema.parse(event);
    expect(result.source).toBe("FINNHUB");
    expect(result.confidence).toBe(0.85);
  });
});
