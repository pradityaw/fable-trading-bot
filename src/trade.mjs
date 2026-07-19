// Execute a swap on Uniswap V3 (Base) with on-chain quoting and hard risk checks.
// Quoting uses QuoterV2 directly on-chain — no aggregator API key needed.
//
// Usage:
//   node src/trade.mjs quote  <tokenIn> <tokenOut> <amountInHuman>
//   node src/trade.mjs swap   <tokenIn> <tokenOut> <amountInHuman> [--yes]
//
// tokenIn/tokenOut: symbol (WETH|USDC) or 0x address.
import { parseUnits, formatUnits, encodeFunctionData, parseAbi } from "viem";
import { makeClients, ERC20_ABI } from "./lib.mjs";
import { TOKENS, UNISWAP_V3, RISK } from "../config.mjs";

const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

const [mode, tokenInArg, tokenOutArg, amountArg] = process.argv.slice(2);
if (!["quote", "swap"].includes(mode) || !tokenInArg || !tokenOutArg || !amountArg) {
  console.error("usage: node src/trade.mjs quote|swap <tokenIn> <tokenOut> <amountInHuman> [--yes]");
  process.exit(1);
}
const confirmed = process.argv.includes("--yes");

const { publicClient, walletClient, account } = await makeClients();

async function resolveToken(arg) {
  if (TOKENS[arg?.toUpperCase()]) return TOKENS[arg.toUpperCase()];
  const address = arg;
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
    publicClient.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
  ]);
  return { address, decimals, symbol };
}

const tokenIn = await resolveToken(tokenInArg);
const tokenOut = await resolveToken(tokenOutArg);
const amountIn = parseUnits(amountArg, tokenIn.decimals);

// Find the best fee tier by quoting all three.
let best = null;
for (const fee of UNISWAP_V3.feeTiers) {
  try {
    const { result } = await publicClient.simulateContract({
      address: UNISWAP_V3.quoterV2,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    const amountOut = result[0];
    if (!best || amountOut > best.amountOut) best = { fee, amountOut };
  } catch {
    // pool for this tier doesn't exist / no liquidity — skip
  }
}
if (!best) throw new Error("No Uniswap V3 pool with liquidity found for this pair.");

const outHuman = formatUnits(best.amountOut, tokenOut.decimals);
console.log(`quote: ${amountArg} ${tokenIn.symbol} -> ${outHuman} ${tokenOut.symbol} (fee tier ${best.fee / 10000}%)`);

if (mode === "quote") process.exit(0);
if (!confirmed) {
  console.error("Refusing to swap without --yes (explicit confirmation).");
  process.exit(1);
}

// Slippage guard from config.
const minOut = (best.amountOut * BigInt(Math.floor((1 - RISK.maxSlippagePct) * 1e6))) / 1_000_000n;

// Approve router if needed (exact amount, not infinite).
const allowance = await publicClient.readContract({
  address: tokenIn.address, abi: ERC20_ABI, functionName: "allowance",
  args: [account.address, UNISWAP_V3.swapRouter02],
});
if (allowance < amountIn) {
  const approveHash = await walletClient.writeContract({
    address: tokenIn.address, abi: ERC20_ABI, functionName: "approve",
    args: [UNISWAP_V3.swapRouter02, amountIn],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`approved: ${approveHash}`);
}

const swapHash = await walletClient.writeContract({
  address: UNISWAP_V3.swapRouter02,
  abi: ROUTER_ABI,
  functionName: "exactInputSingle",
  args: [{
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    fee: best.fee,
    recipient: account.address,
    amountIn,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0n,
  }],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
console.log(`swap ${receipt.status}: ${swapHash}`);
console.log(`minOut enforced: ${formatUnits(minOut, tokenOut.decimals)} ${tokenOut.symbol}`);
