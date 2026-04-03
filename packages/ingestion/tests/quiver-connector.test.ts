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
import { QuiverConnector } from "../src/connectors/quiver.ts";

const QUIVER_BASE = "https://api.quiverquant.com/beta";
const STREAM_KEY = "test:quiver:events";
const GROUP = "test-quiver-group";
const CONSUMER = "test-quiver-consumer";

function makeCongressTrades() {
  return [
    {
      ReportDate: "2026-04-01",
      TransactionDate: "2026-03-28",
      Ticker: "AAPL",
      Representative: "Nancy Pelosi",
      Transaction: "Purchase",
      Amount: "$1,000,001 - $5,000,000",
      Party: "Democrat",
      Chamber: "House",
    },
    {
      ReportDate: "2026-04-01",
      TransactionDate: "2026-03-29",
      Ticker: "MSFT",
      Representative: "Dan Crenshaw",
      Transaction: "Sale",
      Amount: "$100,001 - $250,000",
      Party: "Republican",
      Chamber: "House",
    },
  ];
}

function makeContracts() {
  return [
    {
      Agency: "Department of Defense",
      Amount: 5000000,
      Contractor: "Lockheed Martin",
      Date: "2026-04-01",
      Description: "F-35 maintenance contract",
    },
    {
      Agency: "Department of Energy",
      Amount: 500000,
      Contractor: "Small Corp",
      Date: "2026-04-01",
      Description: "Office supplies",
    },
  ];
}

const handlers = [
  http.get(`${QUIVER_BASE}/historical/congresstrading`, () => {
    return HttpResponse.json(makeCongressTrades());
  }),
  http.get(`${QUIVER_BASE}/historical/govcontractsall`, () => {
    return HttpResponse.json(makeContracts());
  }),
];

const server = setupServer(...handlers);

describe("QuiverConnector", () => {
  let redis: RedisClient;
  let connector: QuiverConnector;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
    connector = new QuiverConnector({
      apiToken: "test-quiver-token",
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

  test("polls congressional trades and publishes events", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const congressEvents = events.filter((e) => e.subcategory === "congress_trade");
    expect(congressEvents.length).toBe(2);
    expect(congressEvents.every((e) => e.source === DataSource.QUIVER)).toBe(true);
    expect(congressEvents.every((e) => e.category === EventCategory.CONGRESS_TRADE)).toBe(true);
    expect(congressEvents[0].ticker).toBe("AAPL");
    expect(congressEvents[1].ticker).toBe("MSFT");
  });

  test("polls government contracts and filters by minimum amount", async () => {
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);

    const contractEvents = events.filter((e) => e.subcategory === "government_contract");
    // Only the $5M contract should pass the $1M threshold; the $500K one is filtered out
    expect(contractEvents).toHaveLength(1);
    expect(contractEvents[0].rawValue).toBe(5_000_000);
    expect(contractEvents[0].rawPayload).toMatchObject({ Agency: "Department of Defense" });
  });

  test("health check reflects poll status", async () => {
    expect(await connector.healthCheck()).toBe(false);
    await connector.poll();
    expect(await connector.healthCheck()).toBe(true);
  });

  test("handles API errors gracefully without crashing", async () => {
    server.use(
      http.get(`${QUIVER_BASE}/historical/congresstrading`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
      http.get(`${QUIVER_BASE}/historical/govcontractsall`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    // Should not throw
    await connector.poll();

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);
    expect(events).toHaveLength(0);

    // Health check still updates (poll completed, just no data)
    expect(await connector.healthCheck()).toBe(true);
  });

  test("connector has correct name and source", () => {
    expect(connector.name).toBe("quiver");
    expect(connector.source).toBe(DataSource.QUIVER);
  });
});
