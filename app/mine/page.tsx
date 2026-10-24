"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import BotChainGate from "@/components/botchain/BotChainGate";
import ListingPoster from "@/components/descent/ListingPoster";
import { useToast } from "@/components/ui/Toast";
import { descentAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { type ListingView } from "@/lib/descent";
import { describeError } from "@/lib/errors";

export default function MyListingsPage() {
  const chainId = useChainId();
  const contract = isBotChainId(chainId) ? getDeployment(chainId).address : undefined;
  const { address } = useAccount();
  const { toast } = useToast();

  // Read listings created by user
  const { data: myIds, refetch: refetchMyIds } = useReadContract({
    address: contract,
    abi: descentAbi,
    functionName: "listingsBy",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(contract && address),
      refetchInterval: 5_000,
    },
  });

  // Read all listings to filter user's items
  const { data: rawListings, refetch: refetchAll } = useReadContract({
    address: contract,
    abi: descentAbi,
    functionName: "latest",
    args: [0n, 50n, false],
    query: {
      enabled: Boolean(contract),
      refetchInterval: 5_000,
    },
  });

  // Read seller proceeds
  const { data: pendingBalance, refetch: refetchPending } = useReadContract({
    address: contract,
    abi: descentAbi,
    functionName: "pending",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(contract && address),
      refetchInterval: 5_000,
    },
  });

  const listings = (rawListings as ListingView[] | undefined) ?? [];
  const ids = (myIds as bigint[] | undefined) ?? [];

  const myListings = listings.filter((l) =>
    ids.some((id) => id === l.id) || (address && l.seller.toLowerCase() === address.toLowerCase())
  );

  // Withdraw transaction
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [txStage, setTxStage] = useState<"idle" | "signing" | "pending" | "confirmed" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const settledRef = useRef<Record<string, boolean>>({});

  const { isSuccess: receiptSuccess, isError: receiptError } =
    useWaitForTransactionReceipt({
      hash: txHash ?? undefined,
    });

  useEffect(() => {
    if (!txHash) return;
    if (settledRef.current[txHash]) return;

    if (receiptSuccess) {
      settledRef.current[txHash] = true;
      setTxStage("confirmed");
      toast("success", "PROCEEDS WITHDRAWN TO YOUR WALLET!");
      refetchPending();
      refetchMyIds();
      refetchAll();
    } else if (receiptError) {
      settledRef.current[txHash] = true;
      setTxStage("error");
      setTxError("WITHDRAWAL REVERTED ON CHAIN.");
      toast("error", "WITHDRAWAL FAILED.");
    }
  }, [txHash, receiptSuccess, receiptError, toast, refetchPending, refetchMyIds, refetchAll]);

  const handleWithdraw = async () => {
    if (!contract) return;
    setTxError(null);
    setTxStage("signing");

    try {
      const hash = await writeContractAsync({
        address: contract,
        abi: descentAbi,
        functionName: "withdraw",
        args: [],
      });

      setTxHash(hash);
      setTxStage("pending");
      toast("info", "WITHDRAWAL SUBMITTED.");
    } catch (err) {
      const msg = describeError(err);
      setTxError(msg);
      setTxStage("error");
      toast("error", msg);
    }
  };

  const pendingAmount = pendingBalance ?? 0n;

  return (
    <PageShell>
      <div className="space-y-8">
        <div>
          <h1 className="font-poster text-5xl sm:text-6xl font-black uppercase text-[#0A0A0A] tracking-tight">
            MY ITEMS & PROCEEDS
          </h1>
          <p className="font-mono text-xs sm:text-sm uppercase font-bold text-[#3A3A0A] mt-1">
            MANAGE YOUR ACTIVE LISTINGS AND COLLECT PROCEEDS FROM COMPLETED SALES.
          </p>
        </div>

        {/* Confirmed Notice (stage === 'confirmed' ordered first) */}
        {txStage === "confirmed" && (
          <div className="border-4 border-[#0A0A0A] bg-[#FFFFFF] p-5 shadow-[6px_6px_0_#0A0A0A]">
            <span className="font-mono text-xs font-black bg-[#0A0A0A] text-[#F7E600] px-2 py-0.5 uppercase">
              CONFIRMED ON CHAIN
            </span>
            <h3 className="font-poster text-3xl font-black text-[#0A0A0A] mt-1">
              PROCEEDS TRANSFERRED!
            </h3>
          </div>
        )}

        {/* Error Notice */}
        {txStage === "error" && txError && (
          <div className="border-4 border-[#0A0A0A] bg-[#FF2E00] text-[#0A0A0A] p-4 shadow-[4px_4px_0_#0A0A0A] font-mono text-xs uppercase font-black">
            {txError}
          </div>
        )}

        <BotChainGate noWalletNote="CONNECT YOUR WALLET TO VIEW YOUR LISTINGS AND PROCEEDS.">
          {/* Proceeds Section */}
          <Panel banner="PROCEEDS COLLECTOR">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <span className="font-mono text-xs font-bold uppercase text-[#3A3A0A]">
                  AVAILABLE PROCEEDS TO CLAIM
                </span>
                <div className="poster-numeral text-5xl sm:text-7xl mt-1">
                  {formatEther(pendingAmount)}{" "}
                  <span className="font-mono text-2xl text-[#0A0A0A]">BOT</span>
                </div>
                <p className="font-mono text-[11px] text-[#3A3A0A] uppercase mt-1">
                  REVENUE FROM COMPLETED DUTCH AUCTIONS IS HELD HERE UNTIL WITHDRAWN.
                </p>
              </div>

              <div>
                <Button
                  variant="slab"
                  size="lg"
                  onClick={handleWithdraw}
                  disabled={pendingAmount === 0n}
                  busy={txStage === "signing" || txStage === "pending"}
                >
                  WITHDRAW {formatEther(pendingAmount)} BOT
                </Button>
              </div>
            </div>
          </Panel>

          {/* My Listings Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b-4 border-[#0A0A0A] pb-2">
              <h2 className="font-poster text-3xl sm:text-4xl font-black uppercase text-[#0A0A0A]">
                YOUR POSTERS ({myListings.length})
              </h2>
              <Link
                href="/new"
                className="px-4 py-1.5 bg-[#0A0A0A] text-[#F7E600] font-mono text-xs font-black uppercase border-2 border-[#0A0A0A]"
              >
                + LIST NEW PIECE
              </Link>
            </div>

            {myListings.length === 0 ? (
              <div className="py-12 text-center border-4 border-[#0A0A0A] bg-[#FFFFFF] p-6 shadow-[4px_4px_0_#0A0A0A]">
                <p className="font-mono text-xs uppercase font-bold text-[#3A3A0A]">
                  YOU HAVE NOT LISTED ANY ITEMS YET.
                </p>
                <div className="mt-4">
                  <Link
                    href="/new"
                    className="inline-block px-6 py-2.5 bg-[#0A0A0A] text-[#F7E600] font-mono text-xs font-black uppercase border-2 border-[#0A0A0A]"
                  >
                    START A DESCENT →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {myListings.map((listing) => (
                  <ListingPoster key={listing.id.toString()} listing={listing} />
                ))}
              </div>
            )}
          </div>
        </BotChainGate>
      </div>
    </PageShell>
  );
}
