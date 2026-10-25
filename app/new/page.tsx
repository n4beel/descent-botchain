"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther, parseEther, parseEventLogs } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import BotChainGate from "@/components/botchain/BotChainGate";
import { useToast } from "@/components/ui/Toast";
import { descentAbi } from "@/lib/botchain/abi";
import { erc721Abi } from "@/lib/erc721";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { curve, nftMeta, type NftMeta } from "@/lib/descent";
import { describeError } from "@/lib/errors";
import { MAX_DURATION, MIN_DURATION } from "@/lib/limits";

export default function NewListingPage() {
  const { push } = useRouter();
  const pushRef = useRef(push);
  pushRef.current = push;

  const chainId = useChainId();
  const contract = isBotChainId(chainId) ? getDeployment(chainId).address : undefined;
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const { toast } = useToast();

  // Form inputs
  const [nftAddress, setNftAddress] = useState<string>("");
  const [tokenIdInput, setTokenIdInput] = useState<string>("");
  const [startPriceInput, setStartPriceInput] = useState<string>("1.0");
  const [floorPriceInput, setFloorPriceInput] = useState<string>("0.1");
  const [durationHours, setDurationHours] = useState<string>("24");

  // Token ownership & approval states
  const [tokenOwner, setTokenOwner] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [checkingOwner, setCheckingOwner] = useState<boolean>(false);
  const [meta, setMeta] = useState<NftMeta | null>(null);

  // Transaction states
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [txStage, setTxStage] = useState<"idle" | "signing" | "pending" | "confirmed" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState<"approve" | "list">("list");
  const [createdListingId, setCreatedListingId] = useState<bigint | null>(null);

  const settledRef = useRef<Record<string, boolean>>({});

  const { isSuccess: receiptSuccess, isError: receiptError, data: receipt } =
    useWaitForTransactionReceipt({
      hash: txHash ?? undefined,
    });

  // Verify token owner, metadata, and approval
  useEffect(() => {
    let cancelled = false;
    const client = publicClientRef.current;
    if (!client || !nftAddress.startsWith("0x") || nftAddress.length !== 42 || !tokenIdInput) {
      setTokenOwner(null);
      setMeta(null);
      setIsApproved(false);
      return;
    }

    let id: bigint;
    try {
      id = BigInt(tokenIdInput);
    } catch {
      return;
    }

    setCheckingOwner(true);
    const check = async () => {
      try {
        const owner = await client.readContract({
          address: nftAddress as `0x${string}`,
          abi: erc721Abi,
          functionName: "ownerOf",
          args: [id],
        });

        if (cancelled) return;
        setTokenOwner(owner);

        // Check metadata
        const m = await nftMeta(client, nftAddress as `0x${string}`, id);
        if (cancelled) return;
        setMeta(m);

        // Check approval if contract is deployed
        if (contract && address) {
          const approvedAddr = await client.readContract({
            address: nftAddress as `0x${string}`,
            abi: erc721Abi,
            functionName: "getApproved",
            args: [id],
          });
          const allApproved = await client.readContract({
            address: nftAddress as `0x${string}`,
            abi: erc721Abi,
            functionName: "isApprovedForAll",
            args: [address, contract],
          });

          if (cancelled) return;
          setIsApproved(
            approvedAddr.toLowerCase() === contract.toLowerCase() || allApproved
          );
        }
      } catch {
        if (!cancelled) {
          setTokenOwner(null);
          setMeta(null);
          setIsApproved(false);
        }
      } finally {
        if (!cancelled) setCheckingOwner(false);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [nftAddress, tokenIdInput, contract, address]);

  // Handle receipt confirmation
  useEffect(() => {
    if (!txHash) return;
    if (settledRef.current[txHash]) return;

    if (receiptSuccess) {
      settledRef.current[txHash] = true;
      setTxStage("confirmed");

      if (currentAction === "approve") {
        setIsApproved(true);
        toast("success", "TOKEN APPROVED FOR DESCENT!");
      } else {
        toast("success", "AUCTION CREATED!");
        // Look for Listed event in logs
        if (receipt && receipt.logs && receipt.logs.length > 0) {
          try {
            const parsed = parseEventLogs({
              abi: descentAbi,
              logs: receipt.logs,
              eventName: "Listed",
            });
            if (parsed.length > 0 && parsed[0].args.id !== undefined) {
              const id = parsed[0].args.id;
              setCreatedListingId(id);
              pushRef.current(`/l/${id.toString()}`);
            }
          } catch {
            // Fallback: stay on page or navigate to wall
          }
        }
      }
    } else if (receiptError) {
      settledRef.current[txHash] = true;
      setTxStage("error");
      setTxError("TRANSACTION REVERTED ON CHAIN.");
      toast("error", "TRANSACTION FAILED.");
    }
  }, [txHash, receiptSuccess, receiptError, currentAction, receipt, contract, toast]);

  // Handle Approve
  const handleApprove = async () => {
    if (!contract || !nftAddress || !tokenIdInput) return;
    setTxError(null);
    setTxStage("signing");
    setCurrentAction("approve");

    try {
      const hash = await writeContractAsync({
        address: nftAddress as `0x${string}`,
        abi: erc721Abi,
        functionName: "approve",
        args: [contract, BigInt(tokenIdInput)],
      });

      setTxHash(hash);
      setTxStage("pending");
      toast("info", "APPROVAL SUBMITTED.");
    } catch (err) {
      const msg = describeError(err);
      setTxError(msg);
      setTxStage("error");
      toast("error", msg);
    }
  };

  // Handle List
  const handleList = async () => {
    if (!contract || !nftAddress || !tokenIdInput) return;
    setTxError(null);
    setTxStage("signing");
    setCurrentAction("list");

    try {
      const start = parseEther(startPriceInput);
      const floor = parseEther(floorPriceInput);
      const durationSec = BigInt(Math.round(parseFloat(durationHours) * 3600));

      if (durationSec < MIN_DURATION || durationSec > MAX_DURATION) {
        throw new Error("BadDuration");
      }
      if (floor <= 0n || start < floor) {
        throw new Error("BadPrices");
      }

      const hash = await writeContractAsync({
        address: contract,
        abi: descentAbi,
        functionName: "list",
        args: [
          nftAddress as `0x${string}`,
          BigInt(tokenIdInput),
          start,
          floor,
          durationSec,
        ],
      });

      setTxHash(hash);
      setTxStage("pending");
      toast("info", "LISTING TRANSACTION SUBMITTED.");
    } catch (err) {
      const msg = describeError(err);
      setTxError(msg);
      setTxStage("error");
      toast("error", msg);
    }
  };

  const isOwner = Boolean(
    address && tokenOwner && address.toLowerCase() === tokenOwner.toLowerCase()
  );

  // Compute preview curve
  const previewCurve = useMemo(() => {
    try {
      const start = parseEther(startPriceInput || "0");
      const floor = parseEther(floorPriceInput || "0");
      const durationSec = Math.round(parseFloat(durationHours || "1") * 3600);
      if (start < floor || durationSec <= 0) return [];
      return curve(
        {
          startPrice: start,
          floorPrice: floor,
          startAt: 0,
          duration: durationSec,
        },
        5
      );
    } catch {
      return [];
    }
  }, [startPriceInput, floorPriceInput, durationHours]);

  return (
    <PageShell>
      <div className="max-w-[800px] mx-auto space-y-8">
        <div>
          <h1 className="font-poster text-5xl sm:text-6xl font-black uppercase text-[#0A0A0A] tracking-tight">
            START A DESCENT
          </h1>
          <p className="font-mono text-xs sm:text-sm uppercase font-bold text-[#3A3A0A] mt-1">
            ESCROW AN ERC-721 PIECE. SET START, FLOOR, AND DURATION. THE NUMBER DROPS CONTINUOUSLY.
          </p>
        </div>

        {/* Confirmed Notice (stage === 'confirmed' ordered first) */}
        {txStage === "confirmed" && createdListingId && (
          <div className="border-4 border-[#0A0A0A] bg-[#FFFFFF] p-6 shadow-[6px_6px_0_#0A0A0A] space-y-4">
            <span className="font-mono text-xs font-black bg-[#0A0A0A] text-[#F7E600] px-2 py-0.5 uppercase">
              CONFIRMED ON CHAIN
            </span>
            <h2 className="font-poster text-4xl font-black text-[#0A0A0A]">
              POSTER #{createdListingId.toString()} IS LIVE!
            </h2>
            <p className="font-mono text-xs uppercase font-bold text-[#3A3A0A]">
              PRICE IS ALREADY TICKING DOWN ON THE WALL.
            </p>
            <Button
              variant="slab"
              size="lg"
              onClick={() => push(`/l/${createdListingId}`)}
            >
              GO TO POSTER PAGE →
            </Button>
          </div>
        )}

        {/* Error Notice */}
        {txStage === "error" && txError && (
          <div className="border-4 border-[#0A0A0A] bg-[#FF2E00] text-[#0A0A0A] p-4 shadow-[4px_4px_0_#0A0A0A] font-mono text-xs uppercase font-black">
            {txError}
          </div>
        )}

        <BotChainGate noWalletNote="CONNECT YOUR WALLET TO LIST AN NFT FOR DUTCH AUCTION.">
          <Panel banner="LISTING PARAMETERS">
            <div className="space-y-6">
              {/* NFT Contract & Token ID */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-mono text-xs font-black uppercase text-[#0A0A0A]">
                    ERC-721 CONTRACT ADDRESS
                  </label>
                  <input
                    type="text"
                    placeholder="0x…"
                    value={nftAddress}
                    onChange={(e) => setNftAddress(e.target.value.trim())}
                    className="w-full p-3 border-4 border-[#0A0A0A] bg-[#FFFFFF] font-mono text-xs font-bold text-[#0A0A0A] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-xs font-black uppercase text-[#0A0A0A]">
                    TOKEN ID
                  </label>
                  <input
                    type="text"
                    placeholder="1"
                    value={tokenIdInput}
                    onChange={(e) => setTokenIdInput(e.target.value.trim())}
                    className="w-full p-3 border-4 border-[#0A0A0A] bg-[#FFFFFF] font-mono text-xs font-bold text-[#0A0A0A] focus:outline-none"
                  />
                </div>
              </div>

              {/* Ownership & Metadata Preview */}
              {checkingOwner ? (
                <div className="p-3 border-2 border-[#0A0A0A] bg-[#F7E600] text-xs font-mono font-bold uppercase">
                  VERIFYING ON-CHAIN OWNERSHIP…
                </div>
              ) : tokenOwner ? (
                <div className="p-4 border-2 border-[#0A0A0A] bg-[#FFFFFF] space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#3A3A0A]">TOKEN OWNER</span>
                    <span
                      className={[
                        "font-black",
                        isOwner ? "text-[#0A0A0A] bg-[#F7E600] px-2 py-0.5" : "text-[#FF2E00]",
                      ].join(" ")}
                    >
                      {isOwner ? "YOU OWN THIS TOKEN" : "NOT OWNED BY CONNECTED WALLET"}
                    </span>
                  </div>

                  {meta && (
                    <div className="flex items-center gap-4 border-t-2 border-[#0A0A0A] pt-3">
                      {meta.image && (
                        <div className="w-16 h-16 border-2 border-[#0A0A0A] bg-[#F7E600] overflow-hidden flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={meta.image}
                            alt={meta.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div>
                        <h4 className="font-poster text-2xl font-black text-[#0A0A0A]">
                          {meta.name}
                        </h4>
                        <p className="font-mono text-[11px] text-[#3A3A0A] uppercase">
                          READY TO BE ESCROWED IN DESCENT
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Price & Duration Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t-2 border-[#0A0A0A] pt-6">
                <div className="space-y-1">
                  <label className="font-mono text-xs font-black uppercase text-[#0A0A0A]">
                    START PRICE (BOT)
                  </label>
                  <input
                    type="text"
                    value={startPriceInput}
                    onChange={(e) => setStartPriceInput(e.target.value)}
                    className="w-full p-3 border-4 border-[#0A0A0A] bg-[#FFFFFF] font-mono text-base font-black text-[#FF2E00] focus:outline-none"
                  />
                  <span className="font-mono text-[10px] text-[#3A3A0A] uppercase">
                    INITIAL PRICE AT BLOCK T=0
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-xs font-black uppercase text-[#0A0A0A]">
                    FLOOR PRICE (BOT)
                  </label>
                  <input
                    type="text"
                    value={floorPriceInput}
                    onChange={(e) => setFloorPriceInput(e.target.value)}
                    className="w-full p-3 border-4 border-[#0A0A0A] bg-[#FFFFFF] font-mono text-base font-black text-[#0A0A0A] focus:outline-none"
                  />
                  <span className="font-mono text-[10px] text-[#3A3A0A] uppercase">
                    MINIMUM FINAL PRICE
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-xs font-black uppercase text-[#0A0A0A]">
                    DURATION (HOURS)
                  </label>
                  <input
                    type="text"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    className="w-full p-3 border-4 border-[#0A0A0A] bg-[#FFFFFF] font-mono text-base font-black text-[#0A0A0A] focus:outline-none"
                  />
                  <span className="font-mono text-[10px] text-[#3A3A0A] uppercase">
                    10 MIN (0.17H) TO 30 DAYS (720H)
                  </span>
                </div>
              </div>

              {/* Descent Preview Curve */}
              {previewCurve.length > 0 && (
                <div className="p-4 border-4 border-[#0A0A0A] bg-[#FFFFFF] space-y-2">
                  <span className="font-mono text-xs font-black uppercase text-[#0A0A0A]">
                    DESCENT PREVIEW CURVE
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 text-center">
                    {previewCurve.map((pt, i) => (
                      <div
                        key={i}
                        className="p-2 border-2 border-[#0A0A0A] bg-[#F7E600] font-mono text-xs"
                      >
                        <div className="font-bold text-[#3A3A0A]">{pt.progress}%</div>
                        <div className="font-black text-[#0A0A0A] mt-1">
                          {formatEther(pt.price)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Buttons: Step 1 (Approve) & Step 2 (List) */}
              <div className="pt-4 border-t-4 border-[#0A0A0A] space-y-3">
                {!isApproved ? (
                  <Button
                    variant="slab"
                    size="giant"
                    onClick={handleApprove}
                    disabled={!isOwner}
                    busy={txStage === "signing" || txStage === "pending"}
                  >
                    STEP 1: APPROVE TOKEN
                  </Button>
                ) : (
                  <Button
                    variant="slab"
                    size="giant"
                    onClick={handleList}
                    disabled={!isOwner}
                    busy={txStage === "signing" || txStage === "pending"}
                  >
                    STEP 2: LIST IT
                  </Button>
                )}
                {!isOwner && tokenOwner && (
                  <p className="font-mono text-xs uppercase font-black text-[#FF2E00] text-center">
                    YOU DO NOT OWN THIS TOKEN. SWITCH TO THE HOLDER WALLET.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        </BotChainGate>
      </div>
    </PageShell>
  );
}
