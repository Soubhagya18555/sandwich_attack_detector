import type { PendingSwap, SandwichPattern } from "../detector/pattern_matcher.js";

export interface RiskScore {
  overall: number;
  slippageRisk: number;
  sizeRisk: number;
  mempoolRisk: number;
  priorityFeeRisk: number;
  label: "low" | "medium" | "high" | "critical";
}

export interface ScoringConfig {
  slippageWeight: number;
  sizeWeight: number;
  mempoolWeight: number;
  priorityWeight: number;
  criticalThreshold: number;
  highThreshold: number;
  mediumThreshold: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  slippageWeight: 0.30,
  sizeWeight: 0.25,
  mempoolWeight: 0.25,
  priorityWeight: 0.20,
  criticalThreshold: 80,
  highThreshold: 60,
  mediumThreshold: 35,
};

export function scoreSwap(swap: PendingSwap, mempoolDepth: number): RiskScore {
  const slippageRisk = Math.min(100, swap.slippageBps / 3);
  const sizeRisk = Math.min(100, Math.log10(swap.amountIn + 1) * 15);
  const mempoolRisk = Math.min(100, mempoolDepth * 10);
  const priorityFeeRisk = Math.min(100, swap.priorityFee / 1000);

  const overall = Math.round(
    slippageRisk * 0.30 + sizeRisk * 0.25 + mempoolRisk * 0.25 + priorityFeeRisk * 0.20
  );

  return {
    overall,
    slippageRisk: Math.round(slippageRisk),
    sizeRisk: Math.round(sizeRisk),
    mempoolRisk: Math.round(mempoolRisk),
    priorityFeeRisk: Math.round(priorityFeeRisk),
    label: classifyRisk(overall),
  };
}

export function scoreSandwichPattern(
  pattern: SandwichPattern,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): RiskScore {
  const victim = pattern.victim;

  const slippageRisk = Math.min(100, victim.slippageBps / 2);
  const sizeRisk = Math.min(100, Math.log10(victim.amountIn + 1) * 20);
  const mempoolRisk = Math.min(100, pattern.estimatedAttackerProfit * 10);
  const priorityFeeRisk = Math.min(
    100,
    (pattern.frontrun.priorityFee + pattern.backrun.priorityFee) / 500
  );

  const overall = Math.round(
    slippageRisk * config.slippageWeight +
      sizeRisk * config.sizeWeight +
      mempoolRisk * config.mempoolWeight +
      priorityFeeRisk * config.priorityWeight
  );

  return {
    overall,
    slippageRisk: Math.round(slippageRisk),
    sizeRisk: Math.round(sizeRisk),
    mempoolRisk: Math.round(mempoolRisk),
    priorityFeeRisk: Math.round(priorityFeeRisk),
    label: classifyRisk(overall, config),
  };
}

function classifyRisk(
  score: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): RiskScore["label"] {
  if (score >= config.criticalThreshold) return "critical";
  if (score >= config.highThreshold) return "high";
  if (score >= config.mediumThreshold) return "medium";
  return "low";
}

export function rankPatternsByRisk(
  patterns: SandwichPattern[]
): Array<{ pattern: SandwichPattern; risk: RiskScore }> {
  return patterns
    .map((pattern) => ({ pattern, risk: scoreSandwichPattern(pattern) }))
    .sort((a, b) => b.risk.overall - a.risk.overall);
}
