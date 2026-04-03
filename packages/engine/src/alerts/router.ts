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

export function classifySignal(signal: SignalEvent): AlertRouting {
  if (signal.confidence > 0.8 && signal.urgency === "IMMEDIATE") {
    return { priority: AlertPriority.CRITICAL, channels: ["telegram", "dashboard"] };
  }

  if (signal.confidence > 0.6) {
    return { priority: AlertPriority.HIGH, channels: ["telegram", "dashboard"] };
  }

  if (signal.confidence > 0.4) {
    return { priority: AlertPriority.MEDIUM, channels: ["dashboard"] };
  }

  return { priority: AlertPriority.LOW, channels: [] };
}
