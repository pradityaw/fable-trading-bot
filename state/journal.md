# Trade journal

Every position open/close is logged here and committed, so the full history
survives container restarts. Equity is marked in USD.

| # | Date (UTC) | Action | Token | Size (USD) | Price | Tx | Equity after | Notes |
|---|-----------|--------|-------|-----------|-------|----|--------------|-------|

## Daily equity

| Date (UTC) | Equity (USD) | vs. start |
|-----------|--------------|-----------|

Start capital: $100 (pending funding). Target: $200 by day 7.

## Live log

- **2026-07-18 ~12:10Z** — Network access opened (Custom policy). Pre-flight passed: RPC live, Base block ~48.79M, WETH/USDC/Router/Quoter verified on-chain.
- Wallet 0x97CC49c28877ffaf0031A5C16FDFe1578DfeA702 funded: **0.075696 ETH ≈ $139.28** (ETH $1840). Baseline equity **$139.28**.
- Wrapped 0.074696 ETH -> WETH (tx 0x62a7e7bb...) keeping 0.001 ETH gas reserve. Trading base asset = WETH.
- Engine dry-run: no qualifying setup (gates: score>5, 1h vol>$20k, positive 1h momentum) -> holding ETH. Hourly autonomous loop armed.
- **~19:xxZ** — Fixed candidate sourcing: shared universe.mjs broadens Base universe from ~15 to ~312 pairs (boost feeds + 24-term search basket). Safety gates unchanged. Engine still holding — market momentum genuinely low (top score ~0.02 vs entry bar 5). Equity $140.75.
- **2026-07-19 ~00:40Z (Day 1)** — DECISION (owner delegated 100%): market analysis shows entire liquid Base market moving <1%/h (top candidate cbBTC +0.45% 6h). No momentum edge exists tonight -> correctly NOT forcing a trade. BUT replaced broken opaque gate (score>5, unreachable) with interpretable ENTRY gates: 1h>=4%, 6h>=0%, vol1h>=$50k. Safety rails unchanged. Engine will now actually fire when a real mover appears. Equity $140.63 (+1.0%), 0 trades.

| + | 2026-07-19 06:35Z | BUY | DEGEN | 63.65 | 0.001576 | 0x43ea37c5bee1f37b2f222c2b3db61b25328e217363b3a8d32cfe61262985136d | 141.45 | score 10.1 |- **2026-07-19 06:35Z (Day 2)** — 🟢 FIRST TRADE: BOUGHT 40,547 DEGEN @ $0.001576 for $63.65 WETH (45% of equity). Setup: +12.9% 1h on $146k vol, $972k liq, GoPlus clean. Tx 0x43ea37c5... Stop-loss -15%, trailing TP 20% from peak after +25%. Also fixed RPC transport to fallback across 3 endpoints after rate-limit failure (first attempt consumed only the approval).

| - | 2026-07-19 15:34Z | SELL | DEGEN | 54.02 | - | 0x2f6bf177ad6642098fa06206b2d62138c418d3fc0d103dccdae517d92e0f4d58 | - | STOP_LOSS -15.1% |- **2026-07-19 15:34Z (Day 2)** — 🔴 STOP-LOSS EXIT: SOLD 40,547 DEGEN for $54.02 WETH (tx 0x2f6bf177...). Realized loss -$9.63 (-15.1%) on the position. The rail did its job: capped the loss at design limit, no emotion, no bag-holding. Equity $131.80 (-5.4% vs $139.28 baseline). Back to 100% WETH cash, scanning for next setup.
