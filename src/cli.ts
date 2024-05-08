import {
  detectSandwichCandidates,
  filterHighValueVictims,
  type MempoolSnapshot,
  type PendingSwap,
} from "./detector/pattern_matcher.js";
import { rankPatternsByRisk, scoreSwap } from "./scoring/risk_scorer.js";

const SAMPLE_SWAPS: PendingSwap[] = [
  {
    id: "tx_victim_1",
    signer: "Victim1111111111111111111111111111111111",
    poolId: "raydium_sol_usdc",
    tokenIn: "SOL",
    tokenOut: "USDC",
    amountIn: 500,
    minAmountOut: 72000,
    direction: "sell",
    slippageBps: 300,
    timestamp: Date.now(),
    priorityFee: 5000,
  },
  {
    id: "tx_frontrun_1",
    signer: "Attacker1111111111111111111111111111111",
    poolId: "raydium_sol_usdc",
    tokenIn: "USDC",
    tokenOut: "SOL",
    amountIn: 75000,
    minAmountOut: 480,
    direction: "buy",
    slippageBps: 50,
    timestamp: Date.now() - 100,
    priorityFee: 50000,
  },
  {
    id: "tx_backrun_1",
    signer: "Attacker1111111111111111111111111111111",
    poolId: "raydium_sol_usdc",
    tokenIn: "SOL",
    tokenOut: "USDC",
    amountIn: 490,
    minAmountOut: 73000,
    direction: "sell",
    slippageBps: 50,
    timestamp: Date.now() + 100,
    priorityFee: 45000,
  },
];

function main(): void {
  const snapshot: MempoolSnapshot = {
    slot: 250000000,
    swaps: SAMPLE_SWAPS,
    capturedAt: Date.now(),
  };

  console.log("Sandwich Attack Detector\n");
  console.log(`Analyzing ${snapshot.swaps.length} pending swaps...\n`);

  for (const swap of snapshot.swaps) {
    const risk = scoreSwap(swap, snapshot.swaps.length);
    console.log(`Swap ${swap.id}: risk=${risk.overall} (${risk.label})`);
  }

  console.log();

  const patterns = detectSandwichCandidates(snapshot);
  const filtered = filterHighValueVictims(patterns, 100);
  const ranked = rankPatternsByRisk(filtered);

  console.log(`Found ${patterns.length} sandwich pattern(s)\n`);

  for (const { pattern, risk } of ranked) {
    console.log(`Pattern on pool ${pattern.poolId}:`);
    console.log(`  Victim: ${pattern.victim.id} (${pattern.victim.amountIn} ${pattern.victim.tokenIn})`);
    console.log(`  Attacker: ${pattern.frontrun.signer.slice(0, 8)}...`);
    console.log(`  Est. victim loss: ${pattern.estimatedVictimLoss.toFixed(2)}`);
    console.log(`  Est. attacker profit: ${pattern.estimatedAttackerProfit.toFixed(4)}`);
    console.log(`  Risk score: ${risk.overall} (${risk.label})`);
    console.log();
  }
}

main();
