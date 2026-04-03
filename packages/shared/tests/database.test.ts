import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { createDatabase, type SentinelDatabase } from "../src/db/index.ts";

describe("SQLite database via Drizzle", () => {
  let db: SentinelDatabase;

  beforeAll(() => {
    db = createDatabase(":memory:");
  });

  afterAll(() => {
    db.close();
  });

  test("inserts and queries an event", () => {
    const id = randomUUID();
    db.insertEvent({
      id,
      timestamp: "2026-04-03T12:00:00.000Z",
      source: "FINNHUB",
      category: "OPTIONS_FLOW",
      subcategory: "unusual_volume",
      ticker: "AAPL",
      rawValue: 15000,
      baselineValue: 5000,
      confidence: 0.85,
      rawPayload: JSON.stringify({ volume: 15000 }),
    });

    const event = db.getEvent(id);
    expect(event).toBeDefined();
    expect(event!.source).toBe("FINNHUB");
    expect(event!.ticker).toBe("AAPL");
    expect(event!.confidence).toBe(0.85);
  });

  test("inserts and queries a signal", () => {
    const id = randomUUID();
    db.insertSignal({
      id,
      timestamp: "2026-04-03T12:00:00.000Z",
      eventType: "Military Action",
      confidence: 0.9,
      direction: "BEARISH",
      urgency: "IMMEDIATE",
      sectorImpact: JSON.stringify(["Energy"]),
      contributingEventIds: JSON.stringify([randomUUID()]),
      suggestedTrades: JSON.stringify([]),
    });

    const signal = db.getSignal(id);
    expect(signal).toBeDefined();
    expect(signal!.eventType).toBe("Military Action");
    expect(signal!.confidence).toBe(0.9);
    expect(signal!.status).toBe("pending");
  });

  test("inserts and queries a trade", () => {
    const id = randomUUID();
    db.insertTrade({
      id,
      timestamp: "2026-04-03T12:00:00.000Z",
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      size: 2.5,
      entryPrice: 75.5,
      stopLoss: 73.0,
      takeProfit: 79.0,
      mode: "MODE_1",
      executionType: "MANUAL",
    });

    const trade = db.getTrade(id);
    expect(trade).toBeDefined();
    expect(trade!.venue).toBe("IG");
    expect(trade!.size).toBe(2.5);
    expect(trade!.status).toBe("open");
  });

  test("inserts and queries a wealth snapshot", () => {
    const id = randomUUID();
    db.insertWealthSnapshot({
      id,
      date: "2026-04-03",
      isaValue: 20000,
      sippValue: 15000,
      spreadBettingValue: 1500,
      cashValue: 5000,
      totalValue: 41500,
      regimeScore: 65,
    });

    const snapshot = db.getWealthSnapshot(id);
    expect(snapshot).toBeDefined();
    expect(snapshot!.totalValue).toBe(41500);
    expect(snapshot!.regimeScore).toBe(65);
  });

  test("inserts and queries a regime indicator", () => {
    const id = randomUUID();
    db.insertRegimeIndicator({
      id,
      date: "2026-04-03",
      vix: 18.5,
      yield2y: 4.2,
      yield10y: 4.5,
      spread2s10s: 0.3,
      sp500Vs200dma: 1.05,
      regimeScore: 72,
    });

    const indicator = db.getRegimeIndicator(id);
    expect(indicator).toBeDefined();
    expect(indicator!.vix).toBe(18.5);
    expect(indicator!.spread2s10s).toBe(0.3);
    expect(indicator!.regimeScore).toBe(72);
  });
});
