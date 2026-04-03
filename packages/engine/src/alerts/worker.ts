import {
  createRedisClient,
  consumeSignals,
  type RedisClient,
  type SignalEvent,
} from "@sentinel/shared";
import { classifySignal } from "./router.ts";
import { sendTelegramAlert, type TelegramConfig } from "./telegram.ts";

export interface AlertWorkerConfig {
  redisUrl: string;
  signalsStream?: string;
  groupName?: string;
  consumerName?: string;
  telegram: TelegramConfig;
}

export class AlertWorker {
  private redis: RedisClient;
  private signalsStream: string;
  private groupName: string;
  private consumerName: string;
  private telegram: TelegramConfig;

  constructor(config: AlertWorkerConfig) {
    this.redis = createRedisClient(config.redisUrl);
    this.signalsStream = config.signalsStream ?? "signals:detected";
    this.groupName = config.groupName ?? "alert-workers";
    this.consumerName = config.consumerName ?? "alert-worker-1";
    this.telegram = config.telegram;
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
