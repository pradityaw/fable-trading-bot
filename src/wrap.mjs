// Wrap native ETH -> WETH (deposit) or unwrap WETH -> ETH (withdraw).
// The wallet is funded in native ETH; trading happens in WETH. Keep a gas
// reserve in native ETH at all times (RISK.gasReserveEth).
// Usage:
//   node src/wrap.mjs wrap <amountEthHuman|max>
//   node src/wrap.mjs unwrap <amountWethHuman|max>
import { parseEther, formatEther, parseAbi } from "viem";
import { makeClients, ERC20_ABI } from "./lib.mjs";
import { TOKENS, RISK } from "../config.mjs";

const WETH_ABI = parseAbi([
  "function deposit() payable",
  "function withdraw(uint256 wad)",
  "function balanceOf(address) view returns (uint256)",
]);

const [mode, amountArg] = process.argv.slice(2);
if (!["wrap", "unwrap"].includes(mode) || !amountArg) {
  console.error("usage: node src/wrap.mjs wrap|unwrap <amountHuman|max>");
  process.exit(1);
}

const { publicClient, walletClient, account } = await makeClients();

if (mode === "wrap") {
  let value;
  if (amountArg === "max") {
    const bal = await publicClient.getBalance({ address: account.address });
    const reserve = parseEther(String(RISK.gasReserveEth));
    if (bal <= reserve) throw new Error(`Balance ${formatEther(bal)} ETH <= gas reserve; nothing to wrap.`);
    value = bal - reserve;
  } else {
    value = parseEther(amountArg);
  }
  const hash = await walletClient.writeContract({
    address: TOKENS.WETH.address, abi: WETH_ABI, functionName: "deposit", value,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`wrapped ${formatEther(value)} ETH -> WETH: ${hash}`);
} else {
  let wad;
  if (amountArg === "max") {
    wad = await publicClient.readContract({
      address: TOKENS.WETH.address, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
    });
  } else {
    wad = parseEther(amountArg);
  }
  const hash = await walletClient.writeContract({
    address: TOKENS.WETH.address, abi: WETH_ABI, functionName: "withdraw", args: [wad],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`unwrapped ${formatEther(wad)} WETH -> ETH: ${hash}`);
}
