import { randomUUID } from "node:crypto";
import type { SentinelDatabase } from "@sentinel/shared";

export interface OpenTradeParams {
  signalId?: string;
  venue: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  mode: string;
  auditNotes?: string;
}

export function createTradeService(db: SentinelDatabase) {
  return {
    openTrade(params: OpenTradeParams) {
      const id = randomUUID();
      const timestamp = new Date().toISOString();

      db.insertTrade({
        id,
        timestamp,
        signalId: params.signalId ?? null,
        venue: params.venue,
        instrument: params.instrument,
        direction: params.direction,
        size: params.size,
        entryPrice: params.entryPrice,
        stopLoss: params.stopLoss ?? null,
        takeProfit: params.takeProfit ?? null,
        pnl: null,
        status: "open",
        mode: params.mode,
        executionType: "MANUAL",
        auditNotes: params.auditNotes ?? null,
        closedAt: null,
      });

      return db.getTrade(id)!;
    },

    closeTrade(id: string, exitPrice: number) {
      const trade = db.getTrade(id);
      if (!trade) throw new Error(`Trade ${id} not found`);
      if (trade.status !== "open") throw new Error(`Trade ${id} is already ${trade.status}`);

      const pnl =
        trade.direction === "LONG"
          ? (exitPrice - trade.entryPrice!) * trade.size
          : (trade.entryPrice! - exitPrice) * trade.size;

      db.updateTrade(id, {
        exitPrice,
        pnl,
        status: "closed",
        closedAt: new Date().toISOString(),
      });

      return db.getTrade(id)!;
    },

    listOpenTrades() {
      return db.listTradesByStatus("open");
    },

    getPnLSummary() {
      const closed = db.listTradesByStatus("closed");
      const open = db.listTradesByStatus("open");

      let realizedPnL = 0;
      let winCount = 0;
      let lossCount = 0;

      for (const trade of closed) {
        const pnl = trade.pnl ?? 0;
        realizedPnL += pnl;
        if (pnl > 0) winCount++;
        else if (pnl < 0) lossCount++;
      }

      return {
        realizedPnL,
        closedTradeCount: closed.length,
        openTradeCount: open.length,
        winCount,
        lossCount,
      };
    },
  };
}

export type TradeService = ReturnType<typeof createTradeService>;
