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
import { AdsbConnector } from "../src/connectors/adsb.ts";

const ADSB_BASE = "https://adsbexchange-com1.p.rapidapi.com";
const STREAM_KEY = "test:adsb:events";
const GROUP = "test-adsb-group";
const CONSUMER = "test-adsb-consumer";

function makeMilitaryResponse() {
  return {
    ac: [
      {
        hex: "ae1234",
        type: "E6B",
        flight: "NAVY01",
        alt_baro: 35000,
        lat: 38.9,
        lon: -77.0,
        gs: 450,
        dbFlags: 1,
      },
      {
        hex: "ae5678",
        type: "KC135",
        flight: "TANKER22",
        alt_baro: 28000,
        lat: 36.0,
        lon: -75.5,
        gs: 380,
        dbFlags: 1,
      },
      {
        hex: "cc0001",
        type: "C40A",
        flight: "SAM001",
        alt_baro: 40000,
        lat: 38.8,
        lon: -77.1,
        gs: 500,
        dbFlags: 8,
      },
    ],
    total: 3,
    now: Date.now(),
  };
}

const handlers = [
  http.get(`${ADSB_BASE}/v2/mil/`, () => {
    return HttpResponse.json(makeMilitaryResponse());
  }),
];

const server = setupServer(...handlers);

describe("AdsbConnector", () => {
  let redis: RedisClient;
  let connector: AdsbConnector;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
    connector = new AdsbConnector({
      rapidApiKey: "test-rapidapi-key",
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

  test("polls military aircraft and publishes events", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    expect(events.length).toBe(3);
    expect(events.every((e) => e.source === DataSource.ADSB)).toBe(true);
    expect(events.every((e) => e.category === EventCategory.FLIGHT)).toBe(true);
    expect(events.every((e) => e.subcategory === "military_activity")).toBe(true);
  });

  test("flags high-interest aircraft types with higher confidence", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    // E-6B Mercury ("doomsday plane") should get elevated confidence
    const e6b = events.find((e) => (e.rawPayload as Record<string, unknown>).type === "E6B");
    expect(e6b).toBeDefined();
    expect(e6b!.confidence).toBeGreaterThan(0.6);

    // Normal military aircraft gets baseline confidence
    const tanker = events.find((e) => (e.rawPayload as Record<string, unknown>).type === "KC135");
    expect(tanker).toBeDefined();
    expect(tanker!.confidence).toBe(0.6);
  });

  test("health check reflects poll status", async () => {
    expect(await connector.healthCheck()).toBe(false);
    await connector.poll();
    expect(await connector.healthCheck()).toBe(true);
  });

  test("handles API errors gracefully", async () => {
    server.use(
      http.get(`${ADSB_BASE}/v2/mil/`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);
    expect(events).toHaveLength(0);
  });

  test("connector has correct name and source", () => {
    expect(connector.name).toBe("adsb");
    expect(connector.source).toBe(DataSource.ADSB);
  });
});
