// Shared DEX helpers: on-chain best-tier quoting and slippage-guarded swaps on
// Uniswap V3 (Base). Used by the autonomous engine and manual trade CLI.
import { parseAbi, formatUnits } from "viem";
import { UNISWAP_V3, RISK } from "../config.mjs";
import { ERC20_ABI } from "./lib.mjs";

const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

// Quote across all fee tiers; return the best {fee, amountOut} or null.
export async function quoteBest(publicClient, tokenInAddr, tokenOutAddr, amountIn) {
  let best = null;
  for (const fee of UNISWAP_V3.feeTiers) {
    try {
      const { result } = await publicClient.simulateContract({
        address: UNISWAP_V3.quoterV2,
        abi: QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: tokenInAddr, tokenOut: tokenOutAddr, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const amountOut = result[0];
      if (!best || amountOut > best.amountOut) best = { fee, amountOut };
    } catch {
      // no pool / no liquidity at this tier
    }
  }
  return best;
}

// Execute an exact-input swap with amountOutMinimum enforced from RISK.maxSlippagePct.
// Approves the router for exactly amountIn if needed. Returns { hash, status, amountOutMin, fee }.
export async function swapExactIn({ publicClient, walletClient, account }, tokenInAddr, tokenOutAddr, amountIn, opts = {}) {
  const slippage = opts.slippage ?? RISK.maxSlippagePct;
  const best = opts.fee
    ? { fee: opts.fee, amountOut: (await quoteBest(publicClient, tokenInAddr, tokenOutAddr, amountIn))?.amountOut }
    : await quoteBest(publicClient, tokenInAddr, tokenOutAddr, amountIn);
  if (!best || best.amountOut == null) throw new Error("no liquidity to quote swap");

  const amountOutMin = (best.amountOut * BigInt(Math.floor((1 - slippage) * 1_000_000))) / 1_000_000n;

  const allowance = await publicClient.readContract({
    address: tokenInAddr, abi: ERC20_ABI, functionName: "allowance",
    args: [account.address, UNISWAP_V3.swapRouter02],
  });
  if (allowance < amountIn) {
    const approveHash = await walletClient.writeContract({
      address: tokenInAddr, abi: ERC20_ABI, functionName: "approve",
      args: [UNISWAP_V3.swapRouter02, amountIn],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const hash = await walletClient.writeContract({
    address: UNISWAP_V3.swapRouter02,
    abi: ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: tokenInAddr, tokenOut: tokenOutAddr, fee: best.fee,
      recipient: account.address, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n,
    }],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status, amountOutMin, amountOut: best.amountOut, fee: best.fee };
}

export { QUOTER_ABI, ROUTER_ABI };
