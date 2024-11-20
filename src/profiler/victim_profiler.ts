import type { PendingSwap, SandwichPattern } from "../detector/pattern_matcher.js";

export type VictimProfileLabel = "retail" | "whale" | "bot" | "unknown";

export interface VictimProfile {
  address: string;
  label: VictimProfileLabel;
  avgSwapSize: number;
  totalExposure: number;
  avgSlippageBps: number;
  swapCount: number;
  vulnerableScore: number;
  repeatVictim: boolean;
  preferredPools: string[];
}

export interface VictimProfilerConfig {
  whaleThreshold: number;
  botMinSwaps: number;
  botMaxIntervalSec: number;
}

export const DEFAULT_VICTIM_CONFIG: VictimProfilerConfig = {
  whaleThreshold: 100_000,
  botMinSwaps: 5,
  botMaxIntervalSec: 60,
};

export function buildVictimProfile(
  address: string,
  swaps: PendingSwap[],
  config: VictimProfilerConfig = DEFAULT_VICTIM_CONFIG,
): VictimProfile {
  const victimSwaps = swaps.filter((s) => s.signer === address);
  const swapCount = victimSwaps.length;

  if (swapCount === 0) {
    return {
      address,
      label: "unknown",
      avgSwapSize: 0,
      totalExposure: 0,
      avgSlippageBps: 0,
      swapCount: 0,
      vulnerableScore: 0,
      repeatVictim: false,
      preferredPools: [],
    };
  }

  const totalExposure = victimSwaps.reduce((sum, s) => sum + s.amountIn, 0);
  const avgSwapSize = totalExposure / swapCount;
  const avgSlippageBps = victimSwaps.reduce((sum, s) => sum + s.slippageBps, 0) / swapCount;

  const poolCounts = new Map<string, number>();
  for (const s of victimSwaps) {
    poolCounts.set(s.poolId, (poolCounts.get(s.poolId) ?? 0) + 1);
  }
  const preferredPools = Array.from(poolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pool]) => pool);

  let label: VictimProfileLabel = "retail";
  if (avgSwapSize >= config.whaleThreshold) {
    label = "whale";
  } else if (swapCount >= config.botMinSwaps) {
    const timestamps = victimSwaps.map((s) => s.timestamp).sort((a, b) => a - b);
    const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]!);
    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : Infinity;
    if (avgInterval <= config.botMaxIntervalSec) {
      label = "bot";
    }
  }

  const slippageFactor = Math.min(100, avgSlippageBps / 2);
  const sizeFactor = Math.min(100, Math.log10(avgSwapSize + 1) * 20);
  const repeatFactor = swapCount > 1 ? 20 : 0;
  const vulnerableScore = Math.round(slippageFactor * 0.4 + sizeFactor * 0.4 + repeatFactor);

  return {
    address,
    label,
    avgSwapSize,
    totalExposure,
    avgSlippageBps: Math.round(avgSlippageBps),
    swapCount,
    vulnerableScore: Math.min(100, vulnerableScore),
    repeatVictim: swapCount > 1,
    preferredPools,
  };
}

export function profilePatternVictims(patterns: SandwichPattern[]): Map<string, VictimProfile> {
  const allSwaps = patterns.map((p) => p.victim);
  const addresses = [...new Set(allSwaps.map((s) => s.signer))];
  const profiles = new Map<string, VictimProfile>();

  for (const addr of addresses) {
    profiles.set(addr, buildVictimProfile(addr, allSwaps));
  }

  return profiles;
}

export function rankVictimsByVulnerability(profiles: VictimProfile[]): VictimProfile[] {
  return [...profiles].sort((a, b) => b.vulnerableScore - a.vulnerableScore);
}

export function estimateVictimLoss(profile: VictimProfile, pattern: SandwichPattern): number {
  const baseLoss = pattern.estimatedVictimLoss;
  const multiplier = profile.label === "whale" ? 1.5 : profile.label === "bot" ? 0.5 : 1.0;
  return baseLoss * multiplier * (1 + profile.vulnerableScore / 200);
}
