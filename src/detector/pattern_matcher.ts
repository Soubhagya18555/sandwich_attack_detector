export type SwapDirection = "buy" | "sell";

export interface PendingSwap {
  id: string;
  signer: string;
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  minAmountOut: number;
  direction: SwapDirection;
  slippageBps: number;
  timestamp: number;
  priorityFee: number;
}

export interface MempoolSnapshot {
  slot: number;
  swaps: PendingSwap[];
  capturedAt: number;
}

export interface SandwichPattern {
  frontrun: PendingSwap;
  victim: PendingSwap;
  backrun: PendingSwap;
  poolId: string;
  estimatedVictimLoss: number;
  estimatedAttackerProfit: number;
}

export function groupSwapsByPool(swaps: PendingSwap[]): Map<string, PendingSwap[]> {
  const groups = new Map<string, PendingSwap[]>();
  for (const swap of swaps) {
    const list = groups.get(swap.poolId) ?? [];
    list.push(swap);
    groups.set(swap.poolId, list);
  }
  return groups;
}

export function isOppositeDirection(a: PendingSwap, b: PendingSwap): boolean {
  return a.direction !== b.direction && a.tokenIn === b.tokenOut && a.tokenOut === b.tokenIn;
}

export function detectSandwichCandidates(snapshot: MempoolSnapshot): SandwichPattern[] {
  const patterns: SandwichPattern[] = [];
  const byPool = groupSwapsByPool(snapshot.swaps);

  for (const [poolId, poolSwaps] of byPool) {
    const sorted = [...poolSwaps].sort((a, b) => b.priorityFee - a.priorityFee);

    for (let i = 0; i < sorted.length; i++) {
      const victim = sorted[i];
      if (victim.slippageBps < 10) continue;

      for (let j = 0; j < sorted.length; j++) {
        if (i === j) continue;
        const frontrun = sorted[j];
        if (frontrun.priorityFee <= victim.priorityFee) continue;
        if (!isOppositeDirection(frontrun, victim)) continue;
        if (frontrun.direction !== victim.direction) continue;

        for (let k = 0; k < sorted.length; k++) {
          if (k === i || k === j) continue;
          const backrun = sorted[k];
          if (backrun.priorityFee <= victim.priorityFee) continue;
          if (!isOppositeDirection(backrun, victim)) continue;
          if (backrun.direction === victim.direction) continue;
          if (backrun.signer !== frontrun.signer) continue;

          const victimLoss = estimateSlippageLoss(victim);
          const attackerProfit = estimateAttackerProfit(frontrun, victim, backrun);

          patterns.push({
            frontrun,
            victim,
            backrun,
            poolId,
            estimatedVictimLoss: victimLoss,
            estimatedAttackerProfit: attackerProfit,
          });
        }
      }
    }
  }

  return patterns;
}

function estimateSlippageLoss(victim: PendingSwap): number {
  const expectedOut = victim.amountIn * (1 - victim.slippageBps / 20000);
  const actualOut = victim.minAmountOut;
  return Math.max(0, expectedOut - actualOut);
}

function estimateAttackerProfit(
  frontrun: PendingSwap,
  victim: PendingSwap,
  backrun: PendingSwap
): number {
  const priceMove = victim.amountIn / (frontrun.amountIn + 1);
  const backrunGain = backrun.amountIn * priceMove * 0.01;
  const frontrunCost = frontrun.amountIn * 0.003;
  return Math.max(0, backrunGain - frontrunCost);
}

export function filterHighValueVictims(
  patterns: SandwichPattern[],
  minVictimAmount: number
): SandwichPattern[] {
  return patterns.filter((p) => p.victim.amountIn >= minVictimAmount);
}
