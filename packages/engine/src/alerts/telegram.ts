import type { SignalEvent } from "@sentinel/shared";
import type { AlertPriority } from "./router.ts";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function formatMessage(signal: SignalEvent, priority: AlertPriority): string {
  const confidencePct = `${Math.round(signal.confidence * 100)}%`;
  const prefix = priority === "CRITICAL" ? "🚨 CRITICAL" : `📊 ${priority}`;

  return [
    `${prefix} Signal Detected`,
    ``,
    `Type: ${signal.event_type}`,
    `Confidence: ${confidencePct}`,
    `Direction: ${signal.direction}`,
    `Urgency: ${signal.urgency}`,
    `Contributing events: ${signal.contributing_event_ids.length}`,
    `Time: ${signal.timestamp}`,
  ].join("\n");
}

export async function sendTelegramAlert(
  signal: SignalEvent,
  priority: AlertPriority,
  config: TelegramConfig,
): Promise<void> {
  const text = formatMessage(signal, priority);
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: "HTML" }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram API error (${response.status}): ${body}`);
    }
  } catch (err) {
    console.error("Failed to send Telegram alert:", err);
  }
}
