import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createDatabase, type SentinelDatabase } from "@sentinel/shared";
import { createTradeService } from "../src/trades/service.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTmpDb() {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
  const db = createDatabase(join(dir, "test.db"));
  return { db, dir };
}

describe("TradeService", () => {
  let db: SentinelDatabase;
  let tmpDir: string;

  beforeEach(() => {
    const tmp = makeTmpDb();
    db = tmp.db;
    tmpDir = tmp.dir;
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("opens a trade and returns it with status open", () => {
    const service = createTradeService(db);

    const trade = service.openTrade({
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      size: 2,
      entryPrice: 75.5,
      stopLoss: 73.0,
      takeProfit: 80.0,
      mode: "MODE_1",
    });

    expect(trade.id).toBeDefined();
    expect(trade.status).toBe("open");
    expect(trade.pnl).toBeNull();
    expect(trade.venue).toBe("IG");
    expect(trade.instrument).toBe("Crude Oil");
    expect(trade.direction).toBe("LONG");
    expect(trade.size).toBe(2);
    expect(trade.entryPrice).toBe(75.5);
    expect(trade.executionType).toBe("MANUAL");
  });

  test("closes a long trade and calculates positive P&L", () => {
    const service = createTradeService(db);

    const opened = service.openTrade({
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      size: 2,
      entryPrice: 75.0,
      mode: "MODE_1",
    });

    const closed = service.closeTrade(opened.id, 80.0);

    expect(closed.status).toBe("closed");
    expect(closed.exitPrice).toBe(80.0);
    // P&L for LONG: (exit - entry) * size = (80 - 75) * 2 = 10
    expect(closed.pnl).toBe(10);
    expect(closed.closedAt).toBeDefined();
  });

  test("closes a short trade and calculates positive P&L", () => {
    const service = createTradeService(db);

    const opened = service.openTrade({
      venue: "IG",
      instrument: "S&P 500",
      direction: "SHORT",
      size: 3,
      entryPrice: 5000,
      mode: "MODE_3",
    });

    const closed = service.closeTrade(opened.id, 4900);

    // P&L for SHORT: (entry - exit) * size = (5000 - 4900) * 3 = 300
    expect(closed.pnl).toBe(300);
    expect(closed.status).toBe("closed");
  });

  test("lists only open trades", () => {
    const service = createTradeService(db);

    const t1 = service.openTrade({
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      size: 1,
      entryPrice: 75,
      mode: "MODE_1",
    });
    service.openTrade({
      venue: "IG",
      instrument: "Gold",
      direction: "LONG",
      size: 1,
      entryPrice: 2000,
      mode: "MODE_3",
    });

    // Close the first one
    service.closeTrade(t1.id, 80);

    const open = service.listOpenTrades();
    expect(open).toHaveLength(1);
    expect(open[0].instrument).toBe("Gold");
  });

  test("returns P&L summary across trades", () => {
    const service = createTradeService(db);

    // Open and close two trades with different outcomes
    const t1 = service.openTrade({
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      size: 2,
      entryPrice: 75,
      mode: "MODE_1",
    });
    service.closeTrade(t1.id, 80); // +10

    const t2 = service.openTrade({
      venue: "IG",
      instrument: "Gold",
      direction: "SHORT",
      size: 1,
      entryPrice: 2000,
      mode: "MODE_3",
    });
    service.closeTrade(t2.id, 2050); // -50

    // One still open
    service.openTrade({
      venue: "BETFAIR",
      instrument: "Election Market",
      direction: "LONG",
      size: 5,
      entryPrice: 0.6,
      mode: "MODE_1",
    });

    const summary = service.getPnLSummary();

    expect(summary.realizedPnL).toBe(-40); // 10 + (-50)
    expect(summary.closedTradeCount).toBe(2);
    expect(summary.openTradeCount).toBe(1);
    expect(summary.winCount).toBe(1);
    expect(summary.lossCount).toBe(1);
  });

  test("throws when closing an already-closed trade", () => {
    const service = createTradeService(db);

    const trade = service.openTrade({
      venue: "IG",
      instrument: "Gold",
      direction: "LONG",
      size: 1,
      entryPrice: 2000,
      mode: "MODE_1",
    });

    service.closeTrade(trade.id, 2100);

    expect(() => service.closeTrade(trade.id, 2200)).toThrow("already closed");
  });

  test("throws when closing a nonexistent trade", () => {
    const service = createTradeService(db);

    expect(() => service.closeTrade("nonexistent-id", 100)).toThrow("not found");
  });
});
