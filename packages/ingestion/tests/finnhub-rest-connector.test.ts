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
import { FinnhubRestConnector } from "../src/connectors/finnhub-rest.ts";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const STREAM_KEY = "test:finnhub:events";
const GROUP = "test-finnhub-group";
const CONSUMER = "test-finnhub-consumer";

function makeQuote(price: number, prevClose: number) {
  return {
    c: price,
    d: price - prevClose,
    dp: ((price - prevClose) / prevClose) * 100,
    h: price * 1.01,
    l: price * 0.99,
    o: prevClose,
    pc: prevClose,
    t: Math.floor(Date.now() / 1000),
  };
}

function makeCandles(count: number) {
  return {
    c: Array.from({ length: count }, (_, i) => 148 + i * 0.1),
    h: Array.from({ length: count }, (_, i) => 150 + i * 0.1),
    l: Array.from({ length: count }, (_, i) => 146 + i * 0.1),
    o: Array.from({ length: count }, (_, i) => 147 + i * 0.1),
    v: Array.from({ length: count }, () => 4500 + Math.round(Math.random() * 1000)),
    t: Array.from({ length: count }, (_, i) => Math.floor(Date.now() / 1000) - (count - i) * 86400),
    s: "ok",
  };
}

const handlers = [
  http.get(`${FINNHUB_BASE}/quote`, () => {
    return HttpResponse.json(makeQuote(152.5, 150.0));
  }),
  http.get(`${FINNHUB_BASE}/stock/candle`, () => {
    return HttpResponse.json(makeCandles(20));
  }),
];

const server = setupServer(...handlers);

describe("FinnhubRestConnector", () => {
  let redis: RedisClient;
  let connector: FinnhubRestConnector;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
    connector = new FinnhubRestConnector({
      apiKey: "test-finnhub-key",
      redisClient: redis,
      streamKey: STREAM_KEY,
      watchlist: ["AAPL"],
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

  test("fetches quotes and publishes price + range events", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    // 1 ticker × 2 event types (price + intraday_range)
    expect(events.length).toBe(2);
    expect(events.every((e) => e.source === DataSource.FINNHUB)).toBe(true);
    expect(events.every((e) => e.category === EventCategory.OPTIONS_FLOW)).toBe(true);
  });

  test("includes ticker in events", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    expect(events.every((e) => e.ticker === "AAPL")).toBe(true);
  });

  test("price event contains quote data", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const priceEvent = events.find((e) => e.subcategory === "price");
    expect(priceEvent).toBeDefined();
    expect(priceEvent!.rawValue).toBe(152.5);
    expect((priceEvent!.rawPayload as Record<string, unknown>).prevClose).toBe(150.0);
  });

  test("intraday range event is emitted", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const rangeEvent = events.find((e) => e.subcategory === "intraday_range");
    expect(rangeEvent).toBeDefined();
    expect(rangeEvent!.rawValue).toBeGreaterThan(0);
  });

  test("health check returns true after successful poll", async () => {
    expect(await connector.healthCheck()).toBe(false);
    await connector.poll();
    expect(await connector.healthCheck()).toBe(true);
  });

  test("connector has correct name and source", () => {
    expect(connector.name).toBe("finnhub-rest");
    expect(connector.source).toBe(DataSource.FINNHUB);
  });
});
