import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const POLY_BASE = "https://clob.polymarket.com";

interface PolymarketToken {
  token_id: string;
  outcome: string;
  price: number;
}

interface PolymarketMarket {
  condition_id: string;
  question: string;
  tokens: PolymarketToken[];
  volume: number;
  active: boolean;
}

export interface PolymarketConnectorConfig {
  redisClient: RedisClient;
  streamKey?: string;
}

export class PolymarketConnector implements Connector {
  readonly name = "polymarket";
  readonly source = DataSource.POLYMARKET;

  private redis: RedisClient;
  private streamKey: string;
  private lastFetchTime: number | null = null;
  private dataHandlers: ((event: NormalisedEvent) => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private priceHistory: Map<string, number[]> = new Map();

  constructor(config: PolymarketConnectorConfig) {
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
  }

  async connect(): Promise<void> {
    // Initial poll — don't let failure prevent the connector from starting
    await this.poll().catch((err) => console.warn(`[polymarket] Initial poll failed:`, err));
    // Poll every 5 minutes
    this.pollTimer = setInterval(
      () => {
        void this.poll().catch((err) => console.warn(`[polymarket] Poll failed:`, err));
      },
      5 * 60 * 1000,
    );
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  onData(handler: (event: NormalisedEvent) => void): void {
    this.dataHandlers.push(handler);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.lastFetchTime) return false;
    const minutesSinceLastFetch = (Date.now() - this.lastFetchTime) / (1000 * 60);
    return minutesSinceLastFetch < 30;
  }

  async poll(): Promise<void> {
    const response = await fetch(`${POLY_BASE}/markets`);
    if (!response.ok) return;

    const body = (await response.json()) as { data?: PolymarketMarket[] };
    const markets = body.data ?? [];

    for (const market of markets) {
      if (!market.active) continue;

      const yesToken = market.tokens.find((t) => t.outcome === "Yes");
      const price = yesToken?.price ?? 0;

      // Track price history for baseline
      const history = this.priceHistory.get(market.condition_id) ?? [];
      history.push(price);
      if (history.length > 100) history.shift();
      this.priceHistory.set(market.condition_id, history);

      const baseline =
        history.length > 1
          ? history.slice(0, -1).reduce((s, v) => s + v, 0) / (history.length - 1)
          : price;

      await this.emit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: DataSource.POLYMARKET,
        category: EventCategory.PREDICTION_MARKET,
        subcategory: "market_price",
        rawValue: price,
        baselineValue: baseline,
        confidence: 0.7,
        rawPayload: {
          condition_id: market.condition_id,
          question: market.question,
          volume: market.volume,
          price,
        },
      });
    }

    this.lastFetchTime = Date.now();
  }

  private async emit(event: NormalisedEvent): Promise<void> {
    await publishEvent(this.redis, this.streamKey, event);
    for (const handler of this.dataHandlers) {
      handler(event);
    }
  }
}
