import type { RiskGate } from "../risk/circuit-breaker.ts";

export type TradeMode = "trend_following" | "event_trading";

export interface TradeOrder {
  instrument: string;
  direction: string;
  size: number;
  riskAmount: number;
  stopLoss: number;
  takeProfit: number;
}

export interface ExecutionResult {
  status: "executed" | "awaiting_approval" | "rejected";
  dealId?: string;
  reason?: string;
}

export interface ExecuteFn {
  (order: { instrument: string; direction: string; size: number }): {
    success: boolean;
    dealId?: string;
  };
}

export interface ExecutorConfig {
  riskGate: RiskGate;
  execute: ExecuteFn;
  openPositionCount?: () => number;
}

export interface TradeExecutor {
  evaluateAndExecute(order: TradeOrder, mode: TradeMode): ExecutionResult;
}

export function createExecutor(config: ExecutorConfig): TradeExecutor {
  const getOpenCount = config.openPositionCount ?? (() => 0);

  return {
    evaluateAndExecute(order: TradeOrder, mode: TradeMode): ExecutionResult {
      const decision = config.riskGate.checkTrade({
        riskAmount: order.riskAmount,
        openPositionCount: getOpenCount(),
      });

      if (!decision.allowed) {
        return { status: "rejected", reason: decision.reason };
      }

      const sizeMultiplier = decision.sizeMultiplier ?? 1;
      const adjustedSize = order.size * sizeMultiplier;

      if (mode === "event_trading") {
        return { status: "awaiting_approval" };
      }

      const result = config.execute({
        instrument: order.instrument,
        direction: order.direction,
        size: adjustedSize,
      });

      if (result.success) {
        return { status: "executed", dealId: result.dealId };
      }

      return { status: "rejected", reason: "execution_failed" };
    },
  };
}
