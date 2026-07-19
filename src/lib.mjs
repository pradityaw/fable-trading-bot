import "./proxy.mjs"; // must run before any network call — installs proxy + CA dispatcher
import { createPublicClient, createWalletClient, http, fallback, formatEther, formatUnits, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readFileSync } from "node:fs";
import { CHAIN, TOKENS } from "../config.mjs";

export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export function loadWallet() {
  // Prefer an environment secret so scheduled runs survive container recycling;
  // fall back to the local gitignored keyfile for interactive sessions.
  const envKey = process.env.WALLET_PRIVATE_KEY;
  if (envKey && /^(0x)?[0-9a-fA-F]{64}$/.test(envKey.trim())) {
    const k = envKey.trim();
    return privateKeyToAccount(k.startsWith("0x") ? k : `0x${k}`);
  }
  const raw = JSON.parse(readFileSync(new URL("../.wallet.json", import.meta.url), "utf8"));
  return privateKeyToAccount(raw.privateKey);
}

// Fallback transport across all configured RPCs with per-request retries.
// Public RPCs rate-limit aggressively ("over rate limit" on mainnet.base.org);
// fallback() rotates to the next RPC on failure instead of dying mid-swap.
function makeTransport() {
  return fallback(
    CHAIN.rpcUrls.map((url) => http(url, { timeout: 10_000, retryCount: 3, retryDelay: 800 })),
    { rank: false }
  );
}

export async function makeClients() {
  const account = loadWallet();
  const transport = makeTransport();
  const publicClient = createPublicClient({ chain: base, transport });
  const walletClient = createWalletClient({ account, chain: base, transport });
  await publicClient.getBlockNumber(); // fail fast if nothing reachable
  return { publicClient, walletClient, account, rpcUrl: "fallback(" + CHAIN.rpcUrls.join(",") + ")" };
}

export async function getBalances(publicClient, address) {
  const [eth, usdc] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: TOKENS.USDC.address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
  ]);
  return {
    eth: Number(formatEther(eth)),
    usdc: Number(formatUnits(usdc, TOKENS.USDC.decimals)),
    ethWei: eth,
    usdcRaw: usdc,
  };
}
