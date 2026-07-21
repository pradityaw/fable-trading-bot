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

| + | 2026-07-21 01:34Z | BUY | MIGGLES | 60.63 | 0.002588 | 0x2cc626c6a6553bc396227aa5be3f8e50ba36544fcaa895acaa1b55fbaa6ab795 | 134.73 | score 5.3 |- **2026-07-21 01:34Z (Day 3)** — 🟢 BOUGHT MIGGLES @ $0.002588 for $60.63 WETH (45% of equity). Setup: +6.38% 1h on $103k vol, $420k liq, GoPlus clean (no honeypot/high-tax). Tx 0x2cc626c6... First --live attempt threw on quote sim before swapping (no funds moved); retry filled. Single position confirmed on-chain (WETH 0.0695→0.0378). Stop-loss -15%, trailing TP after +25%. Equity $134.73.

| - | 2026-07-21 02:35Z | SELL | MIGGLES | 45.38 | - | 0x8905dcc220b3c90bf9d1b47a32dd98c68dfea765d4a2cf2ff27defe2a5e73046 | - | STOP_LOSS -25.2% |- **2026-07-21 ~02:3xZ (Day 3)** — 🔴 STOP-LOSS EXIT MIGGLES: sold full 22,844 MIGGLES for ~$45.4 WETH (tx 0x8905dcc2...). Realized ~-$15.2 (-25.2%). Price gapped hard between hourly cycles, blowing through the -15% level before the loop next ran (hourly cadence = gap risk on fast dumps). First sell attempt reverted with Uniswap `STF` (transferFrom failed) — root cause was RPC lag: the swap hit a node that hadn't yet indexed the just-sent approval, so allowance read 0. Confirmed approval durably on-chain, re-ran, filled clean. Equity $119.50 (-14.2% vs $139.28 baseline). Back to 100% WETH cash.
- **2026-07-21 ~14:xxZ (Day 4)** — 📐 STRATEGY v2 (owner asked for re-evaluation after 0/2 wins; delegated the call). Diagnosis: v1 entry ("1h>=+4%") structurally bought blow-off tops — both losers (DEGEN +12.9%/1h, MIGGLES +6.4%/1h) entered post-pump and mean-reverted into stops. Considered switching to Robinhood Chain per owner's suggestion: rejected — Arbitrum-Orbit L2 focused on tokenized equities, no liquid memecoin/DEX momentum universe, no candidate feed, and bridging $120 + re-wiring the stack would burn a day of the 2-day probation for a worse hunting ground. Fix the signal, not the chain. v2: (a) ENTRY inverted to trend-pullback — require 6h>=+8% AND 24h>=0 with a QUIET last hour (1h in [-3%,+5%], never chase); vol6h>=$150k; rank by 6h/24h trend not 1h heat. (b) RISK tightened: size 45%→30%, stop 15%→12%, liq floor 150k→400k, and take-profit trail now activates at +10% with 10% trail (was +25%/20% — winners never got that far). Same rails architecture, engine enforces. Equity $120.93 going in.
