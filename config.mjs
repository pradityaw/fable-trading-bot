// Chain + protocol configuration for the trading experiment.
// Chain: Base mainnet — chosen for sub-cent gas so a $100 bankroll isn't eaten by fees.
//
// !! Contract addresses below are from prior knowledge. Before the FIRST live trade,
// verify each one on-chain (bytecode exists, token symbol/decimals match) via verify.mjs.

export const CHAIN = {
  id: 8453,
  name: "base",
  // Try in order; all must be added to the environment's network allowlist.
  rpcUrls: [
    "https://mainnet.base.org",
    "https://base.publicnode.com",
    "https://base.llamarpc.com",
  ],
};

export const TOKENS = {
  WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18, symbol: "WETH" },
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" }, // native USDC on Base
};

export const UNISWAP_V3 = {
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
  quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  feeTiers: [500, 3000, 10000],
};

// External data APIs (must be on the network allowlist).
export const APIS = {
  dexscreener: "https://api.dexscreener.com", // pair discovery, prices, volume
  goplus: "https://api.gopluslabs.io",        // token security / honeypot screening
};

// ---- Risk rules (hard limits — the engine refuses trades that violate these) ----
export const RISK = {
  maxPositions: 2,                // max concurrent token positions
  maxPositionPctOfEquity: 0.45,   // never >45% of equity in one token
  stopLossPct: 0.15,              // exit if a position drops 15% from entry
  takeProfitTrailPct: 0.20,       // trail exits 20% below the high-water mark once >+25%
  maxSlippagePct: 0.015,          // reject swaps quoted worse than 1.5% slippage
  minPairLiquidityUsd: 150_000,   // never touch pairs with < $150k liquidity
  minPairAgeHours: 72,            // no freshly launched tokens (rug filter)
  gasReserveEth: 0.001,           // always keep this much ETH for exits
  requireGoPlusClean: true,       // token must pass honeypot/tax screening
};

// ---- Entry momentum gates (tunable; escalated over the week if no trades) ----
// Interpretable replacement for the old opaque score>5 gate. A token must show a
// real, sustained move with tradeable volume — not sub-1% noise. These are the
// ONLY loosenable knobs; the RISK safety rails above stay fixed.
export const ENTRY = {
  minCh1hPct: 4.0,   // >= +4% in the last hour (genuine move, not noise)
  minCh6hPct: 0.0,   // 6h change >= 0 (trend intact, not a dead-cat 1h spike)
  minVol1hUsd: 50_000, // >= $50k 1h volume so entry/exit doesn't move the pool
};

