export { type NormalisedEvent } from "@sentinel/shared";
export { createTradeService, type TradeService, type OpenTradeParams } from "./trades/service.ts";
export { mapSignalToTrades, type SuggestedTrade } from "./trades/mapper.ts";
export {
  classifySignal,
  AlertPriority,
  type AlertRouting,
  type AlertChannel,
} from "./alerts/router.ts";
export { AlertWorker, type AlertWorkerConfig } from "./alerts/worker.ts";
export { sendTradeConfirmation } from "./alerts/telegram-trade.ts";
export {
  IGClient,
  type IGClientConfig,
  type IGSession,
  type IGAccount,
  type IGPosition,
  type CreatePositionParams,
  type DealReference,
} from "./execution/ig-client.ts";
export {
  prepareOrder,
  type PreparedOrder,
  type OrderSizingParams,
} from "./execution/order-preparer.ts";
export {
  BetfairClient,
  type BetfairConfig,
  type BetfairSession,
  type MarketCatalogue,
  type MarketBook,
  type PlaceInstruction,
  type PlaceReport,
  type AccountFunds,
} from "./execution/betfair-client.ts";
export {
  computeIndicators,
  evaluateTrend,
  evaluateExits,
  type PriceBar,
  type TrendIndicators,
  type TrendSignal,
  type OpenPosition,
  type ExitAction,
} from "./strategy/trend.ts";
export {
  createRiskGate,
  type RiskGate,
  type RiskGateConfig,
  type TradeCheck,
  type RiskDecision,
} from "./risk/circuit-breaker.ts";
export {
  createExecutor,
  type TradeExecutor,
  type ExecutorConfig,
  type TradeOrder,
  type ExecutionResult,
  type TradeMode,
} from "./automation/executor.ts";
