import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const MAX_RECONNECT_DELAY = 30000;

interface FinnhubTrade {
  s: string; // symbol
  p: number; // price
  v: number; // volume
  t: number; // timestamp ms
}

interface FinnhubTradeMessage {
  data: FinnhubTrade[];
  type: string;
}

export interface FinnhubWsConnectorConfig {
  apiKey: string;
  redisClient: RedisClient;
  streamKey?: string;
  watchlist: string[];
}

export class FinnhubWsConnector implements Connector {
  readonly name = "finnhub-ws";
  readonly source = DataSource.FINNHUB;

  private apiKey: string;
  private redis: RedisClient;
  private streamKey: string;
  private watchlist: string[];
  private lastMessageTime: number | null = null;
  private dataHandlers: ((event: NormalisedEvent) => void)[] = [];
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;

  constructor(config: FinnhubWsConnectorConfig) {
    this.apiKey = config.apiKey;
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
    this.watchlist = config.watchlist.slice(0, 50); // Max 50 symbols
  }

  async connect(): Promise<void> {
    const url = `wss://ws.finnhub.io?token=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      for (const msg of this.getSubscriptionMessages()) {
        this.ws?.send(JSON.stringify(msg));
      }
    });

    this.ws.addEventListener("message", async (event) => {
      const data = JSON.parse(String(event.data)) as FinnhubTradeMessage;
      if (data.type === "trade") {
        await this.handleMessage(data);
      }
    });

    this.ws.addEventListener("close", () => {
      this.scheduleReconnect();
    });

    this.ws.addEventListener("error", () => {
      this.ws?.close();
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onData(handler: (event: NormalisedEvent) => void): void {
    this.dataHandlers.push(handler);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.lastMessageTime) return false;
    const secondsSinceLastMessage = (Date.now() - this.lastMessageTime) / 1000;
    return secondsSinceLastMessage < 60;
  }

  async handleMessage(message: FinnhubTradeMessage): Promise<void> {
    this.lastMessageTime = Date.now();

    for (const trade of message.data) {
      const event: NormalisedEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date(trade.t).toISOString(),
        source: DataSource.FINNHUB,
        category: EventCategory.OPTIONS_FLOW,
        subcategory: "trade",
        ticker: trade.s,
        rawValue: trade.p,
        baselineValue: 0,
        confidence: 1.0,
        rawPayload: { price: trade.p, volume: trade.v, symbol: trade.s },
      };

      await publishEvent(this.redis, this.streamKey, event);
      for (const handler of this.dataHandlers) {
        handler(event);
      }
    }
  }

  getSubscriptionMessages(): { type: string; symbol: string }[] {
    return this.watchlist.map((symbol) => ({ type: "subscribe", symbol }));
  }

  getReconnectDelay(attempt: number): number {
    return Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY);
  }

  private scheduleReconnect(): void {
    const delay = this.getReconnectDelay(this.reconnectAttempts);
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }
}
