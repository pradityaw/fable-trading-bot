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
  maxPositionPctOfEquity: 0.30,   // v2: 45%→30% — two stop-outs cost 25% of bankroll; size down to survive variance
  stopLossPct: 0.12,              // v2: 15%→12% — hourly cadence gaps past the stop anyway; start tighter
  takeProfitTrailPct: 0.10,       // v2: 20%→10% trail below high-water mark once activated
  tpActivatePct: 0.10,            // v2: trail activates at +10% (was hardcoded +25% — winners never got that far)
  maxSlippagePct: 0.015,          // reject swaps quoted worse than 1.5% slippage
  minPairLiquidityUsd: 400_000,   // v2: 150k→400k — thin pools gap through stops (MIGGLES: $420k liq still gapped -25%/h)
  minPairAgeHours: 72,            // no freshly launched tokens (rug filter)
  gasReserveEth: 0.001,           // always keep this much ETH for exits
  requireGoPlusClean: true,       // token must pass honeypot/tax screening
};

// ---- Entry gates v2: trend-pullback, not spike-chasing ----
// v1 ("1h >= +4%") bought blow-off tops: both live trades (DEGEN +12.9%/1h,
// MIGGLES +6.4%/1h) entered right after the pump and mean-reverted into the stop.
// v2 inverts it: require a REAL multi-hour uptrend (6h and 24h positive), and
// enter only when the last hour is quiet — a pullback/consolidation — never
// mid-spike. Rank survivors by 6h trend, not 1h heat.
export const ENTRY = {
  minCh6hPct: 8.0,     // sustained 6h uptrend, not a one-candle wonder
  minCh24hPct: 0.0,    // daily trend not negative (no dead-cat bounces)
  minCh1hPct: -3.0,    // tolerate a shallow pullback...
  maxCh1hPct: 5.0,     // ...but NEVER chase a hot 1h candle (this was the v1 killer)
  minVol1hUsd: 30_000, // still-live interest this hour
  minVol6hUsd: 150_000, // real sustained volume behind the 6h move
};

