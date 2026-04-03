import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createRedisClient, consumeSignals, type RedisClient } from "@sentinel/shared";

const STREAM_KEY = "test:signals:detected";
const GROUP = "test-alert-workers";
const CONSUMER = "test-worker-1";

function makeSignalJson(): string {
  return JSON.stringify({
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    timestamp: "2026-04-03T14:00:00.000Z",
    event_type: "anomaly_zscore",
    confidence: 0.85,
    direction: "VOLATILITY",
    urgency: "IMMEDIATE",
    contributing_event_ids: ["evt-1"],
    sector_impact: null,
    suggested_instruments: null,
  });
}

describe("consumeSignals", () => {
  let redis: RedisClient;

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
  });

  afterEach(async () => {
    await redis.del(STREAM_KEY);
    await redis.quit();
  });

  test("reads and deserialises a signal from Redis stream", async () => {
    await redis.xadd(STREAM_KEY, "*", "data", makeSignalJson());

    const signals = await consumeSignals(redis, STREAM_KEY, GROUP, CONSUMER, 10);

    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("anomaly_zscore");
    expect(signals[0].confidence).toBe(0.85);
    expect(signals[0].direction).toBe("VOLATILITY");
    expect(signals[0].contributing_event_ids).toEqual(["evt-1"]);
  });

  test("returns empty array when no signals pending", async () => {
    const signals = await consumeSignals(redis, STREAM_KEY, GROUP, CONSUMER, 10);
    expect(signals).toEqual([]);
  });
});
