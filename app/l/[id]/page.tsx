"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import PriceTicker from "@/components/descent/PriceTicker";
import BotChainGate from "@/components/botchain/BotChainGate";
import { useToast } from "@/components/ui/Toast";
import { descentAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { useChainId } from "wagmi";
import {
  buyValue,
  nftMeta,
  priceAt,
  progress,
  ratePerMinute,
  useTicker,
  type ListingView,
  type NftMeta,
} from "@/lib/descent";
import { describeError } from "@/lib/errors";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ListingDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const listingId = BigInt(resolvedParams.id);

  const chainId = useChainId();
  const contract = isBotChainId(chainId) ? getDeployment(chainId).address : undefined;
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const { toast } = useToast();
  const nowSec = useTicker();

  // Read listing metadata from contract
  const {
    data: rawListing,
    isLoading,
    error: readError,
    refetch,
  } = useReadContract({
    address: contract,
    abi: descentAbi,
    functionName: "listingOf",
    args: [listingId],
    query: {
      enabled: Boolean(contract),
      refetchInterval: 5_000,
    },
  });

  const listing = rawListing as ListingView | undefined;

  // Metadata state
  const [meta, setMeta] = useState<NftMeta>({
    name: `#${listing?.tokenId?.toString() ?? resolvedParams.id}`,
    image: "",
  });
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const client = publicClientRef.current;
    if (!client || !listing?.nft || listing?.tokenId === undefined) return;

    nftMeta(client, listing.nft, listing.tokenId).then((m) => {
      if (!cancelled) setMeta(m);
    });

    return () => {
      cancelled = true;
    };
  }, [listing?.nft, listing?.tokenId]);

  // Transaction states
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [txStage, setTxStage] = useState<"idle" | "signing" | "pending" | "confirmed" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txAction, setTxAction] = useState<"buy" | "cancel">("buy");

  const settledRef = useRef<Record<string, boolean>>({});

  const { isSuccess: receiptSuccess, isError: receiptError, data: receipt } =
    useWaitForTransactionReceipt({
      hash: txHash ?? undefined,
    });

  useEffect(() => {
    if (!txHash) return;
    if (settledRef.current[txHash]) return;

    if (receiptSuccess) {
      settledRef.current[txHash] = true;
      setTxStage("confirmed");
      toast("success", txAction === "buy" ? "NFT PURCHASED!" : "LISTING CANCELLED!");
      refetch();
    } else if (receiptError) {
      settledRef.current[txHash] = true;
      setTxStage("error");
      setTxError("TRANSACTION FAILED ON CHAIN.");
      toast("error", "TRANSACTION FAILED.");
    }
  }, [txHash, receiptSuccess, receiptError, txAction, toast, refetch]);

  // Buy action
  const handleBuy = async () => {
    if (!contract || !listing) return;
    setTxError(null);
    setTxStage("signing");
    setTxAction("buy");

    try {
      const curPrice = priceAt(listing, nowSec);
      const val = buyValue(curPrice);

      const hash = await writeContractAsync({
        address: contract,
        abi: descentAbi,
        functionName: "buy",
        args: [listingId],
        value: val,
      });

      setTxHash(hash);
      setTxStage("pending");
      toast("info", "TRANSACTION SUBMITTED.");
    } catch (err) {
      const msg = describeError(err);
      setTxError(msg);
      setTxStage("error");
      toast("error", msg);
    }
  };

  // Cancel action
  const handleCancel = async () => {
    if (!contract || !listing) return;
    setTxError(null);
    setTxStage("signing");
    setTxAction("cancel");

    try {
      const hash = await writeContractAsync({
        address: contract,
        abi: descentAbi,
        functionName: "cancel",
        args: [listingId],
      });

      setTxHash(hash);
      setTxStage("pending");
      toast("info", "CANCELLATION SUBMITTED.");
    } catch (err) {
      const msg = describeError(err);
      setTxError(msg);
      setTxStage("error");
      toast("error", msg);
    }
  };

  const isSeller = Boolean(
    address && listing && address.toLowerCase() === listing.seller.toLowerCase()
  );
  const isActive = listing?.state === 0;
  const isSold = listing?.state === 1;
  const isCancelled = listing?.state === 2;

  const currentPrice = useMemo(() => {
    if (!listing) return 0n;
    if (isSold) return listing.paid ?? listing.floorPrice;
    if (isCancelled) return listing.floorPrice;
    return priceAt(listing, nowSec);
  }, [listing, isSold, isCancelled, nowSec]);

  const liveRate = useMemo(() => {
    if (!listing) return 0n;
    return ratePerMinute(listing);
  }, [listing]);

  const pct = useMemo(() => {
    if (!listing) return 0;
    return progress(listing, nowSec);
  }, [listing, nowSec]);

  return (
    <PageShell>
      {isLoading ? (
        <div className="py-24 text-center font-mono text-sm uppercase font-black text-[#0A0A0A]">
          LOADING POSTER #{resolvedParams.id}…
        </div>
      ) : readError || !listing ? (
        <Panel banner="NOT FOUND">
          <div className="text-center py-10 space-y-4">
            <h2 className="font-poster text-5xl font-black text-[#FF2E00]">
              LISTING NOT FOUND.
            </h2>
            <p className="font-mono text-xs uppercase font-bold text-[#3A3A0A]">
              NO ACTIVE OR ARCHIVED AUCTION FOR ID #{resolvedParams.id}.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-[#0A0A0A] text-[#F7E600] font-mono text-xs font-black uppercase tracking-widest border-2 border-[#0A0A0A]"
            >
              RETURN TO WALL →
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="space-y-8 pb-28 md:pb-12">
          {/* Confirmed State Notification Banner (stage === 'confirmed' ordered first) */}
          {txStage === "confirmed" && (
            <div className="border-4 border-[#0A0A0A] bg-[#FFFFFF] p-6 shadow-[6px_6px_0_#0A0A0A]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="font-mono text-xs font-black bg-[#0A0A0A] text-[#F7E600] px-2 py-0.5 uppercase">
                    CONFIRMED ON CHAIN
                  </span>
                  <h3 className="font-poster text-3xl sm:text-4xl font-black text-[#0A0A0A] mt-2">
                    {txAction === "buy" ? "YOU WON THE AUCTION!" : "LISTING CANCELLED."}
                  </h3>
                  {receipt?.transactionHash && (
                    <p className="font-mono text-xs text-[#3A3A0A] mt-1 break-all">
                      TX: {receipt.transactionHash}
                    </p>
                  )}
                </div>
                <Link
                  href="/"
                  className="px-6 py-3 bg-[#0A0A0A] text-[#F7E600] font-mono text-xs font-black uppercase tracking-widest border-2 border-[#0A0A0A] hover:bg-[#FFFFFF] hover:text-[#0A0A0A]"
                >
                  RETURN TO WALL →
                </Link>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {txStage === "error" && txError && (
            <div className="border-4 border-[#0A0A0A] bg-[#FF2E00] text-[#0A0A0A] p-4 shadow-[4px_4px_0_#0A0A0A] font-mono text-xs uppercase font-black">
              {txError}
            </div>
          )}

          {/* Main Poster Layout: 2 Columns on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: NFT Image Frame (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div
                className={[
                  "w-full aspect-square border-4 border-[#0A0A0A] bg-[#FFFFFF] shadow-[8px_8px_0_#0A0A0A] relative overflow-hidden flex items-center justify-center",
                  isSold ? "grayscale" : "",
                ].join(" ")}
              >
                {meta.image && !imageError ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={meta.image}
                    alt={meta.name}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="p-8 text-center">
                    <span className="font-poster text-6xl font-black text-[#0A0A0A] block">
                      {meta.name}
                    </span>
                    <span className="font-mono text-xs uppercase text-[#3A3A0A] mt-3 block border-t-2 border-[#0A0A0A] pt-2">
                      TOKEN #{listing.tokenId.toString()}
                    </span>
                  </div>
                )}

                {/* Big Stamp on Sold or Withdrawn */}
                {isSold && (
                  <div className="absolute inset-0 bg-[#0A0A0A]/85 flex items-center justify-center p-6">
                    <span className="border-4 border-[#FF2E00] text-[#FF2E00] font-poster text-7xl font-black uppercase px-8 py-3 rotate-[-10deg] bg-[#0A0A0A] shadow-[8px_8px_0_#FF2E00]">
                      SOLD
                    </span>
                  </div>
                )}
                {isCancelled && (
                  <div className="absolute inset-0 bg-[#0A0A0A]/85 flex items-center justify-center p-6">
                    <span className="border-4 border-[#FFFFFF] text-[#FFFFFF] font-poster text-5xl font-black uppercase px-6 py-3 rotate-[8deg] bg-[#0A0A0A] shadow-[6px_6px_0_#FFFFFF]">
                      WITHDRAWN
                    </span>
                  </div>
                )}
              </div>

              {/* Token Identification Info */}
              <div className="border-4 border-[#0A0A0A] bg-[#FFFFFF] p-4 shadow-[4px_4px_0_#0A0A0A] space-y-1 text-xs font-mono">
                <div className="flex justify-between border-b border-[#0A0A0A] pb-1">
                  <span className="font-bold text-[#3A3A0A]">ITEM</span>
                  <span className="font-black text-[#0A0A0A]">#{listing.id.toString()}</span>
                </div>
                <div className="flex justify-between border-b border-[#0A0A0A] py-1">
                  <span className="font-bold text-[#3A3A0A]">TOKEN ID</span>
                  <span className="font-black text-[#0A0A0A]">#{listing.tokenId.toString()}</span>
                </div>
                <div className="flex justify-between border-b border-[#0A0A0A] py-1">
                  <span className="font-bold text-[#3A3A0A]">CONTRACT</span>
                  <span className="font-black text-[#0A0A0A] truncate max-w-[160px]">
                    {listing.nft}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="font-bold text-[#3A3A0A]">SELLER</span>
                  <span className="font-black text-[#0A0A0A] truncate max-w-[160px]">
                    {listing.seller}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Live Falling Price & Actions (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <Panel
                banner={
                  <div className="flex justify-between items-center text-xs font-mono font-black">
                    <span>
                      {isSold
                        ? "AUCTION CLOSED"
                        : isCancelled
                        ? "LISTING CANCELLED"
                        : "LIVE DUTCH AUCTION"}
                    </span>
                    <span>{pct.toFixed(0)}% TO FLOOR</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  {/* Title & Headline */}
                  <div>
                    <h1 className="font-poster text-4xl sm:text-6xl font-black text-[#0A0A0A] tracking-tight">
                      {meta.name}
                    </h1>
                    <p className="font-mono text-xs sm:text-sm text-[#3A3A0A] uppercase mt-1">
                      LISTED AT BLOCK #{listing.createdBlock} · STARTED AT{" "}
                      {formatEther(listing.startPrice)} BOT
                    </p>
                  </div>

                  {/* Price Ticker */}
                  <PriceTicker listing={listing} />

                  {/* Rate Helper */}
                  {isActive && (
                    <div className="p-3 border-2 border-[#0A0A0A] bg-[#F7E600] text-[#0A0A0A] font-mono text-xs font-bold uppercase space-y-1">
                      <p>PAY NOW, OR WAIT. IT&apos;S FALLING {formatEther(liveRate)} BOT/MIN.</p>
                      <p className="text-[11px] text-[#3A3A0A]">
                        YOU PAY THE LIVE PRICE AT CONFIRMATION. ANY EXTRA IS RETURNED.
                      </p>
                    </div>
                  )}

                  {/* Sold Details */}
                  {isSold && (
                    <div className="p-4 border-2 border-[#0A0A0A] bg-[#FFFFFF] space-y-2 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="font-bold text-[#3A3A0A]">PURCHASED BY</span>
                        <span className="font-black text-[#0A0A0A] truncate max-w-[200px]">
                          {listing.buyer}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-bold text-[#3A3A0A]">FINAL PRICE PAID</span>
                        <span className="font-black text-[#0A0A0A]">
                          {formatEther(listing.paid)} BOT
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Desktop Action Buttons */}
                  <div className="hidden md:block pt-4 border-t-4 border-[#0A0A0A]">
                    {isActive ? (
                      <div className="space-y-3">
                        <BotChainGate
                          noWalletNote="CONNECT A WALLET TO BUY THIS PIECE AT THE CURRENT LIVE PRICE."
                        >
                          <Button
                            variant="slab"
                            size="giant"
                            onClick={handleBuy}
                            busy={txStage === "signing" || txStage === "pending"}
                          >
                            BUY NOW FOR {formatEther(currentPrice)} BOT
                          </Button>
                        </BotChainGate>

                        {isSeller && (
                          <Button
                            variant="outline"
                            size="md"
                            onClick={handleCancel}
                            busy={txStage === "signing" || txStage === "pending"}
                            className="w-full"
                          >
                            CANCEL LISTING & RETRIEVE TOKEN
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="py-4 text-center font-mono text-xs uppercase font-black text-[#3A3A0A] border-2 border-[#0A0A0A] bg-[#FFFFFF]">
                        THIS AUCTION HAS ENDED
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Limits and Rules Poster Card */}
              <div className="border-4 border-[#0A0A0A] bg-[#FFFFFF] p-4 shadow-[4px_4px_0_#0A0A0A] text-xs font-mono font-bold uppercase space-y-2 text-[#0A0A0A]">
                <span className="text-[#FF2E00] font-black">RULES OF THE DESCENT:</span>
                <ul className="list-disc list-inside space-y-1 text-[#3A3A0A]">
                  <li>NO BIDS. PRICE ONLY FALLS. FIRST PAYER WINS.</li>
                  <li>SALES ARE FINAL. NO REFUND OR SWAP-BACK.</li>
                  <li>AFTER THE DURATION THE PRICE STAYS AT FLOOR UNTIL BOUGHT.</li>
                  <li>SELLER CAN CANCEL BEFORE SALE — BUYER LOSES THAT RACE.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Mobile Fixed Bottom Slab for BUY NOW */}
          {isActive && (
            <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 bg-[#F7E600] border-t-4 border-[#0A0A0A] z-50 shadow-[0_-4px_0_#0A0A0A]">
              <BotChainGate noWalletNote="CONNECT WALLET TO BUY.">
                <Button
                  variant="slab"
                  size="giant"
                  onClick={handleBuy}
                  busy={txStage === "signing" || txStage === "pending"}
                >
                  BUY NOW · {formatEther(currentPrice)} BOT
                </Button>
              </BotChainGate>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
