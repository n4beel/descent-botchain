import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { descentAbi } from "@/lib/botchain/abi";
import { erc721Abi } from "@/lib/erc721";
import { buyValue, priceAt } from "@/lib/descent";
import { MAX_DURATION, MAX_PAGE, MIN_DURATION } from "@/lib/limits";

const PORT = 8608;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const MNEMONIC = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 8 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let wallets: any[];
let descentAddress: Address;
let mockNftAddress: Address;

function revertDetails(
  err: unknown
): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

async function mineBlock() {
  await (publicClient.request as any)({ method: "evm_mine" });
}

async function setNextBlockTimestamp(timestamp: number | bigint) {
  await (publicClient.request as any)({
    method: "evm_setNextBlockTimestamp",
    params: [Number(timestamp)],
  });
}

beforeAll(async () => {
  node = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  publicClient = createPublicClient({ chain: local, transport: http() }) as PublicClient;
  wallets = accounts.map((acc) =>
    createWalletClient({ account: acc, chain: local, transport: http() })
  );

  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Deploy Descent contract
  const descentArtifact = JSON.parse(
    readFileSync("contracts/out/Descent.sol/Descent.json", "utf8")
  ) as { abi: any; bytecode: { object: Hex } };

  const descentDeployHash = await wallets[0].deployContract({
    abi: descentArtifact.abi,
    bytecode: descentArtifact.bytecode.object,
    args: [],
  });
  const descentReceipt = await publicClient.waitForTransactionReceipt({
    hash: descentDeployHash,
  });
  descentAddress = descentReceipt.contractAddress!;

  // Deploy MockNFT contract
  const mockNftArtifact = JSON.parse(
    readFileSync("contracts/out/MockNFT.sol/MockNFT.json", "utf8")
  ) as { abi: any; bytecode: { object: Hex } };

  const mockNftDeployHash = await wallets[0].deployContract({
    abi: mockNftArtifact.abi,
    bytecode: mockNftArtifact.bytecode.object,
    args: [],
  });
  const mockNftReceipt = await publicClient.waitForTransactionReceipt({
    hash: mockNftDeployHash,
  });
  mockNftAddress = mockNftReceipt.contractAddress!;
});

afterAll(() => {
  if (node) node.kill();
});

describe("Descent integration on local anvil", () => {
  it("deploys correctly and verifies initial state", async () => {
    expect(descentAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(mockNftAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

    const minDur = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "MIN_DURATION",
    });
    const maxDur = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "MAX_DURATION",
    });
    const maxPage = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "MAX_PAGE",
    });

    expect(minDur).toBe(MIN_DURATION);
    expect(maxDur).toBe(MAX_DURATION);
    expect(maxPage).toBe(BigInt(MAX_PAGE));
  });

  it("checks priceAt equals currentPrice at 10 timestamps across a listing", async () => {
    // Mint token 1 to accounts[0]
    const mintHash = await wallets[0].writeContract({
      address: mockNftAddress,
      abi: [
        {
          type: "function",
          name: "mint",
          inputs: [
            { name: "to", type: "address" },
            { name: "tokenId", type: "uint256" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "mint",
      args: [accounts[0].address, 1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    // Approve descent
    const appHash = await wallets[0].writeContract({
      address: mockNftAddress,
      abi: erc721Abi,
      functionName: "approve",
      args: [descentAddress, 1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: appHash });

    // List token 1: start 1 BOT, floor 0.1 BOT, duration 1000 seconds
    const startPrice = parseEther("1");
    const floorPrice = parseEther("0.1");
    const duration = 1000n;

    const listHash = await wallets[0].writeContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "list",
      args: [mockNftAddress, 1n, startPrice, floorPrice, duration],
    });
    const listReceipt = await publicClient.waitForTransactionReceipt({ hash: listHash });
    const block = await publicClient.getBlock({ blockHash: listReceipt.blockHash });
    const startAt = block.timestamp;

    const listingParams = {
      startPrice,
      floorPrice,
      startAt,
      duration,
    };

    // Compare at 10 timestamps
    const timestamps = [
      startAt,
      startAt + 50n,
      startAt + 100n,
      startAt + 250n,
      startAt + 500n,
      startAt + 750n,
      startAt + 900n,
      startAt + 1000n,
      startAt + 1500n,
      startAt + 3000n,
    ];

    for (const t of timestamps) {
      await setNextBlockTimestamp(t);
      await mineBlock();

      const onChainPrice = await publicClient.readContract({
        address: descentAddress,
        abi: descentAbi,
        functionName: "currentPrice",
        args: [1n],
      });

      const offChainPrice = priceAt(listingParams, t);
      expect(onChainPrice).toBe(offChainPrice);
    }
  });

  it("buys with overpay, refunds difference, and transfers token", async () => {
    // Current price of listing 1 at t=startAt+3000 is floorPrice = 0.1 BOT
    const onChainPrice = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "currentPrice",
      args: [1n],
    });
    expect(onChainPrice).toBe(parseEther("0.1"));

    const overpay = parseEther("0.5");
    const buyer = accounts[1];
    const buyerBalBefore = await publicClient.getBalance({ address: buyer.address });

    const buyHash = await wallets[1].writeContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "buy",
      args: [1n],
      value: overpay,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
    const buyerBalAfter = await publicClient.getBalance({ address: buyer.address });

    // Buyer paid exactly onChainPrice + gas
    expect(buyerBalBefore - buyerBalAfter).toBe(onChainPrice + gasUsed);

    // Token transferred to buyer
    const newOwner = await publicClient.readContract({
      address: mockNftAddress,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [1n],
    });
    expect(newOwner.toLowerCase()).toBe(buyer.address.toLowerCase());

    // Seller accrued pending proceeds
    const sellerPending = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "pending",
      args: [accounts[0].address],
    });
    expect(sellerPending).toBe(onChainPrice);

    // Listing is now Sold
    const listing = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "listingOf",
      args: [1n],
    });
    expect(listing.state).toBe(1); // Sold
    expect(listing.buyer.toLowerCase()).toBe(buyer.address.toLowerCase());
    expect(listing.paid).toBe(onChainPrice);
  });

  it("reverts on underpay with PriceNotMet", async () => {
    // Mint token 2
    await wallets[0].writeContract({
      address: mockNftAddress,
      abi: [
        {
          type: "function",
          name: "mint",
          inputs: [
            { name: "to", type: "address" },
            { name: "tokenId", type: "uint256" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "mint",
      args: [accounts[0].address, 2n],
    });
    await wallets[0].writeContract({
      address: mockNftAddress,
      abi: erc721Abi,
      functionName: "approve",
      args: [descentAddress, 2n],
    });

    // List token 2
    await wallets[0].writeContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "list",
      args: [mockNftAddress, 2n, parseEther("1"), parseEther("0.5"), 1000n],
    });

    // Attempt to buy with underpayment
    let caught: unknown;
    try {
      await wallets[1].writeContract({
        address: descentAddress,
        abi: descentAbi,
        functionName: "buy",
        args: [2n],
        value: parseEther("0.1"),
      });
    } catch (e) {
      caught = e;
    }
    const details = revertDetails(caught);
    expect(details?.errorName).toBe("PriceNotMet");
  });

  it("allows seller to cancel, returns token, and prevents subsequent buy", async () => {
    // Token 2 is still active. Cancel listing 2.
    const cancelHash = await wallets[0].writeContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "cancel",
      args: [2n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cancelHash });

    // Token returned to seller
    const owner = await publicClient.readContract({
      address: mockNftAddress,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [2n],
    });
    expect(owner.toLowerCase()).toBe(accounts[0].address.toLowerCase());

    // Listing state is Cancelled
    const listing = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "listingOf",
      args: [2n],
    });
    expect(listing.state).toBe(2); // Cancelled

    // Buying now reverts NotActive
    let caught: unknown;
    try {
      await wallets[1].writeContract({
        address: descentAddress,
        abi: descentAbi,
        functionName: "buy",
        args: [2n],
        value: parseEther("2"),
      });
    } catch (e) {
      caught = e;
    }
    const details = revertDetails(caught);
    expect(details?.errorName).toBe("NotActive");
  });

  it("allows seller to withdraw proceeds and zeroes pending balance", async () => {
    const seller = accounts[0];
    const pendingBefore = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "pending",
      args: [seller.address],
    });
    expect(pendingBefore).toBeGreaterThan(0n);

    const balBefore = await publicClient.getBalance({ address: seller.address });
    const withdrawHash = await wallets[0].writeContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "withdraw",
      args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
    const balAfter = await publicClient.getBalance({ address: seller.address });

    expect(balAfter - balBefore).toBe(pendingBefore - gasUsed);

    const pendingAfter = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "pending",
      args: [seller.address],
    });
    expect(pendingAfter).toBe(0n);

    // Second withdraw reverts NothingToWithdraw
    let caught: unknown;
    try {
      await wallets[0].writeContract({
        address: descentAddress,
        abi: descentAbi,
        functionName: "withdraw",
        args: [],
      });
    } catch (e) {
      caught = e;
    }
    expect(revertDetails(caught)?.errorName).toBe("NothingToWithdraw");
  });

  it("verifies buyValue is always >= price even over 60s of drift", () => {
    const listing = {
      startPrice: parseEther("1"),
      floorPrice: parseEther("0.1"),
      startAt: 1000n,
      duration: 1000n,
    };

    // Since prices monotonically descend, priceAt(t + 60) <= priceAt(t) <= buyValue(priceAt(t))
    const pNow = priceAt(listing, 1200n);
    const p60Later = priceAt(listing, 1260n);
    const bv = buyValue(pNow);

    expect(bv).toBeGreaterThan(pNow);
    expect(bv).toBeGreaterThan(p60Later);
  });

  it("validates guard reverts for BadPrices, BadDuration, NotSeller", async () => {
    // BadPrices: start < floor
    let caught: unknown;
    try {
      await wallets[0].writeContract({
        address: descentAddress,
        abi: descentAbi,
        functionName: "list",
        args: [mockNftAddress, 999n, parseEther("0.1"), parseEther("0.5"), 1000n],
      });
    } catch (e) {
      caught = e;
    }
    expect(revertDetails(caught)?.errorName).toBe("BadPrices");

    // BadDuration: < MIN_DURATION (600s)
    caught = undefined;
    try {
      await wallets[0].writeContract({
        address: descentAddress,
        abi: descentAbi,
        functionName: "list",
        args: [mockNftAddress, 999n, parseEther("1"), parseEther("0.5"), 300n],
      });
    } catch (e) {
      caught = e;
    }
    expect(revertDetails(caught)?.errorName).toBe("BadDuration");

    // NotSeller: non-seller trying to cancel
    caught = undefined;
    try {
      await wallets[2].writeContract({
        address: descentAddress,
        abi: descentAbi,
        functionName: "cancel",
        args: [1n],
      });
    } catch (e) {
      caught = e;
    }
    expect(revertDetails(caught)?.errorName).toBe("NotSeller");
  });

  it("queries latest listings and listingsBy", async () => {
    // We already listed 1 and 2
    const allLatest = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "latest",
      args: [0n, 10n, false],
    });
    expect(allLatest.length).toBe(2);
    // Newest first
    expect(allLatest[0].id).toBe(2n);
    expect(allLatest[1].id).toBe(1n);

    // Active only: 1 is Sold, 2 is Cancelled, so 0 active
    const activeLatest = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "latest",
      args: [0n, 10n, true],
    });
    expect(activeLatest.length).toBe(0);

    // listingsBy
    const sellerListings = await publicClient.readContract({
      address: descentAddress,
      abi: descentAbi,
      functionName: "listingsBy",
      args: [accounts[0].address],
    });
    expect(sellerListings).toEqual([1n, 2n]);
  });
});
