/**
 * Ingestion runner — starts all connectors on their polling intervals.
 * Run with: npx tsx packages/ingestion/src/runner.ts
 */
import { createRedisClient } from "@sentinel/shared";
import { FinnhubRestConnector } from "./connectors/finnhub-rest.ts";
import { FinnhubWsConnector } from "./connectors/finnhub-ws.ts";
import { GdeltConnector } from "./connectors/gdelt.ts";
import { FredConnector } from "./connectors/fred.ts";
import { QuiverConnector } from "./connectors/quiver.ts";
import { AdsbConnector } from "./connectors/adsb.ts";
import { PolymarketConnector } from "./connectors/polymarket.ts";
import type { Connector } from "./connectors/types.ts";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = createRedisClient(REDIS_URL);

const connectors: Connector[] = [];

// Phase 1 connectors
if (process.env.FINNHUB_API_KEY) {
  connectors.push(
    new FinnhubRestConnector({
      apiKey: process.env.FINNHUB_API_KEY,
      redisClient: redis,
      watchlist: (process.env.FINNHUB_WATCHLIST ?? "AAPL,TSLA,SPY,QQQ,XLE").split(","),
    }),
    new FinnhubWsConnector({
      apiKey: process.env.FINNHUB_API_KEY,
      redisClient: redis,
      watchlist: (process.env.FINNHUB_WATCHLIST ?? "AAPL,TSLA,SPY,QQQ,XLE").split(","),
    }),
  );
}

if (process.env.FRED_API_KEY) {
  connectors.push(new FredConnector({ apiKey: process.env.FRED_API_KEY, redisClient: redis }));
}

connectors.push(new GdeltConnector({ redisClient: redis }));

if (process.env.POLYMARKET_ENABLED === "true") {
  connectors.push(new PolymarketConnector({ redisClient: redis }));
}

// Phase 2 connectors
if (process.env.QUIVER_API_TOKEN) {
  connectors.push(
    new QuiverConnector({ apiToken: process.env.QUIVER_API_TOKEN, redisClient: redis }),
  );
}

if (process.env.ADSB_RAPIDAPI_KEY) {
  connectors.push(
    new AdsbConnector({ rapidApiKey: process.env.ADSB_RAPIDAPI_KEY, redisClient: redis }),
  );
}

console.log(`Starting ${connectors.length} connectors...`);

async function start() {
  for (const connector of connectors) {
    try {
      await connector.connect();
      console.log(`  ✓ ${connector.name} connected`);
    } catch (err) {
      console.error(`  ✗ ${connector.name} failed to connect:`, err);
    }
  }

  console.log("Ingestion running. Press Ctrl+C to stop.");

  // Health check loop — log status every 5 minutes
  setInterval(
    async () => {
      for (const connector of connectors) {
        const healthy = await connector.healthCheck().catch(() => false);
        if (!healthy) {
          console.warn(`[HEALTH] ${connector.name} unhealthy`);
        }
      }
    },
    5 * 60 * 1000,
  );
}

async function shutdown() {
  console.log("\nShutting down connectors...");
  for (const connector of connectors) {
    try {
      await connector.disconnect();
    } catch {
      // best effort
    }
  }
  await redis.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void start();
