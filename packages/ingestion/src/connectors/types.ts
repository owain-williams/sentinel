import type { DataSource, NormalisedEvent } from "@sentinel/shared";

export interface Connector {
  name: string;
  source: DataSource;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(handler: (event: NormalisedEvent) => void): void;
  healthCheck(): Promise<boolean>;
}
