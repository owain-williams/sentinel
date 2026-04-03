import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  source: text("source").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  ticker: text("ticker"),
  region: text("region"),
  sector: text("sector"),
  zScore: real("z_score"),
  percentileRank: real("percentile_rank"),
  rawValue: real("raw_value").notNull(),
  baselineValue: real("baseline_value").notNull(),
  confidence: real("confidence").notNull(),
  rawPayload: text("raw_payload"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const signals = sqliteTable("signals", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  eventType: text("event_type").notNull(),
  confidence: real("confidence").notNull(),
  direction: text("direction"),
  urgency: text("urgency"),
  sectorImpact: text("sector_impact"),
  contributingEventIds: text("contributing_event_ids"),
  suggestedTrades: text("suggested_trades"),
  status: text("status").default("pending"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const trades = sqliteTable("trades", {
  id: text("id").primaryKey(),
  signalId: text("signal_id").references(() => signals.id),
  timestamp: text("timestamp").notNull(),
  venue: text("venue").notNull(),
  instrument: text("instrument").notNull(),
  direction: text("direction").notNull(),
  size: real("size").notNull(),
  entryPrice: real("entry_price"),
  exitPrice: real("exit_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  pnl: real("pnl"),
  status: text("status").default("open"),
  mode: text("mode").notNull(),
  executionType: text("execution_type"),
  auditNotes: text("audit_notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  closedAt: text("closed_at"),
});

export const wealthSnapshots = sqliteTable("wealth_snapshots", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  isaValue: real("isa_value"),
  sippValue: real("sipp_value"),
  spreadBettingValue: real("spread_betting_value"),
  betfairValue: real("betfair_value"),
  cryptoValue: real("crypto_value"),
  cashValue: real("cash_value"),
  totalValue: real("total_value"),
  regimeScore: real("regime_score"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const regimeIndicators = sqliteTable("regime_indicators", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  vix: real("vix"),
  yield2y: real("yield_2y"),
  yield10y: real("yield_10y"),
  spread2s10s: real("spread_2s10s"),
  sp500Vs200dma: real("sp500_vs_200dma"),
  regimeScore: real("regime_score"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
