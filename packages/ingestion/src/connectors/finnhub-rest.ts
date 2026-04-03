import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

interface OptionEntry {
  strike: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  lastPrice: number;
}

interface OptionChainExpiry {
  expirationDate: string;
  options: {
    CALL: OptionEntry[];
    PUT: OptionEntry[];
  };
}

interface OptionChainResponse {
  data: OptionChainExpiry[];
}

interface CandleResponse {
  v: number[];
  s: string;
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
  private volumeBaselines: Map<string, number[]> = new Map();

  constructor(config: FinnhubRestConnectorConfig) {
    this.apiKey = config.apiKey;
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
    this.watchlist = config.watchlist;
  }

  async connect(): Promise<void> {
    await this.poll().catch((err) => console.warn(`[finnhub-rest] Initial poll failed:`, err));
    // Poll every 5 minutes
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
      await this.processTickerOptions(ticker);
    }
    this.lastFetchTime = Date.now();
  }

  private async processTickerOptions(ticker: string): Promise<void> {
    const chain = await this.fetchOptionChain(ticker);
    if (!chain) return;

    let totalCallVolume = 0;
    let totalPutVolume = 0;
    let totalIV = 0;
    let ivCount = 0;

    for (const expiry of chain.data) {
      for (const call of expiry.options.CALL) {
        totalCallVolume += call.volume;
        totalIV += call.impliedVolatility;
        ivCount++;
      }
      for (const put of expiry.options.PUT) {
        totalPutVolume += put.volume;
        totalIV += put.impliedVolatility;
        ivCount++;
      }
    }

    const totalVolume = totalCallVolume + totalPutVolume;
    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;
    const avgIV = ivCount > 0 ? totalIV / ivCount : 0;

    // Update volume baseline
    const history = this.volumeBaselines.get(ticker) ?? [];
    const volumeBaseline = await this.fetchVolumeBaseline(ticker, history);

    // Emit options volume event
    await this.emit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: DataSource.FINNHUB,
      category: EventCategory.OPTIONS_FLOW,
      subcategory: "options_volume",
      ticker,
      rawValue: totalVolume,
      baselineValue: volumeBaseline,
      zScore: this.calculateZScore(totalVolume, history),
      confidence: 0.8,
      rawPayload: { totalVolume, callVolume: totalCallVolume, putVolume: totalPutVolume },
    });

    // Emit put/call ratio event
    await this.emit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: DataSource.FINNHUB,
      category: EventCategory.OPTIONS_FLOW,
      subcategory: "put_call_ratio",
      ticker,
      rawValue: putCallRatio,
      baselineValue: 0,
      confidence: 0.8,
      rawPayload: { putCallRatio, putVolume: totalPutVolume, callVolume: totalCallVolume },
    });

    // Emit average IV event
    await this.emit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: DataSource.FINNHUB,
      category: EventCategory.OPTIONS_FLOW,
      subcategory: "avg_iv",
      ticker,
      rawValue: avgIV,
      baselineValue: 0,
      confidence: 0.8,
      rawPayload: { avgIV },
    });
  }

  private async fetchOptionChain(ticker: string): Promise<OptionChainResponse | null> {
    const url = new URL(`${FINNHUB_BASE}/stock/option/chain`);
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("token", this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    return (await response.json()) as OptionChainResponse;
  }

  private async fetchVolumeBaseline(ticker: string, history: number[]): Promise<number> {
    if (history.length > 0) {
      return history.reduce((s, v) => s + v, 0) / history.length;
    }

    // Fetch historical candle data for baseline
    const now = Math.floor(Date.now() / 1000);
    const twentyDaysAgo = now - 20 * 86400;
    const url = new URL(`${FINNHUB_BASE}/stock/candle`);
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("resolution", "D");
    url.searchParams.set("from", String(twentyDaysAgo));
    url.searchParams.set("to", String(now));
    url.searchParams.set("token", this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) return 0;

    const data = (await response.json()) as CandleResponse;
    if (data.s !== "ok" || !data.v?.length) return 0;

    const volumes = data.v;
    this.volumeBaselines.set(ticker, volumes);
    return volumes.reduce((s, v) => s + v, 0) / volumes.length;
  }

  private calculateZScore(value: number, history: number[]): number | undefined {
    if (history.length < 2) return undefined;
    const mean = history.reduce((s, v) => s + v, 0) / history.length;
    const variance = history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  private async emit(event: NormalisedEvent): Promise<void> {
    await publishEvent(this.redis, this.streamKey, event);
    for (const handler of this.dataHandlers) {
      handler(event);
    }
  }
}
