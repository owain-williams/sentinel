import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { sendTradeConfirmation } from "../src/alerts/telegram-trade.ts";
import type { PreparedOrder } from "../src/execution/order-preparer.ts";

const TELEGRAM_API = "https://api.telegram.org";
const BOT_TOKEN = "test-bot-token";
const CHAT_ID = "test-chat-id";

let capturedMessages: Array<{ text: string; reply_markup?: unknown }> = [];

const handlers = [
  http.post(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    capturedMessages.push({ text: body.text as string, reply_markup: body.reply_markup });
    return HttpResponse.json({ ok: true, result: { message_id: 1 } });
  }),
];

const server = setupServer(...handlers);

describe("sendTradeConfirmation", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    capturedMessages = [];
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  test("sends formatted trade confirmation with order details", async () => {
    const order: PreparedOrder = {
      epic: "EN.D.LCO.Month1.IP",
      direction: "BUY",
      size: 2.4,
      stopDistance: 50,
      limitDistance: 75,
      riskAmount: 120,
      rationale: "Energy supply disruption bullish for oil",
    };

    await sendTradeConfirmation(order, "sig-123", {
      botToken: BOT_TOKEN,
      chatId: CHAT_ID,
    });

    expect(capturedMessages).toHaveLength(1);
    const msg = capturedMessages[0];
    expect(msg.text).toContain("EN.D.LCO.Month1.IP");
    expect(msg.text).toContain("BUY");
    expect(msg.text).toContain("2.4");
    expect(msg.text).toContain("120");
    expect(msg.text).toContain("Energy supply disruption");
  });

  test("includes inline keyboard with confirm and reject buttons", async () => {
    const order: PreparedOrder = {
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "SELL",
      size: 1,
      stopDistance: 40,
      limitDistance: 60,
      riskAmount: 90,
      rationale: "test",
    };

    await sendTradeConfirmation(order, "sig-456", {
      botToken: BOT_TOKEN,
      chatId: CHAT_ID,
    });

    const markup = capturedMessages[0].reply_markup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    expect(markup).toBeDefined();
    expect(markup.inline_keyboard).toHaveLength(1);

    const buttons = markup.inline_keyboard[0];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].callback_data).toContain("confirm:sig-456");
    expect(buttons[1].callback_data).toContain("reject:sig-456");
  });
});
