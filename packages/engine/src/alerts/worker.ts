import {
  createRedisClient,
  consumeSignals,
  type RedisClient,
  type SignalEvent,
  type SentinelDatabase,
} from "@sentinel/shared";
import { classifySignal } from "./router.ts";
import { sendTelegramAlert, type TelegramConfig } from "./telegram.ts";

export interface AlertWorkerConfig {
  redisUrl: string;
  signalsStream?: string;
  groupName?: string;
  consumerName?: string;
  telegram: TelegramConfig;
  db?: SentinelDatabase;
}

export class AlertWorker {
  private redis: RedisClient;
  private signalsStream: string;
  private groupName: string;
  private consumerName: string;
  private telegram: TelegramConfig;
  private db?: SentinelDatabase;

  constructor(config: AlertWorkerConfig) {
    this.redis = createRedisClient(config.redisUrl);
    this.signalsStream = config.signalsStream ?? "signals:detected";
    this.groupName = config.groupName ?? "alert-workers";
    this.consumerName = config.consumerName ?? "alert-worker-1";
    this.telegram = config.telegram;
    this.db = config.db;
  }

  async processBatch(): Promise<void> {
    let signals: SignalEvent[];
    try {
      signals = await consumeSignals(
        this.redis,
        this.signalsStream,
        this.groupName,
        this.consumerName,
        20,
      );
    } catch (err) {
      console.error("Failed to consume signals:", err);
      return;
    }

    for (const signal of signals) {
      try {
        const { priority, channels } = classifySignal(signal);

        // Persist to SQLite for dashboard
        if (this.db) {
          this.db.insertSignal({
            id: signal.id,
            timestamp: signal.timestamp,
            eventType: signal.event_type,
            confidence: signal.confidence,
            direction: signal.direction,
            urgency: signal.urgency,
            sectorImpact: signal.sector_impact ? JSON.stringify(signal.sector_impact) : null,
            contributingEventIds: JSON.stringify(signal.contributing_event_ids),
            status: priority,
          });
        }

        if (channels.includes("telegram")) {
          await sendTelegramAlert(signal, priority, this.telegram);
        }
      } catch (err) {
        console.error(`Failed to process signal ${signal.id}:`, err);
      }
    }
  }

  async stop(): Promise<void> {
    await this.redis.quit();
  }
}
