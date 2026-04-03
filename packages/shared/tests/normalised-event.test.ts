import { describe, expect, test } from "vite-plus/test";
import { NormalisedEventSchema, DataSource, EventCategory } from "../src/index.ts";

const validEvent = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  timestamp: "2026-04-03T12:00:00.000Z",
  source: DataSource.FINNHUB,
  category: EventCategory.OPTIONS_FLOW,
  subcategory: "unusual_volume",
  ticker: "AAPL",
  region: "USA",
  sector: "Information Technology",
  zScore: 3.2,
  percentileRank: 98,
  rawValue: 15000,
  baselineValue: 5000,
  confidence: 0.85,
  rawPayload: { volume: 15000, avgVolume: 5000 },
};

describe("NormalisedEventSchema", () => {
  test("accepts a valid event with all fields", () => {
    const result = NormalisedEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe(DataSource.FINNHUB);
      expect(result.data.category).toBe(EventCategory.OPTIONS_FLOW);
      expect(result.data.confidence).toBe(0.85);
    }
  });

  test("accepts a minimal event with only required fields", () => {
    const minimal = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      timestamp: "2026-04-03T12:00:00.000Z",
      source: DataSource.GDELT,
      category: EventCategory.GEOPOLITICAL,
      rawValue: 42,
      baselineValue: 10,
      confidence: 0.6,
      rawPayload: {},
    };
    const result = NormalisedEventSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  test("rejects event with missing required fields", () => {
    const incomplete = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      timestamp: "2026-04-03T12:00:00.000Z",
      // missing source, category, rawValue, baselineValue, confidence, rawPayload
    };
    const result = NormalisedEventSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  test("rejects event with invalid source enum value", () => {
    const badSource = {
      ...validEvent,
      source: "INVALID_SOURCE",
    };
    const result = NormalisedEventSchema.safeParse(badSource);
    expect(result.success).toBe(false);
  });

  test("rejects confidence outside 0-1 range", () => {
    const tooHigh = { ...validEvent, confidence: 1.5 };
    const tooLow = { ...validEvent, confidence: -0.1 };
    expect(NormalisedEventSchema.safeParse(tooHigh).success).toBe(false);
    expect(NormalisedEventSchema.safeParse(tooLow).success).toBe(false);
  });

  test("rejects percentileRank outside 0-100 range", () => {
    const over = { ...validEvent, percentileRank: 101 };
    const under = { ...validEvent, percentileRank: -1 };
    expect(NormalisedEventSchema.safeParse(over).success).toBe(false);
    expect(NormalisedEventSchema.safeParse(under).success).toBe(false);
  });
});
