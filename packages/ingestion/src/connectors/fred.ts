import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const FRED_BASE = "https://api.stlouisfed.org/fred";

const SERIES_IDS = ["VIXCLS", "DGS2", "DGS10", "FEDFUNDS", "DTWEXBGS"] as const;

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

export interface FredConnectorConfig {
  apiKey: string;
  redisClient: RedisClient;
  streamKey?: string;
}

export class FredConnector implements Connector {
  readonly name = "fred";
  readonly source = DataSource.FRED;

  private apiKey: string;
  private redis: RedisClient;
  private streamKey: string;
  private lastFetchTime: number | null = null;
  private dataHandlers: ((event: NormalisedEvent) => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: FredConnectorConfig) {
    this.apiKey = config.apiKey;
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
  }

  async connect(): Promise<void> {
    await this.poll();
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
    const hoursSinceLastFetch = (Date.now() - this.lastFetchTime) / (1000 * 60 * 60);
    return hoursSinceLastFetch < 25;
  }

  async poll(): Promise<void> {
    const values = new Map<string, number>();

    for (const seriesId of SERIES_IDS) {
      const value = await this.fetchSeries(seriesId);
      if (value !== null) {
        values.set(seriesId, value);
        const event = this.normalise(seriesId, value);
        await this.emit(event);
      }
    }

    // Calculate 2s10s spread if both yields are available
    const dgs2 = values.get("DGS2");
    const dgs10 = values.get("DGS10");
    if (dgs2 !== undefined && dgs10 !== undefined) {
      const spread = dgs10 - dgs2;
      const event = this.normalise("SPREAD_2S10S", spread, dgs2);
      await this.emit(event);
    }

    this.lastFetchTime = Date.now();
  }

  private async fetchSeries(seriesId: string): Promise<number | null> {
    const url = new URL(`${FRED_BASE}/series/observations`);
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = (await response.json()) as FredResponse;
    const observation = data.observations?.[0];
    if (!observation || observation.value === ".") return null;

    return parseFloat(observation.value);
  }

  private normalise(subcategory: string, value: number, baseline: number = 0): NormalisedEvent {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: DataSource.FRED,
      category: EventCategory.MACRO,
      subcategory,
      rawValue: value,
      baselineValue: baseline,
      confidence: 1.0,
      rawPayload: { seriesId: subcategory, value },
    };
  }

  private async emit(event: NormalisedEvent): Promise<void> {
    await publishEvent(this.redis, this.streamKey, event);
    for (const handler of this.dataHandlers) {
      handler(event);
    }
  }
}
