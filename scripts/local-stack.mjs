/**
 * Local stack runner and seeder for Descent.
 *
 * Spawns anvil on port 8708 with chain id 968, deploys Descent and MockNFT,
 * mints 12 tokens across accounts 0-3, and seeds the 6 scenarios from 08-descent.md §5:
 * (1) mid-descent (~40%)
 * (2) nearly at floor (~90%)
 * (3) at floor for 10 minutes
 * (4) sold to account 2
 * (5) cancelled
 * (6) account 0's own active listing
 * plus unlisted tokens owned by account 0 for the create flow.
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8708;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const MNEMONIC = "test test test test test test test test test test test junk";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--accounts", "10", "--silent"],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

const accounts = Array.from({ length: 10 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);
const wallets = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

// Wait for anvil to answer
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const descentArtifact = JSON.parse(
  readFileSync("contracts/out/Descent.sol/Descent.json", "utf8")
);
const descentAbi = descentArtifact.abi;

const mockNftArtifact = JSON.parse(
  readFileSync("contracts/out/MockNFT.sol/MockNFT.json", "utf8")
);
const mockNftAbi = mockNftArtifact.abi;

console.log("Deploying Descent and MockNFT...");
const dDeployHash = await wallets[0].deployContract({
  abi: descentAbi,
  bytecode: descentArtifact.bytecode.object,
  args: [],
});
const dReceipt = await pub.waitForTransactionReceipt({ hash: dDeployHash });
const descentAddress = dReceipt.contractAddress;

const mDeployHash = await wallets[0].deployContract({
  abi: mockNftAbi,
  bytecode: mockNftArtifact.bytecode.object,
  args: [],
});
const mReceipt = await pub.waitForTransactionReceipt({ hash: mDeployHash });
const mockNftAddress = mReceipt.contractAddress;

console.log(`Descent deployed at: ${descentAddress}`);
console.log(`MockNFT deployed at: ${mockNftAddress}`);

// Mint 12 tokens:
// Acc 0: tokens 1, 2, 3
// Acc 1: tokens 4, 5, 6
// Acc 2: tokens 7, 8, 9
// Acc 3: tokens 10, 11, 12
console.log("Minting 12 tokens across accounts 0..3...");
for (let id = 1n; id <= 12n; id++) {
  const ownerIndex = Number((id - 1n) / 3n);
  const mintHash = await wallets[0].writeContract({
    address: mockNftAddress,
    abi: mockNftAbi,
    functionName: "mint",
    args: [accounts[ownerIndex].address, id],
  });
  await pub.waitForTransactionReceipt({ hash: mintHash });
}

// Approve Descent for each token that will be listed:
// Listing 1: Token 4 (Acc 1) -> Mid-descent (~40%)
// Listing 2: Token 5 (Acc 1) -> Nearly at floor (~90%)
// Listing 3: Token 6 (Acc 1) -> At floor for 10 min
// Listing 4: Token 7 (Acc 2) -> Sold to account 2
// Listing 5: Token 8 (Acc 2) -> Cancelled
// Listing 6: Token 1 (Acc 0) -> Account 0's active listing
// Token 2, 3 (Acc 0) left unlisted for manual creation testing!

console.log("Approving tokens for Descent...");
await wallets[1].writeContract({
  address: mockNftAddress,
  abi: mockNftAbi,
  functionName: "setApprovalForAll",
  args: [descentAddress, true],
});
await wallets[2].writeContract({
  address: mockNftAddress,
  abi: mockNftAbi,
  functionName: "setApprovalForAll",
  args: [descentAddress, true],
});
await wallets[0].writeContract({
  address: mockNftAddress,
  abi: mockNftAbi,
  functionName: "setApprovalForAll",
  args: [descentAddress, true],
});

// Listing 3: Token 6 - listed early so that it's at floor for 10 minutes
// Duration = 1000s. We'll advance time after listings.
console.log("Creating listings...");

// Listing 3: (At floor for 10m)
const h3 = await wallets[1].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "list",
  args: [mockNftAddress, 6n, parseEther("1.0"), parseEther("0.1"), 1000n],
});
await pub.waitForTransactionReceipt({ hash: h3 });

// Listing 2: (Nearly at floor: ~90%)
const h2 = await wallets[1].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "list",
  args: [mockNftAddress, 5n, parseEther("2.5"), parseEther("0.25"), 1500n],
});
await pub.waitForTransactionReceipt({ hash: h2 });

// Listing 1: (Mid-descent: ~40%)
const h1 = await wallets[1].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "list",
  args: [mockNftAddress, 4n, parseEther("5.0"), parseEther("0.5"), 3000n],
});
await pub.waitForTransactionReceipt({ hash: h1 });

// Listing 4: (Sold to account 2)
const h4 = await wallets[2].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "list",
  args: [mockNftAddress, 7n, parseEther("1.0"), parseEther("0.2"), 3600n],
});
await pub.waitForTransactionReceipt({ hash: h4 });

// Buy Listing 4 by account 2 (or account 3)
const buyHash = await wallets[3].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "buy",
  args: [4n],
  value: parseEther("1.1"),
});
await pub.waitForTransactionReceipt({ hash: buyHash });

// Listing 5: (Cancelled)
const h5 = await wallets[2].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "list",
  args: [mockNftAddress, 8n, parseEther("3.0"), parseEther("0.3"), 2000n],
});
await pub.waitForTransactionReceipt({ hash: h5 });
const cancelHash = await wallets[2].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "cancel",
  args: [5n],
});
await pub.waitForTransactionReceipt({ hash: cancelHash });

// Listing 6: (Account 0's own active listing)
const h6 = await wallets[0].writeContract({
  address: descentAddress,
  abi: descentAbi,
  functionName: "list",
  args: [mockNftAddress, 1n, parseEther("10.0"), parseEther("1.0"), 7200n],
});
await pub.waitForTransactionReceipt({ hash: h6 });

// Advance time by 1600 seconds so:
// Listing 3 (duration 1000s) has been at floor for 600s (10 min)!
// Listing 2 (duration 1500s) is ~90-100% (at or near floor)
// Listing 1 (duration 3000s) is ~50% (mid-descent)
// Listing 6 (duration 7200s) is in early descent
await pub.request({ method: "evm_increaseTime", params: [1600] });
await pub.request({ method: "evm_mine" });

const envContent = [
  `NEXT_PUBLIC_CONTRACT_968=${descentAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${dReceipt.blockNumber.toString()}`,
  `NEXT_PUBLIC_NFT_968=${mockNftAddress}`,
  `NEXT_PUBLIC_CHAIN_ID=968`,
  `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:${PORT}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local with deployed contract addresses.");
console.log("\nSeeded scenarios:");
console.log("1. Mid-descent (~40%): Listing #3 (Token 4, 5.0 -> 0.5 BOT)");
console.log("2. Nearly at floor: Listing #2 (Token 5, 2.5 -> 0.25 BOT)");
console.log("3. At floor for 10 min: Listing #1 (Token 6, 1.0 -> 0.1 BOT)");
console.log("4. Sold to account 3: Listing #4 (Token 7)");
console.log("5. Cancelled: Listing #5 (Token 8)");
console.log("6. Account 0 active: Listing #6 (Token 1, 10.0 -> 1.0 BOT)");
console.log("Plus Account 0 owns unlisted Token 2 and Token 3 for the create flow.");
