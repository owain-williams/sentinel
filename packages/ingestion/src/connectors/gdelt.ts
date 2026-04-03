import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

interface KeywordSet {
  name: string;
  query: string;
}

const DEFAULT_KEYWORD_SETS: KeywordSet[] = [
  {
    name: "military",
    query: '"military strike" OR "troops deployed" OR "naval exercise" OR "airspace violation"',
  },
  { name: "trade_sanctions", query: '"trade sanctions" OR "tariff" OR "embargo" OR "trade war"' },
  { name: "energy", query: '"oil production cut" OR "OPEC" OR "pipeline" OR "refinery shutdown"' },
  {
    name: "financial",
    query: '"rate decision" OR "emergency meeting" OR "bank failure" OR "default"',
  },
];

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  sourcecountry: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

export interface GdeltConnectorConfig {
  redisClient: RedisClient;
  streamKey?: string;
  keywordSets?: KeywordSet[];
}

export class GdeltConnector implements Connector {
  readonly name = "gdelt";
  readonly source = DataSource.GDELT;

  private redis: RedisClient;
  private streamKey: string;
  private keywordSets: KeywordSet[];
  private lastFetchTime: number | null = null;
  private dataHandlers: ((event: NormalisedEvent) => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private baselineHistory: Map<string, number[]> = new Map();

  constructor(config: GdeltConnectorConfig) {
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
    this.keywordSets = config.keywordSets ?? DEFAULT_KEYWORD_SETS;
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
    return hoursSinceLastFetch < 1;
  }

  async poll(): Promise<void> {
    for (const keywordSet of this.keywordSets) {
      const articleCount = await this.fetchKeywordSet(keywordSet);
      if (articleCount === null) continue;

      const history = this.baselineHistory.get(keywordSet.name) ?? [];
      history.push(articleCount);
      this.baselineHistory.set(keywordSet.name, history);

      const baseline = this.calculateMean(history);
      const zScore = this.calculateZScore(articleCount, history);

      const event: NormalisedEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: DataSource.GDELT,
        category: EventCategory.GEOPOLITICAL,
        subcategory: keywordSet.name,
        rawValue: articleCount,
        baselineValue: baseline,
        zScore: zScore ?? undefined,
        confidence: 0.7,
        rawPayload: { keywordSet: keywordSet.name, articleCount, query: keywordSet.query },
      };

      await this.emit(event);
    }

    this.lastFetchTime = Date.now();
  }

  private async fetchKeywordSet(keywordSet: KeywordSet): Promise<number | null> {
    const url = new URL(GDELT_BASE);
    url.searchParams.set("query", keywordSet.query);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("maxrecords", "250");
    url.searchParams.set("format", "json");
    url.searchParams.set("timespan", "15min");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = (await response.json()) as GdeltResponse;
    return data.articles?.length ?? 0;
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private calculateZScore(value: number, history: number[]): number | null {
    if (history.length < 2) return null;
    const mean = this.calculateMean(history);
    const variance = history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length;
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
