import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const ADSB_BASE = "https://adsbexchange-com1.p.rapidapi.com";

interface AircraftPosition {
  hex: string;
  type: string;
  flight: string;
  alt_baro: number;
  lat: number;
  lon: number;
  gs: number;
  dbFlags: number;
}

interface MilitaryResponse {
  ac: AircraftPosition[];
  total: number;
  now: number;
}

export interface AdsbConnectorConfig {
  rapidApiKey: string;
  redisClient: RedisClient;
  streamKey?: string;
}

export class AdsbConnector implements Connector {
  readonly name = "adsb";
  readonly source = DataSource.ADSB;

  private rapidApiKey: string;
  private redis: RedisClient;
  private streamKey: string;
  private lastFetchTime: number | null = null;
  private dataHandlers: ((event: NormalisedEvent) => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AdsbConnectorConfig) {
    this.rapidApiKey = config.rapidApiKey;
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
  }

  async connect(): Promise<void> {
    await this.poll().catch((err) => console.warn(`[adsb] Initial poll failed:`, err));
    // Poll every 10 minutes
    this.pollTimer = setInterval(
      () => {
        void this.poll().catch((err) => console.warn(`[adsb] Poll failed:`, err));
      },
      10 * 60 * 1000,
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
    return minutesSinceLastFetch < 20;
  }

  async poll(): Promise<void> {
    const response = await fetch(`${ADSB_BASE}/v2/mil/`, {
      headers: {
        "x-rapidapi-key": this.rapidApiKey,
        "x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com",
      },
    });
    if (!response.ok) return;

    const data = (await response.json()) as MilitaryResponse;
    if (!data.ac) return;

    for (const aircraft of data.ac) {
      await this.emit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: DataSource.ADSB,
        category: EventCategory.FLIGHT,
        subcategory: "military_activity",
        rawValue: aircraft.alt_baro,
        baselineValue: 0,
        confidence: this.assessConfidence(aircraft),
        rawPayload: { ...aircraft },
      });
    }

    this.lastFetchTime = Date.now();
  }

  private assessConfidence(aircraft: AircraftPosition): number {
    // High-interest aircraft per PRD: E-6B Mercury, government VIP jets
    const highInterest = ["E6B", "E4B", "VC25", "C32A", "C40A"];
    if (highInterest.includes(aircraft.type)) return 0.9;
    return 0.6;
  }

  private async emit(event: NormalisedEvent): Promise<void> {
    await publishEvent(this.redis, this.streamKey, event);
    for (const handler of this.dataHandlers) {
      handler(event);
    }
  }
}
