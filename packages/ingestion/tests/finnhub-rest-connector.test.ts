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

function makeOptionChain(totalVolume: number, putVolume: number, callVolume: number) {
  return {
    data: [
      {
        expirationDate: "2026-04-18",
        options: {
          CALL: [
            {
              strike: 150,
              volume: callVolume,
              openInterest: 5000,
              impliedVolatility: 0.35,
              lastPrice: 5.2,
            },
          ],
          PUT: [
            {
              strike: 140,
              volume: putVolume,
              openInterest: 3000,
              impliedVolatility: 0.4,
              lastPrice: 3.1,
            },
          ],
        },
      },
    ],
  };
}

function makeCandles(volumes: number[]) {
  return {
    c: volumes.map(() => 150),
    h: volumes.map(() => 152),
    l: volumes.map(() => 148),
    o: volumes.map(() => 149),
    v: volumes,
    t: volumes.map((_, i) => Math.floor(Date.now() / 1000) - (volumes.length - i) * 86400),
    s: "ok",
  };
}

const handlers = [
  http.get(`${FINNHUB_BASE}/stock/option/chain`, () => {
    return HttpResponse.json(makeOptionChain(20000, 8000, 12000));
  }),
  http.get(`${FINNHUB_BASE}/stock/candle`, () => {
    // 20 days of volume data, average ~5000
    const volumes = Array.from({ length: 20 }, () => 4500 + Math.round(Math.random() * 1000));
    return HttpResponse.json(makeCandles(volumes));
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

  test("fetches options chain and publishes events", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((e) => e.source === DataSource.FINNHUB)).toBe(true);
    expect(events.every((e) => e.category === EventCategory.OPTIONS_FLOW)).toBe(true);
  });

  test("includes ticker in events", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    expect(events.every((e) => e.ticker === "AAPL")).toBe(true);
  });

  test("calculates put/call ratio", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const pcEvent = events.find((e) => e.subcategory === "put_call_ratio");
    expect(pcEvent).toBeDefined();
    // 8000 puts / 12000 calls = 0.667
    expect(pcEvent!.rawValue).toBeCloseTo(8000 / 12000, 2);
  });

  test("calculates total volume", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const volEvent = events.find((e) => e.subcategory === "options_volume");
    expect(volEvent).toBeDefined();
    expect(volEvent!.rawValue).toBe(20000);
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
