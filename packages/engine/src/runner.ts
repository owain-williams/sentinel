/**
 * Engine runner — alert worker + daily trend evaluation.
 * Run with: npx tsx packages/engine/src/runner.ts
 */
import { createDatabase } from "@sentinel/shared";
import { AlertWorker } from "./alerts/worker.ts";
import { createRiskGate } from "./risk/circuit-breaker.ts";
import { createExecutor } from "./automation/executor.ts";
import { createTradeService } from "./trades/service.ts";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DB_PATH = process.env.DATABASE_PATH ?? "./data/sentinel.db";
const CAPITAL_BASE = parseFloat(process.env.CAPITAL_BASE ?? "10000");
const ALERT_POLL_MS = parseInt(process.env.ALERT_POLL_MS ?? "2000", 10);

const db = createDatabase(DB_PATH);
const tradeService = createTradeService(db);
const riskGate = createRiskGate({
  capitalBase: CAPITAL_BASE,
  maxPositions: parseInt(process.env.MAX_OPEN_POSITIONS ?? "5", 10),
  maxRiskPerTradePct: parseFloat(process.env.RISK_PER_TRADE_PCT ?? "0.03"),
  maxDailyRiskPct: parseFloat(process.env.MAX_DAILY_RISK_PCT ?? "0.10"),
  dailyLossHaltPct: parseFloat(process.env.CIRCUIT_BREAKER_DAILY_LOSS_PCT ?? "0.05"),
});

const executor = createExecutor({
  riskGate,
  execute: (order) => {
    // In production, this would call IGClient or BetfairClient
    // For now, log the execution intent
    console.log(`[EXECUTE] ${order.direction} ${order.instrument} size=${order.size}`);
    return { success: true, dealId: `sim-${Date.now()}` };
  },
  openPositionCount: () => tradeService.listOpenTrades().length,
});

// Alert worker — consumes signals from Redis, sends Telegram notifications
const alertWorker = new AlertWorker({
  redisUrl: REDIS_URL,
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
  },
});

console.log("Engine starting...");
console.log(`  Capital: £${CAPITAL_BASE}`);
console.log(
  `  Risk gate: ${process.env.MAX_OPEN_POSITIONS ?? 5} max positions, ${(parseFloat(process.env.RISK_PER_TRADE_PCT ?? "0.03") * 100).toFixed(0)}% per trade`,
);
console.log(`  Alert polling: ${ALERT_POLL_MS}ms`);

// Alert processing loop
const alertInterval = setInterval(async () => {
  try {
    await alertWorker.processBatch();
  } catch (err) {
    console.error("[ALERT] Batch failed:", err);
  }
}, ALERT_POLL_MS);

// Kill switch via environment signal
function killSwitch() {
  console.log("[KILL SWITCH] Halting all trading");
  riskGate.killSwitch();
}

async function shutdown() {
  console.log("\nShutting down engine...");
  clearInterval(alertInterval);
  await alertWorker.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGUSR1", killSwitch);

console.log("Engine running. SIGINT to stop, SIGUSR1 for kill switch.");

// Export for programmatic use
export { riskGate, executor, tradeService };
