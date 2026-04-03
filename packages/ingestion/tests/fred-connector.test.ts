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
import { FredConnector } from "../src/connectors/fred.ts";

const FRED_BASE = "https://api.stlouisfed.org/fred";
const STREAM_KEY = "test:fred:events";
const GROUP = "test-fred-group";
const CONSUMER = "test-fred-consumer";

function makeFredResponse(seriesId: string, value: string) {
  return {
    realtime_start: "2026-04-03",
    realtime_end: "2026-04-03",
    observation_start: "2026-04-01",
    observation_end: "2026-04-03",
    units: "lin",
    output_type: 1,
    file_type: "json",
    order_by: "observation_date",
    sort_order: "desc",
    count: 1,
    offset: 0,
    limit: 1,
    observations: [
      {
        realtime_start: "2026-04-03",
        realtime_end: "2026-04-03",
        date: "2026-04-02",
        value,
      },
    ],
  };
}

const handlers = [
  http.get(`${FRED_BASE}/series/observations`, ({ request }) => {
    const url = new URL(request.url);
    const seriesId = url.searchParams.get("series_id");
    const values: Record<string, string> = {
      VIXCLS: "18.50",
      DGS2: "4.20",
      DGS10: "4.50",
      FEDFUNDS: "5.25",
      DTWEXBGS: "103.40",
    };
    const value = values[seriesId ?? ""] ?? "0";
    return HttpResponse.json(makeFredResponse(seriesId ?? "", value));
  }),
];

const server = setupServer(...handlers);

describe("FredConnector", () => {
  let redis: RedisClient;
  let connector: FredConnector;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
    connector = new FredConnector({
      apiKey: "test-fred-key",
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

  test("fetches all FRED series and publishes NormalisedEvents to Redis", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    // Should have events for: VIXCLS, DGS2, DGS10, FEDFUNDS, DTWEXBGS, plus calculated 2s10s spread
    expect(events.length).toBeGreaterThanOrEqual(5);

    const sources = events.map((e) => e.source);
    expect(sources.every((s) => s === DataSource.FRED)).toBe(true);

    const categories = events.map((e) => e.category);
    expect(categories.every((c) => c === EventCategory.MACRO)).toBe(true);
  });

  test("publishes VIX with correct value", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const vixEvent = events.find((e) => e.subcategory === "VIXCLS");
    expect(vixEvent).toBeDefined();
    expect(vixEvent!.rawValue).toBe(18.5);
  });

  test("calculates 2s10s spread from DGS10 - DGS2", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const spreadEvent = events.find((e) => e.subcategory === "SPREAD_2S10S");
    expect(spreadEvent).toBeDefined();
    expect(spreadEvent!.rawValue).toBeCloseTo(0.3, 5);
  });

  test("health check returns true after successful poll", async () => {
    expect(await connector.healthCheck()).toBe(false);
    await connector.poll();
    expect(await connector.healthCheck()).toBe(true);
  });

  test("connector implements the Connector interface", () => {
    expect(connector.name).toBe("fred");
    expect(connector.source).toBe(DataSource.FRED);
    expect(typeof connector.connect).toBe("function");
    expect(typeof connector.disconnect).toBe("function");
    expect(typeof connector.healthCheck).toBe("function");
  });
});
