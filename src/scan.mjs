// Market scanner for Base. Sources a broad candidate universe (see universe.mjs),
// applies the risk filters from config, ranks by volume-weighted momentum, and
// runs GoPlus token-security screening on the survivors.
// Output: ranked candidate list (JSON).
// Usage: node src/scan.mjs [extraSearchTerm ...]
import "./proxy.mjs";
import { APIS, RISK, TOKENS } from "../config.mjs";
import { sourceBasePairs } from "./universe.mjs";

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const byPair = await sourceBasePairs(process.argv.slice(2));
const now = Date.now();
const quoteWl = [TOKENS.WETH.address, TOKENS.USDC.address].map((a) => a.toLowerCase());

let pairs = [...byPair.values()]
  .filter((p) => (p.liquidity?.usd ?? 0) >= RISK.minPairLiquidityUsd)
  .filter((p) => p.pairCreatedAt && (now - p.pairCreatedAt) / 3.6e6 >= RISK.minPairAgeHours)
  .filter((p) => quoteWl.includes(p.quoteToken?.address?.toLowerCase()))
  .filter((p) => !quoteWl.includes(p.baseToken?.address?.toLowerCase()));

for (const p of pairs) {
  const ch1h = p.priceChange?.h1 ?? 0, ch6h = p.priceChange?.h6 ?? 0;
  const vol1h = p.volume?.h1 ?? 0, liq = p.liquidity?.usd ?? 1;
  p._score = (ch1h * 0.6 + ch6h * 0.4) * Math.log10(1 + vol1h) * Math.min(1, vol1h / liq);
}
pairs.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
pairs = pairs.slice(0, 12);

let security = {};
if (pairs.length && RISK.requireGoPlusClean) {
  const addrs = pairs.map((p) => p.baseToken.address).join(",");
  try {
    const sec = await getJson(`${APIS.goplus}/api/v1/token_security/8453?contract_addresses=${addrs}`);
    security = sec.result ?? {};
  } catch (e) { console.error(`warn: goplus -> ${e.message}`); }
}

const out = pairs.map((p) => {
  const s = security[p.baseToken.address.toLowerCase()] ?? {};
  const flags = [];
  if (s.is_honeypot === "1") flags.push("HONEYPOT");
  if (Number(s.buy_tax ?? 0) > 0.03 || Number(s.sell_tax ?? 0) > 0.03) flags.push("HIGH_TAX");
  if (s.cannot_sell_all === "1") flags.push("CANNOT_SELL_ALL");
  if (s.owner_change_balance === "1") flags.push("OWNER_CAN_DRAIN");
  if (s.transfer_pausable === "1") flags.push("PAUSABLE");
  if (s.is_blacklisted === "1") flags.push("BLACKLIST");
  const screened = Object.keys(s).length > 0;
  return {
    symbol: p.baseToken.symbol, token: p.baseToken.address, quote: p.quoteToken.symbol, dex: p.dexId,
    priceUsd: p.priceUsd, liqUsd: Math.round(p.liquidity?.usd ?? 0),
    vol1h: Math.round(p.volume?.h1 ?? 0), vol24h: Math.round(p.volume?.h24 ?? 0),
    ch1h: p.priceChange?.h1, ch6h: p.priceChange?.h6, ch24h: p.priceChange?.h24,
    ageHours: p.pairCreatedAt ? Math.round((now - p.pairCreatedAt) / 3.6e6) : null,
    score: Number((p._score ?? 0).toFixed(3)),
    buyTax: s.buy_tax, sellTax: s.sell_tax, securityFlags: flags, screened,
    tradeable: screened && flags.length === 0,
  };
});

console.log(JSON.stringify(out, null, 2));
console.error(`\nsourced ${byPair.size} Base pairs -> ${pairs.length} passed filters -> ${out.filter((o) => o.tradeable).length} tradeable`);
