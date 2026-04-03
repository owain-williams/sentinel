import type { TelegramConfig } from "./telegram.ts";
import type { PreparedOrder } from "../execution/order-preparer.ts";

function formatTradeMessage(order: PreparedOrder): string {
  return [
    `📈 Trade Confirmation Required`,
    ``,
    `Epic: ${order.epic ?? "UNKNOWN"}`,
    `Direction: ${order.direction}`,
    `Size: ${order.size} £/point`,
    `Stop: ${order.stopDistance} points`,
    `Limit: ${order.limitDistance} points`,
    `Risk: £${order.riskAmount}`,
    ``,
    `Rationale: ${order.rationale}`,
  ].join("\n");
}

export async function sendTradeConfirmation(
  order: PreparedOrder,
  signalId: string,
  config: TelegramConfig,
): Promise<void> {
  const text = formatTradeMessage(order);
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Confirm", callback_data: `confirm:${signalId}` },
        { text: "❌ Reject", callback_data: `reject:${signalId}` },
      ],
    ],
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram API error (${response.status}): ${body}`);
    }
  } catch (err) {
    console.error("Failed to send trade confirmation:", err);
  }
}
