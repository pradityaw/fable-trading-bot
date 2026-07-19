// Candidate sourcing for Base. DexScreener has no free "top pairs by volume"
// endpoint, so we widen the universe by combining: (a) the boosted-token feeds,
// and (b) a broad basket of search terms covering the most active Base tokens
// plus generic terms. Returns a deduped Map<pairAddress, pair> (deepest pair
// per address kept). Safety/momentum filtering happens downstream in the caller.
import { APIS } from "../config.mjs";

// Active Base tokens + generic terms. Kept broad on purpose; the risk filters
// (liquidity, age, honeypot screen, momentum) decide what is actually tradeable.
export const SEARCH_TERMS = [
  "WETH", "USDC", "base", "cbBTC", "AERO", "BRETT", "DEGEN", "TOSHI", "VIRTUAL",
  "MOG", "HIGHER", "KEYCAT", "AIXBT", "MIGGLES", "SPX", "MOCHI", "NORMIE",
  "DACKIE", "BASED", "EURC", "USDT", "cbETH", "wstETH", "tokenbot", "clanker",
];

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export async function sourceBasePairs(extraTerms = []) {
  const byPair = new Map();
  const keepDeepest = (p) => {
    if (!p?.pairAddress || p.chainId !== "base") return;
    const prev = byPair.get(p.pairAddress);
    if (!prev || (p.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) byPair.set(p.pairAddress, p);
  };

  // (a) boosted-token feeds -> resolve addresses to pairs
  const boostAddrs = new Set();
  for (const path of ["/token-boosts/top/v1", "/token-boosts/latest/v1"]) {
    try {
      for (const b of (await getJson(`${APIS.dexscreener}${path}`)) ?? [])
        if (b.chainId === "base" && b.tokenAddress) boostAddrs.add(b.tokenAddress.toLowerCase());
    } catch {}
  }
  const addrList = [...boostAddrs];
  for (let i = 0; i < addrList.length; i += 30) {
    try {
      const d = await getJson(`${APIS.dexscreener}/latest/dex/tokens/${addrList.slice(i, i + 30).join(",")}`);
      for (const p of d.pairs ?? []) keepDeepest(p);
    } catch {}
  }

  // (b) broad search basket
  const terms = [...new Set([...SEARCH_TERMS, ...extraTerms])];
  for (const q of terms) {
    try {
      const d = await getJson(`${APIS.dexscreener}/latest/dex/search?q=${encodeURIComponent(q)}`);
      for (const p of d.pairs ?? []) keepDeepest(p);
    } catch {}
  }

  return byPair;
}
