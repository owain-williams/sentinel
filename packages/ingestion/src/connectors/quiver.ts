import {
  DataSource,
  EventCategory,
  type NormalisedEvent,
  publishEvent,
  type RedisClient,
} from "@sentinel/shared";
import type { Connector } from "./types.ts";

const QUIVER_BASE = "https://api.quiverquant.com/beta";

interface CongressTrade {
  ReportDate: string;
  TransactionDate: string;
  Ticker: string;
  Representative: string;
  Transaction: string;
  Amount: string;
  Party: string;
  Chamber: string;
}

interface GovernmentContract {
  Agency: string;
  Amount: number;
  Contractor: string;
  Date: string;
  Description: string;
}

export interface QuiverConnectorConfig {
  apiToken: string;
  redisClient: RedisClient;
  streamKey?: string;
  minContractAmount?: number;
}

export class QuiverConnector implements Connector {
  readonly name = "quiver";
  readonly source = DataSource.QUIVER;

  private apiToken: string;
  private redis: RedisClient;
  private streamKey: string;
  private minContractAmount: number;
  private lastFetchTime: number | null = null;
  private dataHandlers: ((event: NormalisedEvent) => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: QuiverConnectorConfig) {
    this.apiToken = config.apiToken;
    this.redis = config.redisClient;
    this.streamKey = config.streamKey ?? "events:raw";
    this.minContractAmount = config.minContractAmount ?? 1_000_000;
  }

  async connect(): Promise<void> {
    await this.poll().catch((err) => console.warn(`[quiver] Initial poll failed:`, err));
    // Poll every 30 minutes
    this.pollTimer = setInterval(
      () => {
        void this.poll().catch((err) => console.warn(`[quiver] Poll failed:`, err));
      },
      30 * 60 * 1000,
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
    return minutesSinceLastFetch < 60;
  }

  async poll(): Promise<void> {
    await this.fetchCongressTrades();
    await this.fetchGovernmentContracts();
    this.lastFetchTime = Date.now();
  }

  private async fetchCongressTrades(): Promise<void> {
    const response = await fetch(`${QUIVER_BASE}/historical/congresstrading`, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (!response.ok) return;

    const trades = (await response.json()) as CongressTrade[];

    for (const trade of trades) {
      await this.emit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: DataSource.QUIVER,
        category: EventCategory.CONGRESS_TRADE,
        subcategory: "congress_trade",
        ticker: trade.Ticker,
        rawValue: 1,
        baselineValue: 0,
        confidence: 0.7,
        rawPayload: { ...trade },
      });
    }
  }

  private async fetchGovernmentContracts(): Promise<void> {
    const response = await fetch(`${QUIVER_BASE}/historical/govcontractsall`, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (!response.ok) return;

    const contracts = (await response.json()) as GovernmentContract[];

    for (const contract of contracts) {
      if (contract.Amount < this.minContractAmount) continue;

      await this.emit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: DataSource.QUIVER,
        category: EventCategory.CONGRESS_TRADE,
        subcategory: "government_contract",
        rawValue: contract.Amount,
        baselineValue: this.minContractAmount,
        confidence: 0.6,
        rawPayload: { ...contract },
      });
    }
  }

  private async emit(event: NormalisedEvent): Promise<void> {
    await publishEvent(this.redis, this.streamKey, event);
    for (const handler of this.dataHandlers) {
      handler(event);
    }
  }
}
