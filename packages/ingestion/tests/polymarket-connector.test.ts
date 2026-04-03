import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  DataSource,
  EventCategory,
  createRedisClient,
  consumeEvents,
  type RedisClient,
} from "@sentinel/shared";
import { PolymarketConnector } from "../src/connectors/polymarket.ts";

const POLY_BASE = "https://clob.polymarket.com";
const STREAM_KEY = "test:polymarket:events";
const GROUP = "test-poly-group";
const CONSUMER = "test-poly-consumer";

function makeMarkets() {
  return [
    {
      condition_id: "0x123",
      question: "Will there be a US government shutdown in 2026?",
      tokens: [
        { token_id: "tok-yes", outcome: "Yes", price: 0.35 },
        { token_id: "tok-no", outcome: "No", price: 0.65 },
      ],
      volume: 500000,
      active: true,
    },
    {
      condition_id: "0x456",
      question: "Will oil exceed $100 by June 2026?",
      tokens: [
        { token_id: "tok-yes-2", outcome: "Yes", price: 0.22 },
        { token_id: "tok-no-2", outcome: "No", price: 0.78 },
      ],
      volume: 250000,
      active: true,
    },
  ];
}

const handlers = [
  http.get(`${POLY_BASE}/markets`, () => {
    return HttpResponse.json(makeMarkets());
  }),
];

const server = setupServer(...handlers);

describe("PolymarketConnector", () => {
  let redis: RedisClient;
  let connector: PolymarketConnector;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
    connector = new PolymarketConnector({
      redisClient: redis,
      streamKey: STREAM_KEY,
    });
  });

  afterEach(async () => {
    await connector.disconnect();
    await redis.del(STREAM_KEY);
    await redis.quit();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  test("polls markets and publishes price events", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    expect(events.length).toBe(2);
    expect(events.every((e) => e.source === DataSource.POLYMARKET)).toBe(true);
    expect(events.every((e) => e.category === EventCategory.PREDICTION_MARKET)).toBe(true);
    expect(events.every((e) => e.subcategory === "market_price")).toBe(true);
  });

  test("tracks price baseline across multiple polls", async () => {
    // First poll establishes baseline
    await connector.poll();
    let events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);
    // On first poll, baseline equals current price (no history)
    expect(events[0].rawValue).toBe(events[0].baselineValue);

    // Second poll — price changed
    server.use(
      http.get(`${POLY_BASE}/markets`, () => {
        return HttpResponse.json([
          {
            condition_id: "0x123",
            question: "Will there be a US government shutdown in 2026?",
            tokens: [
              { token_id: "tok-yes", outcome: "Yes", price: 0.55 },
              { token_id: "tok-no", outcome: "No", price: 0.45 },
            ],
            volume: 600000,
            active: true,
          },
        ]);
      }),
    );

    await connector.poll();
    events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const event = events[0];
    // New price is 0.55, baseline should be previous value (0.35)
    expect(event.rawValue).toBe(0.55);
    expect(event.baselineValue).toBe(0.35);
  });

  test("skips inactive markets", async () => {
    server.use(
      http.get(`${POLY_BASE}/markets`, () => {
        return HttpResponse.json([
          {
            condition_id: "0x999",
            question: "Resolved market",
            tokens: [{ token_id: "t1", outcome: "Yes", price: 1.0 }],
            volume: 100000,
            active: false,
          },
        ]);
      }),
    );

    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);
    expect(events).toHaveLength(0);
  });

  test("health check reflects poll status", async () => {
    expect(await connector.healthCheck()).toBe(false);
    await connector.poll();
    expect(await connector.healthCheck()).toBe(true);
  });

  test("connector has correct name and source", () => {
    expect(connector.name).toBe("polymarket");
    expect(connector.source).toBe(DataSource.POLYMARKET);
  });
});
