# Detection Methodology

## Sandwich Attack Model

A sandwich attack on a DEX swap consists of three transactions in one block:

1. **Frontrun**: attacker buys token before victim, moving price unfavorably
2. **Victim**: user's swap executes at worse price
3. **Backrun**: attacker sells token back, capturing the spread

## Detection Heuristics

The detector analyzes a mempool snapshot and looks for:

- Same pool involvement across three swaps
- Frontrun and backrun from same signer
- Opposite swap direction relative to victim
- Higher priority fees on attacker txs vs victim
- Victim slippage tolerance above minimum threshold

## Pattern Matching

```
for each pool:
  sort swaps by priority fee
  for each potential victim (high slippage):
    find frontrun (same direction, higher fee, opposite tokens)
    find backrun (opposite direction, same attacker, higher fee)
    estimate victim loss and attacker profit
```

## Limitations

- Simulated mempool, not live Jito/ShredStream data
- Profit estimates are approximate
- Does not account for private order flow or bundle auctions

## Mitigation Recommendations

- Use tight slippage settings
- Route through MEV protected RPC endpoints
- Split large orders across multiple transactions
- Use limit orders instead of market swaps where available
