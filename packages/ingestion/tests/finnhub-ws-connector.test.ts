import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  DataSource,
  EventCategory,
  createRedisClient,
  consumeEvents,
  type RedisClient,
} from "@sentinel/shared";
import { FinnhubWsConnector } from "../src/connectors/finnhub-ws.ts";

const STREAM_KEY = "test:finnhub-ws:events";
const GROUP = "test-finnhub-ws-group";
const CONSUMER = "test-finnhub-ws-consumer";

describe("FinnhubWsConnector", () => {
  let redis: RedisClient;
  let connector: FinnhubWsConnector;

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(STREAM_KEY);
    connector = new FinnhubWsConnector({
      apiKey: "test-finnhub-key",
      redisClient: redis,
      streamKey: STREAM_KEY,
      watchlist: ["AAPL", "TSLA"],
    });
  });

  afterEach(async () => {
    await connector.disconnect();
    await redis.del(STREAM_KEY);
    await redis.quit();
  });

  test("normalises trade data into NormalisedEvent", async () => {
    // Simulate receiving a trade message from WebSocket
    const tradeMessage = {
      data: [
        { s: "AAPL", p: 185.5, v: 100, t: Date.now() },
        { s: "TSLA", p: 245.0, v: 50, t: Date.now() },
      ],
      type: "trade",
    };

    await connector.handleMessage(tradeMessage);

    const events = await consumeEvents(redis, STREAM_KEY, GROUP, CONSUMER, 20);
    expect(events).toHaveLength(2);

    const aaplEvent = events.find((e) => e.ticker === "AAPL");
    expect(aaplEvent).toBeDefined();
    expect(aaplEvent!.source).toBe(DataSource.FINNHUB);
    expect(aaplEvent!.category).toBe(EventCategory.OPTIONS_FLOW);
    expect(aaplEvent!.subcategory).toBe("trade");
    expect(aaplEvent!.rawValue).toBe(185.5);

    const tslaEvent = events.find((e) => e.ticker === "TSLA");
    expect(tslaEvent).toBeDefined();
    expect(tslaEvent!.rawValue).toBe(245.0);
  });

  test("health check reflects last message time", async () => {
    expect(await connector.healthCheck()).toBe(false);

    await connector.handleMessage({
      data: [{ s: "AAPL", p: 185.5, v: 100, t: Date.now() }],
      type: "trade",
    });

    expect(await connector.healthCheck()).toBe(true);
  });

  test("reconnection backoff increases exponentially", () => {
    expect(connector.getReconnectDelay(0)).toBe(1000);
    expect(connector.getReconnectDelay(1)).toBe(2000);
    expect(connector.getReconnectDelay(2)).toBe(4000);
    expect(connector.getReconnectDelay(3)).toBe(8000);
    // Capped at 30 seconds
    expect(connector.getReconnectDelay(10)).toBe(30000);
  });

  test("builds correct subscription messages", () => {
    const messages = connector.getSubscriptionMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: "subscribe", symbol: "AAPL" });
    expect(messages[1]).toEqual({ type: "subscribe", symbol: "TSLA" });
  });

  test("connector has correct name and source", () => {
    expect(connector.name).toBe("finnhub-ws");
    expect(connector.source).toBe(DataSource.FINNHUB);
  });
});
