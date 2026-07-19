# fable-trading-bot

Autonomous crypto **momentum trading bot** running on **Base** mainnet. One-week
experiment: turn ~$100 of ETH into ~$200, trading fully autonomously with hard
risk rails. Operated by Claude from a Claude Code cloud session.

> Migrated from `apotech/experiments/crypto-trading` — full history preserved in
> `state/journal.md`.

## How it works

An hourly loop (`src/engine.mjs`) runs one cycle each hour:
1. Prices ETH, marks equity in USD.
2. Manages open positions — auto-exits on **−15% stop-loss** or **trailing take-profit**.
3. Scans ~300 liquid Base pairs; buys the best candidate **only** if it clears every gate.
4. Commits state (`state/`) so it survives container recycling.

## Risk rails (`config.mjs`, enforced in code)

| Rail | Value |
|------|-------|
| Max concurrent positions | 2 |
| Max size per position | 45% of equity |
| Stop-loss | −15% from entry |
| Trailing take-profit | 20% below peak, once >+25% |
| Min pair liquidity | $150k |
| Min pair age | 72h |
| Max slippage | 1.5% |
| Security screen | GoPlus honeypot/tax check must pass |

Entry momentum gates (tunable, `config.mjs` → `ENTRY`): 1h ≥ +4%, 6h ≥ 0%, 1h vol ≥ $50k.

## Wallet

- Trading wallet: `0x97CC49c28877ffaf0031A5C16FDFe1578DfeA702` (Base).
- Private key lives only in `.wallet.json` (gitignored, mode 600) **or** the
  `WALLET_PRIVATE_KEY` env var. Never committed. The owner holds the same key in Rabby.

## Required network allowlist (Custom policy)

`mainnet.base.org`, `base.publicnode.com`, `base.llamarpc.com`, `api.dexscreener.com`, `api.gopluslabs.io`
(plus the default package-manager list).

## Runbook

```bash
npm install
node src/verify.mjs                 # pre-flight: RPC + contracts
node src/status.mjs                 # balances + open positions
node src/engine.mjs                 # DRY cycle (no trades)
node src/engine.mjs --live          # execute the cycle (used by the hourly loop)
node src/scan.mjs                   # ranked, security-screened candidates
```

## Honest odds

~2x in a week on spot momentum trading is a low-probability outcome. The rails
maximize survival and prevent rug/honeypot wipeouts; they don't manufacture edge.
Treat the capital as fully at risk.
