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
import { GdeltConnector } from "../src/connectors/gdelt.ts";

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const STREAM_KEY = "test:gdelt:events";
const GROUP = "test-gdelt-group";
const CONSUMER = "test-gdelt-consumer";

function makeGdeltResponse(articleCount: number, _averageTone: number) {
  return {
    articles: Array.from({ length: articleCount }, (_, i) => ({
      url: `https://example.com/article-${i}`,
      title: `Article ${i}`,
      seendate: "20260403T120000Z",
      socialimage: "",
      domain: "example.com",
      language: "English",
      sourcecountry: "United States",
    })),
  };
}

const handlers = [
  http.get(GDELT_BASE, ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? "";

    if (query.includes("military")) {
      return HttpResponse.json(makeGdeltResponse(25, -3.5));
    }
    if (query.includes("sanctions")) {
      return HttpResponse.json(makeGdeltResponse(10, -1.2));
    }
    if (query.includes("oil")) {
      return HttpResponse.json(makeGdeltResponse(15, -0.5));
    }
    if (query.includes("rate decision")) {
      return HttpResponse.json(makeGdeltResponse(8, 0.2));
    }

    return HttpResponse.json(makeGdeltResponse(0, 0));
  }),
];

const server = setupServer(...handlers);

describe("GdeltConnector", () => {
  let redis: RedisClient;
  let connector: GdeltConnector;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
    connector = new GdeltConnector({
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

  test("polls all keyword sets and publishes events", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    expect(events.length).toBe(4); // one per keyword set
    expect(events.every((e) => e.source === DataSource.GDELT)).toBe(true);
    expect(events.every((e) => e.category === EventCategory.GEOPOLITICAL)).toBe(true);
  });

  test("includes article count as rawValue", async () => {
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const military = events.find((e) => e.subcategory === "military");
    expect(military).toBeDefined();
    expect(military!.rawValue).toBe(25);
  });

  test("tracks baseline and calculates z-score on second poll", async () => {
    // First poll establishes baseline
    await connector.poll();
    await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    // Second poll should have z-scores
    await connector.poll();
    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const military = events.find((e) => e.subcategory === "military");
    expect(military).toBeDefined();
    // With only 2 data points of same value, z-score should be 0 or near-zero
    expect(military!.zScore).toBeDefined();
  });

  test("health check returns true after successful poll", async () => {
    expect(await connector.healthCheck()).toBe(false);
    await connector.poll();
    expect(await connector.healthCheck()).toBe(true);
  });

  test("connector has correct name and source", () => {
    expect(connector.name).toBe("gdelt");
    expect(connector.source).toBe(DataSource.GDELT);
  });
});
