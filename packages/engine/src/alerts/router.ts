import type { SignalEvent } from "@sentinel/shared";

export const AlertPriority = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type AlertPriority = (typeof AlertPriority)[keyof typeof AlertPriority];

export type AlertChannel = "telegram" | "dashboard";

export interface AlertRouting {
  priority: AlertPriority;
  channels: AlertChannel[];
}

/**
 * Rate limiter — max 1 Telegram message per event_type per cooldown window.
 * Prevents message floods when many similar signals fire at once.
 */
const TELEGRAM_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const lastTelegramSent = new Map<string, number>();

function isTelegramThrottled(signal: SignalEvent): boolean {
  const key = signal.event_type;
  const lastSent = lastTelegramSent.get(key) ?? 0;
  const now = Date.now();
  if (now - lastSent < TELEGRAM_COOLDOWN_MS) return true;
  lastTelegramSent.set(key, now);
  return false;
}

export function classifySignal(signal: SignalEvent): AlertRouting {
  // CRITICAL: high confidence + immediate urgency + multiple contributing events
  if (
    signal.confidence > 0.85 &&
    signal.urgency === "IMMEDIATE" &&
    signal.contributing_event_ids.length >= 2
  ) {
    return {
      priority: AlertPriority.CRITICAL,
      channels: isTelegramThrottled(signal) ? ["dashboard"] : ["telegram", "dashboard"],
    };
  }

  // HIGH: strong signals only go to Telegram (with rate limiting)
  if (signal.confidence > 0.8 && signal.urgency === "IMMEDIATE") {
    return {
      priority: AlertPriority.HIGH,
      channels: isTelegramThrottled(signal) ? ["dashboard"] : ["telegram", "dashboard"],
    };
  }

  // MEDIUM: dashboard only
  if (signal.confidence > 0.6) {
    return { priority: AlertPriority.MEDIUM, channels: ["dashboard"] };
  }

  return { priority: AlertPriority.LOW, channels: [] };
}
