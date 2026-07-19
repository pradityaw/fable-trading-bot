// Autonomous trading cycle. One invocation = one full pass:
//   1. Price WETH in USD (WETH->USDC quote) for USD marking.
//   2. Manage every open position: mark PnL, update high-water mark, and EXIT on
//      stop-loss or trailing take-profit (protective actions always run).
//   3. If there's free capacity + capital, scan for a qualifying entry and OPEN one.
//   4. Mark equity, append actions to the journal, persist positions.
//
// Modes:
//   node src/engine.mjs          -> DRY RUN: prints intended actions, no transactions
//   node src/engine.mjs --live   -> executes real swaps (used by the hourly Routine)
//
// All hard limits come from config.RISK and are enforced here.
import "./proxy.mjs";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { parseUnits, formatUnits, parseEther, formatEther } from "viem";
import { makeClients, getBalances, ERC20_ABI } from "./lib.mjs";
import { quoteBest, swapExactIn } from "./dex.mjs";
import { sourceBasePairs } from "./universe.mjs";
import { TOKENS, RISK, APIS, ENTRY } from "../config.mjs";

const LIVE = process.argv.includes("--live");
const stateDir = new URL("../state/", import.meta.url);
const posPath = new URL("positions.json", stateDir);
const journalPath = new URL("journal.md", stateDir);
const equityPath = new URL("equity.jsonl", stateDir);

const nowIso = new Date().toISOString().replace("T", " ").slice(0, 16) + "Z"; // engine runs w/ real clock (not a workflow)
const log = (m) => console.log(`[${LIVE ? "LIVE" : "DRY "}] ${m}`);
function journal(line) {
  appendFileSync(journalPath, `\n${line}`);
}

const loadPositions = () => (existsSync(posPath) ? JSON.parse(readFileSync(posPath, "utf8")) : []);
const savePositions = (p) => writeFileSync(posPath, JSON.stringify(p, null, 2) + "\n");

const clients = await makeClients();
const { publicClient, account } = clients;

// --- 1. price WETH in USD ---
const oneWeth = parseUnits("1", TOKENS.WETH.decimals);
const wethQuote = await quoteBest(publicClient, TOKENS.WETH.address, TOKENS.USDC.address, oneWeth);
if (!wethQuote) throw new Error("cannot price WETH/USDC");
const ethUsd = Number(formatUnits(wethQuote.amountOut, TOKENS.USDC.decimals));
log(`ETH = $${ethUsd.toFixed(2)}`);

const bal = await getBalances(publicClient, account.address);
const wethRaw = await publicClient.readContract({
  address: TOKENS.WETH.address, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
});
const wethBal = Number(formatUnits(wethRaw, TOKENS.WETH.decimals));
log(`balances: ${bal.eth.toFixed(5)} ETH, ${wethBal.toFixed(5)} WETH, ${bal.usdc.toFixed(2)} USDC`);

// --- 2. manage open positions ---
let positions = loadPositions();
const survivors = [];
for (const p of positions) {
  const heldRaw = await publicClient.readContract({
    address: p.token, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
  });
  if (heldRaw === 0n) { log(`position ${p.symbol}: zero balance on-chain, dropping`); continue; }

  // value the position by quoting token -> WETH -> USD
  const q = await quoteBest(publicClient, p.token, TOKENS.WETH.address, heldRaw);
  if (!q) { log(`position ${p.symbol}: no exit liquidity! keeping, will retry`); survivors.push(p); continue; }
  const valueWeth = Number(formatUnits(q.amountOut, TOKENS.WETH.decimals));
  const valueUsd = valueWeth * ethUsd;
  const pnlPct = (valueUsd - p.entryUsd) / p.entryUsd;
  p.high = Math.max(p.high ?? p.entryUsd, valueUsd);
  const drawFromHigh = (p.high - valueUsd) / p.high;

  let exit = null;
  if (pnlPct <= -RISK.stopLossPct) exit = `STOP_LOSS ${(pnlPct * 100).toFixed(1)}%`;
  else if (pnlPct >= 0.25 && drawFromHigh >= RISK.takeProfitTrailPct) exit = `TRAIL_TP peak$${p.high.toFixed(2)} now$${valueUsd.toFixed(2)}`;

  log(`position ${p.symbol}: $${valueUsd.toFixed(2)} (${(pnlPct * 100).toFixed(1)}% vs entry $${p.entryUsd})${exit ? " -> EXIT " + exit : ""}`);

  if (exit) {
    if (LIVE) {
      const r = await swapExactIn(clients, p.token, TOKENS.WETH.address, heldRaw);
      journal(`| - | ${nowIso} | SELL | ${p.symbol} | ${valueUsd.toFixed(2)} | - | ${r.hash} | - | ${exit} |`);
      log(`SOLD ${p.symbol}: ${r.hash} (${r.status})`);
    } else {
      log(`would SELL ${p.symbol} (${exit})`);
      survivors.push(p); // dry run keeps it
    }
  } else {
    survivors.push(p);
  }
}
positions = survivors;
savePositions(positions);

// --- equity mark ---
let positionsUsd = 0;
for (const p of positions) {
  const heldRaw = await publicClient.readContract({
    address: p.token, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
  });
  const q = await quoteBest(publicClient, p.token, TOKENS.WETH.address, heldRaw);
  if (q) positionsUsd += Number(formatUnits(q.amountOut, TOKENS.WETH.decimals)) * ethUsd;
}
const equityUsd = (bal.eth + wethBal) * ethUsd + bal.usdc + positionsUsd;
log(`EQUITY: $${equityUsd.toFixed(2)} (cash ${((bal.eth + wethBal) * ethUsd + bal.usdc).toFixed(2)} + positions ${positionsUsd.toFixed(2)})`);
appendFileSync(equityPath, JSON.stringify({ t: nowIso, equityUsd: Number(equityUsd.toFixed(2)), ethUsd, positions: positions.length }) + "\n");

// --- 3. consider a new entry ---
if (positions.length >= RISK.maxPositions) {
  log(`at max positions (${RISK.maxPositions}); no new entry.`);
  process.exit(0);
}

// free tradeable WETH (keep gas reserve in native ETH; positions come from WETH)
const freeWethUsd = wethBal * ethUsd;
const targetUsd = Math.min(RISK.maxPositionPctOfEquity * equityUsd, freeWethUsd);
if (targetUsd < 20) {
  log(`free WETH ($${freeWethUsd.toFixed(2)}) below min trade size; ` +
      (wethBal < 0.0001 ? "wrap ETH->WETH before entries (node src/wrap.mjs wrap max)." : "holding."));
  process.exit(0);
}

// scan — shared broad candidate universe (see universe.mjs)
async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}
const pairsMap = await sourceBasePairs();

const now = Date.now();
const quoteWl = [TOKENS.WETH.address, TOKENS.USDC.address].map((a) => a.toLowerCase());
const held = new Set(positions.map((p) => p.token.toLowerCase()));
let cands = [...pairsMap.values()]
  .filter((p) => (p.liquidity?.usd ?? 0) >= RISK.minPairLiquidityUsd)
  .filter((p) => p.pairCreatedAt && (now - p.pairCreatedAt) / 3.6e6 >= RISK.minPairAgeHours)
  .filter((p) => quoteWl.includes(p.quoteToken?.address?.toLowerCase()))
  .filter((p) => !quoteWl.includes(p.baseToken?.address?.toLowerCase()))
  .filter((p) => !held.has(p.baseToken?.address?.toLowerCase()));
for (const p of cands) {
  const ch1h = p.priceChange?.h1 ?? 0, ch6h = p.priceChange?.h6 ?? 0, vol1h = p.volume?.h1 ?? 0, liq = p.liquidity?.usd ?? 1;
  p._score = (ch1h * 0.6 + ch6h * 0.4) * Math.log10(1 + vol1h) * Math.min(1, vol1h / liq);
}
// entry gates: interpretable, sustained momentum with tradeable volume (config.ENTRY).
cands = cands.filter((p) =>
  (p.priceChange?.h1 ?? -999) >= ENTRY.minCh1hPct &&
  (p.priceChange?.h6 ?? -999) >= ENTRY.minCh6hPct &&
  (p.volume?.h1 ?? 0) >= ENTRY.minVol1hUsd
);
cands.sort((a, b) => b._score - a._score); // rank survivors by composite momentum

if (!cands.length) {
  log(`no qualifying entry (need 1h>=${ENTRY.minCh1hPct}%, 6h>=${ENTRY.minCh6hPct}%, vol1h>=$${ENTRY.minVol1hUsd}). Holding.`);
  process.exit(0);
}

// security screen the top pick
const top = cands[0];
let sec = {};
try { sec = (await getJson(`${APIS.goplus}/api/v1/token_security/8453?contract_addresses=${top.baseToken.address}`)).result ?? {}; } catch {}
const s = sec[top.baseToken.address.toLowerCase()] ?? {};
const flags = [];
if (Object.keys(s).length === 0) flags.push("NO_SECURITY_DATA");
if (s.is_honeypot === "1") flags.push("HONEYPOT");
if (Number(s.buy_tax ?? 0) > 0.03 || Number(s.sell_tax ?? 0) > 0.03) flags.push("HIGH_TAX");
if (s.cannot_sell_all === "1") flags.push("CANNOT_SELL_ALL");
if (s.owner_change_balance === "1") flags.push("OWNER_CAN_DRAIN");
if (s.transfer_pausable === "1") flags.push("PAUSABLE");
if (s.is_blacklisted === "1") flags.push("BLACKLIST");
if (flags.length) { log(`top pick ${top.baseToken.symbol} REJECTED by security screen: ${flags.join(",")}. Holding.`); process.exit(0); }

log(`ENTRY candidate: ${top.baseToken.symbol} score=${top._score.toFixed(1)} 1h=${top.priceChange?.h1}% vol1h=$${Math.round(top.volume?.h1)} liq=$${Math.round(top.liquidity?.usd)}`);
log(`sizing $${targetUsd.toFixed(2)} (${(targetUsd / equityUsd * 100).toFixed(0)}% of equity)`);

if (!LIVE) { log(`would BUY ${top.baseToken.symbol} with $${targetUsd.toFixed(2)} of WETH. (dry run)`); process.exit(0); }

// execute entry: WETH -> token
const amountInWeth = parseEther((targetUsd / ethUsd).toFixed(18));
const decimals = await publicClient.readContract({ address: top.baseToken.address, abi: ERC20_ABI, functionName: "decimals" });
const r = await swapExactIn(clients, TOKENS.WETH.address, top.baseToken.address, amountInWeth);
positions.push({
  symbol: top.baseToken.symbol, token: top.baseToken.address, decimals,
  entryUsd: Number(targetUsd.toFixed(2)), entryPriceUsd: Number(top.priceUsd), high: Number(targetUsd.toFixed(2)),
  openedAt: nowIso, fee: r.fee,
});
savePositions(positions);
journal(`| + | ${nowIso} | BUY | ${top.baseToken.symbol} | ${targetUsd.toFixed(2)} | ${top.priceUsd} | ${r.hash} | ${equityUsd.toFixed(2)} | score ${top._score.toFixed(1)} |`);
log(`BOUGHT ${top.baseToken.symbol}: ${r.hash} (${r.status})`);
