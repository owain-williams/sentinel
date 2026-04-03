import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { sendTelegramAlert } from "../src/alerts/telegram.ts";
import { AlertPriority } from "../src/alerts/router.ts";
import type { SignalEvent } from "@sentinel/shared";

const TELEGRAM_API = "https://api.telegram.org";
const BOT_TOKEN = "test-bot-token";
const CHAT_ID = "test-chat-id";

let lastRequestBody: Record<string, unknown> | null = null;

const handlers = [
  http.post(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, async ({ request }) => {
    lastRequestBody = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ok: true, result: { message_id: 1 } });
  }),
];

const server = setupServer(...handlers);

function makeSignal(overrides: Partial<SignalEvent> = {}): SignalEvent {
  return {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    timestamp: "2026-04-03T14:00:00.000Z",
    event_type: "anomaly_zscore",
    confidence: 0.85,
    direction: "VOLATILITY",
    urgency: "IMMEDIATE",
    contributing_event_ids: ["evt-1"],
    sector_impact: null,
    suggested_instruments: null,
    ...overrides,
  };
}

describe("sendTelegramAlert", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    lastRequestBody = null;
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  test("sends a formatted message to the Telegram API", async () => {
    await sendTelegramAlert(makeSignal(), AlertPriority.CRITICAL, {
      botToken: BOT_TOKEN,
      chatId: CHAT_ID,
    });

    expect(lastRequestBody).not.toBeNull();
    expect(lastRequestBody!.chat_id).toBe(CHAT_ID);
    expect(typeof lastRequestBody!.text).toBe("string");
    const text = lastRequestBody!.text as string;
    expect(text).toContain("anomaly_zscore");
    expect(text).toContain("85%");
    expect(text).toContain("VOLATILITY");
    expect(text).toContain("IMMEDIATE");
  });

  test("critical signals have warning indicator in message", async () => {
    await sendTelegramAlert(makeSignal(), AlertPriority.CRITICAL, {
      botToken: BOT_TOKEN,
      chatId: CHAT_ID,
    });

    const text = lastRequestBody!.text as string;
    expect(text).toContain("CRITICAL");
  });

  test("handles API error gracefully", async () => {
    server.use(
      http.post(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, () => {
        return HttpResponse.json({ ok: false, description: "Bad Request" }, { status: 400 });
      }),
    );

    // Should not throw
    await sendTelegramAlert(makeSignal(), AlertPriority.HIGH, {
      botToken: BOT_TOKEN,
      chatId: CHAT_ID,
    });
  });
});
