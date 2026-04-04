import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

interface QuoteResponse {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp
}

interface CandleResponse {
  c: number[]; // close
  h: number[]; // high
  l: number[]; // low
  o: number[]; // open
  v: number[]; // volume
  t: number[]; // timestamps
  s: string; // status
}

export interface FinnhubRestConnectorConfig {
  apiKey: string;
  redisClient: RedisClient;
  streamKey?: string;
  watchlist: string[];
}

export class FinnhubRestConnector implements Connector {
  readonly name = "finnhub-rest";
  readonly source = DataSource.FINNHUB;

  private apiKey: string;
  private redis: RedisClient;
  private streamKey: string;
  private watchlist: string[];
  private lastFetchTime: number | null = null;
  private dataHandlers: ((event: NormalisedEvent) => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();

  constructor(config: FinnhubRestConnectorConfig) {
    this.apiKey = config.apiKey;
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
    this.watchlist = config.watchlist;
  }

  async connect(): Promise<void> {
    // Seed baselines with 20-day candle history
    await this.seedBaselines().catch((err) =>
      console.warn(`[finnhub-rest] Baseline seed failed:`, err),
    );
    await this.poll().catch((err) => console.warn(`[finnhub-rest] Initial poll failed:`, err));
    // Poll every 5 minutes (free tier: 60 calls/min)
    this.pollTimer = setInterval(
      () => {
        void this.poll().catch((err) => console.warn(`[finnhub-rest] Poll failed:`, err));
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
    return minutesSinceLastFetch < 10;
  }

  async poll(): Promise<void> {
    for (const ticker of this.watchlist) {
      await this.processTicker(ticker);
    }
    this.lastFetchTime = Date.now();
  }

  private async seedBaselines(): Promise<void> {
    for (const ticker of this.watchlist) {
      const candles = await this.fetchCandles(ticker);
      if (!candles) continue;

      this.priceHistory.set(ticker, candles.c.slice());
      this.volumeHistory.set(ticker, candles.v.slice());
    }
  }

  private async processTicker(ticker: string): Promise<void> {
    const quote = await this.fetchQuote(ticker);
    if (!quote || quote.c === 0) return;

    // Update price history
    const prices = this.priceHistory.get(ticker) ?? [];
    const priceBaseline = this.mean(prices);
    prices.push(quote.c);
    if (prices.length > 100) prices.shift();
    this.priceHistory.set(ticker, prices);

    // Emit price change event
    await this.emit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: DataSource.FINNHUB,
      category: EventCategory.OPTIONS_FLOW,
      subcategory: "price",
      ticker,
      rawValue: quote.c,
      baselineValue: priceBaseline || quote.pc,
      zScore: this.zScore(quote.c, prices),
      confidence: 0.8,
      rawPayload: {
        price: quote.c,
        change: quote.d,
        changePct: quote.dp,
        high: quote.h,
        low: quote.l,
        open: quote.o,
        prevClose: quote.pc,
      },
    });

    // Emit intraday range event (high-low spread as % of price)
    const rangePct = quote.c > 0 ? ((quote.h - quote.l) / quote.c) * 100 : 0;
    await this.emit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: DataSource.FINNHUB,
      category: EventCategory.OPTIONS_FLOW,
      subcategory: "intraday_range",
      ticker,
      rawValue: rangePct,
      baselineValue: 1.5, // typical daily range ~1.5%
      confidence: 0.7,
      rawPayload: { rangePct, high: quote.h, low: quote.l, price: quote.c },
    });
  }

  private async fetchQuote(ticker: string): Promise<QuoteResponse | null> {
    return this.fetchJson<QuoteResponse>(
      `${FINNHUB_BASE}/quote?symbol=${ticker}&token=${this.apiKey}`,
    );
  }

  private async fetchCandles(ticker: string): Promise<CandleResponse | null> {
    const now = Math.floor(Date.now() / 1000);
    const twentyDaysAgo = now - 20 * 86400;
    const data = await this.fetchJson<CandleResponse>(
      `${FINNHUB_BASE}/stock/candle?symbol=${ticker}&resolution=D&from=${twentyDaysAgo}&to=${now}&token=${this.apiKey}`,
    );
    if (!data || data.s !== "ok") return null;
    return data;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;
    return (await response.json()) as T;
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private zScore(value: number, history: number[]): number | undefined {
    if (history.length < 2) return undefined;
    const m = this.mean(history);
    const variance = history.reduce((s, v) => s + (v - m) ** 2, 0) / history.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (value - m) / stdDev;
  }

  private async emit(event: NormalisedEvent): Promise<void> {
    await publishEvent(this.redis, this.streamKey, event);
    for (const handler of this.dataHandlers) {
      handler(event);
    }
  }
}
