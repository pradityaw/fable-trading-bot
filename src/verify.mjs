// Pre-flight: verify every configured contract address on-chain before the first
// live trade. Checks bytecode presence and token metadata. Run once when RPC opens.
// Usage: node src/verify.mjs
import { makeClients, ERC20_ABI } from "./lib.mjs";
import { TOKENS, UNISWAP_V3 } from "../config.mjs";

const { publicClient, rpcUrl } = await makeClients();
console.log(`rpc ok: ${rpcUrl}, block ${await publicClient.getBlockNumber()}`);

let failures = 0;
async function check(label, address, expectSymbol) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") {
    console.log(`FAIL ${label} ${address}: no bytecode`);
    failures++;
    return;
  }
  if (expectSymbol) {
    const symbol = await publicClient.readContract({ address, abi: ERC20_ABI, functionName: "symbol" });
    const ok = symbol.toUpperCase().includes(expectSymbol.replace("W", "")) || symbol === expectSymbol;
    console.log(`${ok ? "ok  " : "FAIL"} ${label} ${address}: symbol=${symbol}`);
    if (!ok) failures++;
  } else {
    console.log(`ok   ${label} ${address}: bytecode present`);
  }
}

await check("WETH", TOKENS.WETH.address, "WETH");
await check("USDC", TOKENS.USDC.address, "USDC");
await check("SwapRouter02", UNISWAP_V3.swapRouter02);
await check("QuoterV2", UNISWAP_V3.quoterV2);

process.exit(failures ? 1 : 0);
