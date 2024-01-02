# sandwich_attack_detector

Detect sandwichable transactions from mempool like simulation patterns on Solana DEX swaps. Includes risk scoring for victim transactions and identified attack patterns.

**Author:** Soubhagya  
**License:** MIT

## Features

- Mempool snapshot simulation with pending swap modeling
- Sandwich pattern detection (frontrun → victim → backrun)
- Multi factor risk scoring (slippage, size, priority fees)
- Ranked output of attack candidates

## Install

```bash
npm install
npm run build
```

## Usage

```bash
npm run start
```

Runs analysis on sample mempool data and prints risk scores.

## Library

```typescript
import {
  detectSandwichCandidates,
  rankPatternsByRisk,
  scoreSwap,
} from "sandwich_attack_detector";

const snapshot = { slot: 250000000, swaps: pendingSwaps, capturedAt: Date.now() };
const patterns = detectSandwichCandidates(snapshot);
const ranked = rankPatternsByRisk(patterns);
```

## Risk Scoring

| Factor | Weight | Description |
|--------|--------|-------------|
| Slippage | 30% | Higher tolerance = easier to exploit |
| Size | 25% | Larger swaps move price more |
| Mempool | 25% | Competing txs increase sandwich opportunity |
| Priority fee | 20% | Higher fees indicate MEV competition |

## Risk Labels

| Score | Label |
|-------|-------|
| 80+ | critical |
| 60-79 | high |
| 35-59 | medium |
| 0-34 | low |

## Documentation

- [docs/DETECTION.md](docs/DETECTION.md)
