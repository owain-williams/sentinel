import { z } from "zod";

export const DataSource = {
  FINNHUB: "FINNHUB",
  QUIVER: "QUIVER",
  GDELT: "GDELT",
  ADSB: "ADSB",
  POLYMARKET: "POLYMARKET",
  BETFAIR: "BETFAIR",
  FRED: "FRED",
} as const;

export type DataSource = (typeof DataSource)[keyof typeof DataSource];

export const EventCategory = {
  OPTIONS_FLOW: "OPTIONS_FLOW",
  CONGRESS_TRADE: "CONGRESS_TRADE",
  GEOPOLITICAL: "GEOPOLITICAL",
  FLIGHT: "FLIGHT",
  PREDICTION_MARKET: "PREDICTION_MARKET",
  MACRO: "MACRO",
} as const;

export type EventCategory = (typeof EventCategory)[keyof typeof EventCategory];

const DataSourceSchema = z.enum([
  DataSource.FINNHUB,
  DataSource.QUIVER,
  DataSource.GDELT,
  DataSource.ADSB,
  DataSource.POLYMARKET,
  DataSource.BETFAIR,
  DataSource.FRED,
]);

const EventCategorySchema = z.enum([
  EventCategory.OPTIONS_FLOW,
  EventCategory.CONGRESS_TRADE,
  EventCategory.GEOPOLITICAL,
  EventCategory.FLIGHT,
  EventCategory.PREDICTION_MARKET,
  EventCategory.MACRO,
]);

export const NormalisedEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source: DataSourceSchema,
  category: EventCategorySchema,
  subcategory: z.string().optional(),

  // Core data
  ticker: z.string().optional(),
  region: z.string().optional(),
  sector: z.string().optional(),

  // Anomaly scoring
  zScore: z.number().optional(),
  percentileRank: z.number().min(0).max(100).optional(),
  rawValue: z.number(),
  baselineValue: z.number(),

  // Metadata
  confidence: z.number().min(0).max(1),
  rawPayload: z.record(z.unknown()),
});

export type NormalisedEvent = z.infer<typeof NormalisedEventSchema>;

const SignalDirection = z.enum(["BULLISH", "BEARISH", "VOLATILITY"]);
const SignalUrgency = z.enum(["IMMEDIATE", "HOURS", "DAYS"]);

export const SignalEventSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  event_type: z.string(),
  confidence: z.number().min(0).max(1),
  direction: SignalDirection,
  urgency: SignalUrgency,
  contributing_event_ids: z.array(z.string()),
  sector_impact: z.array(z.string()).nullable(),
  suggested_instruments: z.array(z.record(z.unknown())).nullable(),
});

export type SignalEvent = z.infer<typeof SignalEventSchema>;
