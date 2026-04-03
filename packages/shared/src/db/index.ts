import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema.ts";

export type SentinelDatabase = ReturnType<typeof createDatabase>;

export function createDatabase(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      ticker TEXT,
      region TEXT,
      sector TEXT,
      z_score REAL,
      percentile_rank REAL,
      raw_value REAL NOT NULL,
      baseline_value REAL NOT NULL,
      confidence REAL NOT NULL,
      raw_payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      confidence REAL NOT NULL,
      direction TEXT,
      urgency TEXT,
      sector_impact TEXT,
      contributing_event_ids TEXT,
      suggested_trades TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      signal_id TEXT REFERENCES signals(id),
      timestamp TEXT NOT NULL,
      venue TEXT NOT NULL,
      instrument TEXT NOT NULL,
      direction TEXT NOT NULL,
      size REAL NOT NULL,
      entry_price REAL,
      exit_price REAL,
      stop_loss REAL,
      take_profit REAL,
      pnl REAL,
      status TEXT DEFAULT 'open',
      mode TEXT NOT NULL,
      execution_type TEXT,
      audit_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS wealth_snapshots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      isa_value REAL,
      sipp_value REAL,
      spread_betting_value REAL,
      betfair_value REAL,
      crypto_value REAL,
      cash_value REAL,
      total_value REAL,
      regime_score REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS regime_indicators (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      vix REAL,
      yield_2y REAL,
      yield_10y REAL,
      spread_2s10s REAL,
      sp500_vs_200dma REAL,
      regime_score REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return {
    insertEvent(data: typeof schema.events.$inferInsert) {
      db.insert(schema.events).values(data).run();
    },
    getEvent(id: string) {
      return db.select().from(schema.events).where(eq(schema.events.id, id)).get();
    },

    insertSignal(data: typeof schema.signals.$inferInsert) {
      db.insert(schema.signals).values(data).run();
    },
    getSignal(id: string) {
      return db.select().from(schema.signals).where(eq(schema.signals.id, id)).get();
    },

    listSignals(limit = 50) {
      return db
        .select()
        .from(schema.signals)
        .orderBy(desc(schema.signals.timestamp))
        .limit(limit)
        .all();
    },
    listTrades(limit = 50) {
      return db
        .select()
        .from(schema.trades)
        .orderBy(desc(schema.trades.timestamp))
        .limit(limit)
        .all();
    },

    insertTrade(data: typeof schema.trades.$inferInsert) {
      db.insert(schema.trades).values(data).run();
    },
    getTrade(id: string) {
      return db.select().from(schema.trades).where(eq(schema.trades.id, id)).get();
    },
    updateTrade(id: string, data: Partial<typeof schema.trades.$inferInsert>) {
      db.update(schema.trades).set(data).where(eq(schema.trades.id, id)).run();
    },
    listTradesByStatus(status: string) {
      return db.select().from(schema.trades).where(eq(schema.trades.status, status)).all();
    },

    insertWealthSnapshot(data: typeof schema.wealthSnapshots.$inferInsert) {
      db.insert(schema.wealthSnapshots).values(data).run();
    },
    getWealthSnapshot(id: string) {
      return db
        .select()
        .from(schema.wealthSnapshots)
        .where(eq(schema.wealthSnapshots.id, id))
        .get();
    },

    latestWealthSnapshot() {
      return db
        .select()
        .from(schema.wealthSnapshots)
        .orderBy(desc(schema.wealthSnapshots.date))
        .limit(1)
        .get();
    },

    insertRegimeIndicator(data: typeof schema.regimeIndicators.$inferInsert) {
      db.insert(schema.regimeIndicators).values(data).run();
    },
    getRegimeIndicator(id: string) {
      return db
        .select()
        .from(schema.regimeIndicators)
        .where(eq(schema.regimeIndicators.id, id))
        .get();
    },
    latestRegimeIndicator() {
      return db
        .select()
        .from(schema.regimeIndicators)
        .orderBy(desc(schema.regimeIndicators.date))
        .limit(1)
        .get();
    },

    close() {
      sqlite.close();
    },
  };
}
