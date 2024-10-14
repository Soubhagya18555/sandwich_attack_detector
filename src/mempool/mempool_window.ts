import type { MempoolSnapshot, PendingSwap } from "../detector/pattern_matcher.js";

export interface MempoolWindow {
  slotStart: number;
  slotEnd: number;
  snapshots: MempoolSnapshot[];
  totalSwaps: number;
  uniqueSigners: number;
  uniquePools: number;
  avgPriorityFee: number;
}

export interface WindowAnalysis {
  window: MempoolWindow;
  swapsByPool: Map<string, PendingSwap[]>;
  highFeeSwaps: PendingSwap[];
  largeSwaps: PendingSwap[];
  congestionScore: number;
}

export function buildMempoolWindow(snapshots: MempoolSnapshot[]): MempoolWindow {
  if (snapshots.length === 0) {
    return {
      slotStart: 0,
      slotEnd: 0,
      snapshots: [],
      totalSwaps: 0,
      uniqueSigners: 0,
      uniquePools: 0,
      avgPriorityFee: 0,
    };
  }

  const slots = snapshots.map((s) => s.slot);
  const allSwaps = snapshots.flatMap((s) => s.swaps);
  const signers = new Set(allSwaps.map((s) => s.signer));
  const pools = new Set(allSwaps.map((s) => s.poolId));
  const avgFee =
    allSwaps.length > 0
      ? allSwaps.reduce((sum, s) => sum + s.priorityFee, 0) / allSwaps.length
      : 0;

  return {
    slotStart: Math.min(...slots),
    slotEnd: Math.max(...slots),
    snapshots,
    totalSwaps: allSwaps.length,
    uniqueSigners: signers.size,
    uniquePools: pools.size,
    avgPriorityFee: Math.round(avgFee),
  };
}

export function sliceWindow(snapshots: MempoolSnapshot[], slotStart: number, slotEnd: number): MempoolWindow {
  const filtered = snapshots.filter((s) => s.slot >= slotStart && s.slot <= slotEnd);
  return buildMempoolWindow(filtered);
}

export function analyzeWindow(window: MempoolWindow, largeSwapThreshold = 10_000): WindowAnalysis {
  const swapsByPool = new Map<string, PendingSwap[]>();
  const allSwaps = window.snapshots.flatMap((s) => s.swaps);

  for (const swap of allSwaps) {
    const list = swapsByPool.get(swap.poolId) ?? [];
    list.push(swap);
    swapsByPool.set(swap.poolId, list);
  }

  const avgFee = window.avgPriorityFee || 1;
  const highFeeSwaps = allSwaps.filter((s) => s.priorityFee > avgFee * 2);
  const largeSwaps = allSwaps.filter((s) => s.amountIn >= largeSwapThreshold);

  const poolDensity = window.uniquePools > 0 ? window.totalSwaps / window.uniquePools : 0;
  const signerDensity = window.uniqueSigners > 0 ? window.totalSwaps / window.uniqueSigners : 0;
  const congestionScore = Math.min(100, Math.round(poolDensity * 5 + signerDensity * 10 + highFeeSwaps.length * 3));

  return {
    window,
    swapsByPool,
    highFeeSwaps,
    largeSwaps,
    congestionScore,
  };
}

export function findOverlappingSwaps(window: MempoolWindow, poolId: string): PendingSwap[] {
  const swaps: PendingSwap[] = [];
  for (const snapshot of window.snapshots) {
    swaps.push(...snapshot.swaps.filter((s) => s.poolId === poolId));
  }
  return swaps.sort((a, b) => b.priorityFee - a.priorityFee);
}

export function windowDurationMs(window: MempoolWindow): number {
  if (window.snapshots.length < 2) {
    return 0;
  }
  const times = window.snapshots.map((s) => s.capturedAt).sort((a, b) => a - b);
  return times[times.length - 1]! - times[0]!;
}

export function mergeSnapshots(a: MempoolSnapshot, b: MempoolSnapshot): MempoolSnapshot {
  const swapIds = new Set(a.swaps.map((s) => s.id));
  const mergedSwaps = [...a.swaps];
  for (const swap of b.swaps) {
    if (!swapIds.has(swap.id)) {
      mergedSwaps.push(swap);
    }
  }
  return {
    slot: Math.max(a.slot, b.slot),
    swaps: mergedSwaps,
    capturedAt: Math.max(a.capturedAt, b.capturedAt),
  };
}
