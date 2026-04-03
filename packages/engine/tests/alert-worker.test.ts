import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createRedisClient, type RedisClient } from "@sentinel/shared";
import { AlertWorker } from "../src/alerts/worker.ts";

const SIGNALS_STREAM = "test:signals:detected";
const BOT_TOKEN = "test-bot-token";
const CHAT_ID = "test-chat-id";
const TELEGRAM_API = "https://api.telegram.org";

let telegramMessages: string[] = [];

const handlers = [
  http.post(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    telegramMessages.push(body.text as string);
    return HttpResponse.json({ ok: true, result: { message_id: 1 } });
  }),
];

const server = setupServer(...handlers);

let signalCounter = 0;

function publishSignal(redis: RedisClient, overrides: Record<string, unknown> = {}) {
  signalCounter++;
  const signal = {
    id: `sig-${signalCounter}`,
    timestamp: "2026-04-03T14:00:00.000Z",
    // Unique event_type per signal to avoid rate limiter
    event_type: `anomaly_zscore_${signalCounter}`,
    confidence: 0.9,
    direction: "VOLATILITY",
    urgency: "IMMEDIATE",
    contributing_event_ids: ["evt-1", "evt-2"],
    sector_impact: null,
    suggested_instruments: null,
    ...overrides,
  };
  return redis.xadd(SIGNALS_STREAM, "*", "data", JSON.stringify(signal));
}

describe("AlertWorker", () => {
  let redis: RedisClient;
  let worker: AlertWorker;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    redis = createRedisClient("redis://localhost:6379");
    await redis.del(SIGNALS_STREAM);
    telegramMessages = [];
    worker = new AlertWorker({
      redisUrl: "redis://localhost:6379",
      signalsStream: SIGNALS_STREAM,
      telegram: { botToken: BOT_TOKEN, chatId: CHAT_ID },
    });
  });

  afterEach(async () => {
    await worker.stop();
    await redis.del(SIGNALS_STREAM);
    await redis.quit();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  test("consumes signal and sends Telegram alert for critical priority", async () => {
    // Critical needs > 0.85, IMMEDIATE, 2+ contributing events
    await publishSignal(redis, {
      confidence: 0.9,
      urgency: "IMMEDIATE",
      contributing_event_ids: ["evt-1", "evt-2"],
    });

    await worker.processBatch();

    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0]).toContain("CRITICAL");
  });

  test("sends Telegram alert for high priority signals", async () => {
    // High needs > 0.8, IMMEDIATE (but single contributing event → not critical)
    await publishSignal(redis, {
      confidence: 0.85,
      urgency: "IMMEDIATE",
      contributing_event_ids: ["evt-1"],
    });

    await worker.processBatch();

    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0]).toContain("HIGH");
  });

  test("does not send Telegram for medium priority signals", async () => {
    await publishSignal(redis, { confidence: 0.7, urgency: "HOURS" });

    await worker.processBatch();

    expect(telegramMessages).toHaveLength(0);
  });

  test("processes multiple signals in one batch", async () => {
    // Critical
    await publishSignal(redis, {
      confidence: 0.9,
      urgency: "IMMEDIATE",
      contributing_event_ids: ["evt-1", "evt-2"],
    });
    // High
    await publishSignal(redis, {
      confidence: 0.85,
      urgency: "IMMEDIATE",
      contributing_event_ids: ["evt-1"],
    });
    // Medium — no Telegram
    await publishSignal(redis, { confidence: 0.7, urgency: "HOURS" });

    await worker.processBatch();

    expect(telegramMessages).toHaveLength(2);
  });

  test("skips malformed signals without crashing", async () => {
    await redis.xadd(SIGNALS_STREAM, "*", "data", "not valid json{");
    await publishSignal(redis, {
      confidence: 0.9,
      urgency: "IMMEDIATE",
      contributing_event_ids: ["evt-1", "evt-2"],
    });

    await worker.processBatch();

    expect(telegramMessages).toHaveLength(1);
  });
});
