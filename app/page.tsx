"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useChainId, useReadContract } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import ListingPoster from "@/components/descent/ListingPoster";
import Panel from "@/components/ui/Panel";
import { descentAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { progress, useTicker, type ListingView } from "@/lib/descent";

type FilterTab = "live" | "sold" | "all";

export default function Home() {
  const chainId = useChainId();
  const contract = isBotChainId(chainId) ? getDeployment(chainId).address : undefined;
  const nowSec = useTicker();
  const [filter, setFilter] = useState<FilterTab>("live");

  const { data: rawListings, isLoading, error } = useReadContract({
    address: contract,
    abi: descentAbi,
    functionName: "latest",
    args: [0n, 50n, false],
    query: {
      enabled: Boolean(contract),
      refetchInterval: 5_000,
    },
  });

  const listings = (rawListings as ListingView[] | undefined) ?? [];

  const activeCount = useMemo(() => {
    return listings.filter((l) => l.state === 0).length;
  }, [listings]);

  const displayedListings = useMemo(() => {
    let filtered = [...listings];
    if (filter === "live") {
      filtered = filtered.filter((l) => l.state === 0);
    } else if (filter === "sold") {
      filtered = filtered.filter((l) => l.state === 1);
    }

    // Sort: closest-to-floor first (highest progress percentage first)
    return filtered.sort((a, b) => {
      const pA = progress(a, nowSec);
      const pB = progress(b, nowSec);
      return pB - pA;
    });
  }, [listings, filter, nowSec]);

  return (
    <PageShell activeCount={activeCount}>
      <div className="space-y-6">
        {/* Wall Controls Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-4 border-[#0A0A0A] pb-4">
          <div className="flex items-center gap-2">
            <span className="font-poster text-4xl sm:text-5xl font-black uppercase tracking-tight text-[#0A0A0A]">
              THE WALL
            </span>
            <span className="text-xs font-mono font-bold bg-[#0A0A0A] text-[#F7E600] px-2 py-0.5 ml-2">
              {displayedListings.length} {displayedListings.length === 1 ? "ITEM" : "ITEMS"}
            </span>
          </div>

          {/* Filter Toggles */}
          <div className="flex items-center gap-1 border-2 border-[#0A0A0A] bg-[#FFFFFF] p-1 shadow-[3px_3px_0_#0A0A0A]">
            <button
              onClick={() => setFilter("live")}
              className={[
                "px-3 py-1 text-xs font-mono font-black uppercase transition-none cursor-pointer",
                filter === "live"
                  ? "bg-[#0A0A0A] text-[#F7E600]"
                  : "bg-transparent text-[#0A0A0A] hover:bg-[#0A0A0A]/10",
              ].join(" ")}
            >
              LIVE ({activeCount})
            </button>
            <button
              onClick={() => setFilter("sold")}
              className={[
                "px-3 py-1 text-xs font-mono font-black uppercase transition-none cursor-pointer",
                filter === "sold"
                  ? "bg-[#0A0A0A] text-[#F7E600]"
                  : "bg-transparent text-[#0A0A0A] hover:bg-[#0A0A0A]/10",
              ].join(" ")}
            >
              SOLD ({listings.filter((l) => l.state === 1).length})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={[
                "px-3 py-1 text-xs font-mono font-black uppercase transition-none cursor-pointer",
                filter === "all"
                  ? "bg-[#0A0A0A] text-[#F7E600]"
                  : "bg-transparent text-[#0A0A0A] hover:bg-[#0A0A0A]/10",
              ].join(" ")}
            >
              ALL ({listings.length})
            </button>
          </div>
        </div>

        {/* Listings Grid */}
        {isLoading ? (
          <div className="py-20 text-center font-mono text-sm uppercase font-black text-[#0A0A0A]">
            LOADING WALL POSTERS…
          </div>
        ) : error ? (
          <Panel banner="READ ERROR">
            <p className="font-mono text-xs uppercase font-bold text-[#FF2E00]">
              COULD NOT LOAD LISTINGS FROM BOT CHAIN. CHECK NETWORK CONNECTION.
            </p>
          </Panel>
        ) : displayedListings.length === 0 ? (
          <div className="py-16 sm:py-24 text-center border-4 border-[#0A0A0A] bg-[#FFFFFF] shadow-[6px_6px_0_#0A0A0A] p-8">
            <h2 className="font-poster text-6xl sm:text-8xl font-black text-[#0A0A0A] tracking-tight">
              NOTHING FALLING.
            </h2>
            <p className="font-mono text-xs sm:text-sm uppercase font-bold text-[#3A3A0A] mt-2 max-w-md mx-auto">
              THERE ARE NO LISTINGS MATCHING THIS FILTER RIGHT NOW.
            </p>
            <div className="mt-6">
              <Link
                href="/new"
                className="inline-block px-8 py-3 bg-[#0A0A0A] text-[#F7E600] font-mono text-xs font-black uppercase tracking-widest border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] hover:bg-[#FFFFFF] hover:text-[#0A0A0A]"
              >
                LIST AN NFT →
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {displayedListings.map((listing) => (
              <ListingPoster key={listing.id.toString()} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
