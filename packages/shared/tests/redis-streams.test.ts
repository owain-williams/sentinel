import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { DataSource, EventCategory, type NormalisedEvent } from "../src/index.ts";
import { createRedisClient, publishEvent, consumeEvents, type RedisClient } from "../src/redis.ts";

const STREAM_KEY = "test:events:raw";
const GROUP_NAME = "test-consumer-group";
const CONSUMER_NAME = "test-consumer-1";

function makeEvent(overrides: Partial<NormalisedEvent> = {}): NormalisedEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source: DataSource.FINNHUB,
    category: EventCategory.OPTIONS_FLOW,
    subcategory: "unusual_volume",
    ticker: "AAPL",
    rawValue: 15000,
    baselineValue: 5000,
    confidence: 0.85,
    rawPayload: { volume: 15000 },
    ...overrides,
  };
}

describe("Redis Streams pipeline", () => {
  let redis: RedisClient;

  beforeAll(async () => {
    redis = createRedisClient(process.env.REDIS_URL ?? "redis://localhost:6379");
    // Clean up any leftover test data
    await redis.del(STREAM_KEY);
  });

  afterAll(async () => {
    await redis.del(STREAM_KEY);
    await redis.quit();
  });

  test("publishes an event to a Redis stream and consumes it back", async () => {
    const event = makeEvent({ ticker: "AAPL" });

    await publishEvent(redis, STREAM_KEY, event);

    const consumed = await consumeEvents(redis, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 1);

    expect(consumed).toHaveLength(1);
    expect(consumed[0].id).toBe(event.id);
    expect(consumed[0].source).toBe(DataSource.FINNHUB);
    expect(consumed[0].ticker).toBe("AAPL");
    expect(consumed[0].confidence).toBe(0.85);
    expect(consumed[0].rawPayload).toEqual({ volume: 15000 });
  });

  test("publishes 3 events and consumes all 3 in order", async () => {
    const events = [
      makeEvent({ ticker: "TSLA", rawValue: 100 }),
      makeEvent({ ticker: "GOOG", rawValue: 200 }),
      makeEvent({ ticker: "MSFT", rawValue: 300 }),
    ];

    for (const event of events) {
      await publishEvent(redis, STREAM_KEY, event);
    }

    const consumed = await consumeEvents(redis, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 10);

    expect(consumed).toHaveLength(3);
    expect(consumed[0].ticker).toBe("TSLA");
    expect(consumed[1].ticker).toBe("GOOG");
    expect(consumed[2].ticker).toBe("MSFT");
    expect(consumed[0].rawValue).toBe(100);
    expect(consumed[1].rawValue).toBe(200);
    expect(consumed[2].rawValue).toBe(300);
  });

  test("consumer acknowledges messages so they are not re-delivered", async () => {
    const event = makeEvent({ ticker: "NFLX" });
    await publishEvent(redis, STREAM_KEY, event);

    // First consume picks it up
    const first = await consumeEvents(redis, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 10);
    expect(first).toHaveLength(1);

    // Second consume should get nothing (already acknowledged)
    const second = await consumeEvents(redis, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 10);
    expect(second).toHaveLength(0);
  });
});
