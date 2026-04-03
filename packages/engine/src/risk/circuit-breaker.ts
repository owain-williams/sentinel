export interface RiskGateConfig {
  capitalBase: number;
  maxPositions?: number;
  maxRiskPerTradePct?: number;
  maxDailyRiskPct?: number;
  dailyLossHaltPct?: number;
  consecutiveLossLimit?: number;
}

export interface TradeCheck {
  riskAmount: number;
  openPositionCount: number;
}

export interface RiskDecision {
  allowed: boolean;
  reason?: string;
  sizeMultiplier?: number;
}

export interface RiskGate {
  checkTrade(params: TradeCheck): RiskDecision;
  recordOutcome(pnl: number): void;
  isHalted(): boolean;
  killSwitch(): void;
  resume(): void;
}

const MAX_POSITIONS = 5;
const MAX_RISK_PER_TRADE_PCT = 0.03;
const MAX_DAILY_RISK_PCT = 0.1;
const DAILY_LOSS_HALT_PCT = 0.05;
const CONSECUTIVE_LOSS_LIMIT = 5;

export function createRiskGate(config: RiskGateConfig): RiskGate {
  const maxPositions = config.maxPositions ?? MAX_POSITIONS;
  const maxRiskPerTrade =
    config.capitalBase * (config.maxRiskPerTradePct ?? MAX_RISK_PER_TRADE_PCT);
  const maxDailyRisk = config.capitalBase * (config.maxDailyRiskPct ?? MAX_DAILY_RISK_PCT);
  const dailyLossHalt = config.capitalBase * (config.dailyLossHaltPct ?? DAILY_LOSS_HALT_PCT);
  const consecutiveLossLimit = config.consecutiveLossLimit ?? CONSECUTIVE_LOSS_LIMIT;

  let halted = false;
  let dailyPnL = 0;
  let dailyRiskUsed = 0;
  let consecutiveLosses = 0;

  return {
    checkTrade(params: TradeCheck): RiskDecision {
      if (halted) {
        return { allowed: false, reason: "trading_halted" };
      }

      if (params.openPositionCount >= maxPositions) {
        return { allowed: false, reason: "max_positions_reached" };
      }

      if (params.riskAmount > maxRiskPerTrade) {
        return { allowed: false, reason: "exceeds_per_trade_risk_limit" };
      }

      if (dailyRiskUsed + params.riskAmount > maxDailyRisk) {
        return { allowed: false, reason: "exceeds_daily_risk_limit" };
      }

      const sizeMultiplier = consecutiveLosses >= consecutiveLossLimit ? 0.5 : 1;

      dailyRiskUsed += params.riskAmount;
      return { allowed: true, sizeMultiplier };
    },

    recordOutcome(pnl: number): void {
      dailyPnL += pnl;
      if (pnl < 0) {
        consecutiveLosses++;
      } else {
        consecutiveLosses = 0;
      }
      if (dailyPnL <= -dailyLossHalt) {
        halted = true;
      }
    },

    isHalted(): boolean {
      return halted;
    },

    killSwitch(): void {
      halted = true;
    },

    resume(): void {
      halted = false;
    },
  };
}
