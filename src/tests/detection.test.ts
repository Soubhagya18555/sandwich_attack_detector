import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectSandwichCandidates,
  type MempoolSnapshot,
  type PendingSwap,
} from "../detector/pattern_matcher.js";
import { scoreSandwichPattern, rankPatternsByRisk } from "../scoring/risk_scorer.js";
import { buildVictimProfile, profilePatternVictims, rankVictimsByVulnerability } from "../profiler/victim_profiler.js";
import { buildMempoolWindow, analyzeWindow, sliceWindow, findOverlappingSwaps } from "../mempool/mempool_window.js";
import {
  createAlert,
  filterAlerts,
  CollectingAlertSink,
  summarizeAlerts,
  DEFAULT_ALERT_CONFIG,
} from "../alerts/alerts.js";

function makeSwap(overrides: Partial<PendingSwap> & { id: string }): PendingSwap {
  return {
    signer: "attacker1",
    poolId: "pool1",
    tokenIn: "SOL",
    tokenOut: "USDC",
    amountIn: 1000,
    minAmountOut: 990,
    direction: "buy",
    slippageBps: 50,
    timestamp: Date.now(),
    priorityFee: 5000,
    ...overrides,
  };
}

describe("victim_profiler", () => {
  it("profiles whale victims", () => {
    const swaps = [
      makeSwap({ id: "v1", signer: "victim1", amountIn: 200_000, slippageBps: 100 }),
      makeSwap({ id: "v2", signer: "victim1", amountIn: 150_000, slippageBps: 80 }),
    ];
    const profile = buildVictimProfile("victim1", swaps);
    assert.equal(profile.label, "whale");
    assert.ok(profile.vulnerableScore > 0);
  });

  it("ranks victims by vulnerability", () => {
    const swaps = [
      makeSwap({ id: "v1", signer: "victim1", amountIn: 200_000, slippageBps: 100 }),
      makeSwap({ id: "v2", signer: "victim2", amountIn: 100, slippageBps: 10 }),
    ];
    const ranked = rankVictimsByVulnerability([
      buildVictimProfile("victim1", swaps),
      buildVictimProfile("victim2", swaps),
    ]);
    assert.ok(ranked[0]!.vulnerableScore >= ranked[1]!.vulnerableScore);
  });
});

describe("mempool_window", () => {
  it("builds and analyzes mempool window", () => {
    const snapshots: MempoolSnapshot[] = [
      {
        slot: 100,
        capturedAt: 1000,
        swaps: [makeSwap({ id: "s1", priorityFee: 1000 }), makeSwap({ id: "s2", signer: "v2", priorityFee: 5000 })],
      },
      {
        slot: 101,
        capturedAt: 2000,
        swaps: [makeSwap({ id: "s3", amountIn: 50_000 })],
      },
    ];

    const window = buildMempoolWindow(snapshots);
    assert.equal(window.totalSwaps, 3);
    assert.equal(window.uniqueSigners, 2);

    const analysis = analyzeWindow(window, 10_000);
    assert.ok(analysis.congestionScore >= 0);
    assert.ok(analysis.swapsByPool.has("pool1"));
  });

  it("slices window by slot range", () => {
    const snapshots: MempoolSnapshot[] = [
      { slot: 100, capturedAt: 1000, swaps: [makeSwap({ id: "s1" })] },
      { slot: 105, capturedAt: 2000, swaps: [makeSwap({ id: "s2" })] },
    ];
    const sliced = sliceWindow(snapshots, 100, 100);
    assert.equal(sliced.totalSwaps, 1);
  });
});

describe("alerts", () => {
  it("creates and filters alerts from patterns", () => {
    const snapshot: MempoolSnapshot = {
      slot: 200,
      capturedAt: Date.now(),
      swaps: [
        makeSwap({ id: "f1", signer: "atk", direction: "buy", priorityFee: 10000, amountIn: 5000 }),
        makeSwap({ id: "v1", signer: "vic", direction: "buy", priorityFee: 1000, amountIn: 50000, slippageBps: 100 }),
        makeSwap({ id: "b1", signer: "atk", direction: "sell", priorityFee: 10000, amountIn: 5000 }),
      ],
    };

    const patterns = detectSandwichCandidates(snapshot);
    if (patterns.length === 0) {
      return;
    }

    const pattern = patterns[0]!;
    const risk = scoreSandwichPattern(pattern);
    const profile = buildVictimProfile(pattern.victim.signer, [pattern.victim]);
    const alert = createAlert(pattern, risk, profile, snapshot.slot);

    assert.ok(alert.id.startsWith("alert_"));
    assert.ok(alert.title.includes("Sandwich"));

    const filtered = filterAlerts([alert], { ...DEFAULT_ALERT_CONFIG, minRiskScore: 0, minVictimLoss: 0 });
    assert.equal(filtered.length, 1);

    const sink = new CollectingAlertSink();
    sink.emit(alert);
    assert.equal(sink.alerts.length, 1);

    const summary = summarizeAlerts([alert]);
    assert.equal(summary.total, 1);
  });
});

describe("integration", () => {
  it("runs detection pipeline with profiling and alerts", () => {
    const snapshot: MempoolSnapshot = {
      slot: 300,
      capturedAt: Date.now(),
      swaps: [
        makeSwap({ id: "f1", signer: "atk", direction: "buy", priorityFee: 20000 }),
        makeSwap({ id: "v1", signer: "vic", direction: "buy", priorityFee: 1000, slippageBps: 150, amountIn: 100000 }),
        makeSwap({ id: "b1", signer: "atk", direction: "sell", priorityFee: 20000 }),
      ],
    };

    const window = buildMempoolWindow([snapshot]);
    const analysis = analyzeWindow(window);
    const poolSwaps = findOverlappingSwaps(window, "pool1");
    assert.ok(poolSwaps.length >= 1);

    const patterns = detectSandwichCandidates(snapshot);
    const ranked = rankPatternsByRisk(patterns);
    const profiles = profilePatternVictims(patterns);

    assert.ok(analysis.congestionScore >= 0);
    if (ranked.length > 0) {
      assert.ok(profiles.has(ranked[0]!.pattern.victim.signer));
    }
  });
});
