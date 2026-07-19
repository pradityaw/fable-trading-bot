// Print wallet address, ETH/USDC balances, and open positions.
// Usage: node src/status.mjs
import { makeClients, getBalances, ERC20_ABI } from "./lib.mjs";
import { formatUnits } from "viem";
import { readFileSync, existsSync } from "node:fs";

const positionsPath = new URL("../state/positions.json", import.meta.url);

const { publicClient, account, rpcUrl } = await makeClients();
console.log(`wallet:  ${account.address}`);
console.log(`rpc:     ${rpcUrl}`);

const bal = await getBalances(publicClient, account.address);
console.log(`ETH:     ${bal.eth.toFixed(6)}`);
console.log(`USDC:    ${bal.usdc.toFixed(2)}`);

if (existsSync(positionsPath)) {
  const positions = JSON.parse(readFileSync(positionsPath, "utf8"));
  for (const p of positions) {
    const raw = await publicClient.readContract({
      address: p.token, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
    });
    console.log(`POS ${p.symbol}: ${formatUnits(raw, p.decimals)} (entry $${p.entryUsd}, opened ${p.openedAt})`);
  }
} else {
  console.log("positions: none");
}
