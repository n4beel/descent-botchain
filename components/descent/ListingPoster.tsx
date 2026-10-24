"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import Panel from "@/components/ui/Panel";
import PriceTicker from "@/components/descent/PriceTicker";
import {
  nftMeta,
  progress,
  useTicker,
  type ListingView,
  type NftMeta,
} from "@/lib/descent";

export interface ListingPosterProps {
  listing: ListingView;
}

export default function ListingPoster({ listing }: ListingPosterProps) {
  const publicClient = usePublicClient();
  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const nowSec = useTicker();
  const [meta, setMeta] = useState<NftMeta>({
    name: `#${listing.tokenId.toString()}`,
    image: "",
  });
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const client = publicClientRef.current;
    if (!client) return;

    nftMeta(client, listing.nft, listing.tokenId).then((m) => {
      if (!cancelled) setMeta(m);
    });

    return () => {
      cancelled = true;
    };
  }, [listing.nft, listing.tokenId]);

  const isSold = listing.state === 1;
  const isCancelled = listing.state === 2;
  const isActive = listing.state === 0;

  const pct = progress(listing, nowSec);
  const remainingSec = Math.max(
    0,
    Number(listing.startAt + listing.duration) - nowSec
  );
  const remainingMin = Math.ceil(remainingSec / 60);

  return (
    <Panel
      className="flex flex-col justify-between hover:-translate-y-1 hover:shadow-[10px_10px_0_#0A0A0A] transition-all"
      banner={
        <div className="flex items-center justify-between text-xs font-mono font-black">
          <span>ITEM #{listing.id.toString().padStart(3, "0")}</span>
          <span>
            {isSold
              ? "SOLD"
              : isCancelled
              ? "WITHDRAWN"
              : pct >= 100
              ? "AT FLOOR"
              : `~${remainingMin}M TO FLOOR`}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* NFT Image Frame */}
        <div className="w-full aspect-square border-4 border-[#0A0A0A] bg-[#F7E600] relative overflow-hidden flex items-center justify-center">
          {meta.image && !imageError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={meta.image}
              alt={meta.name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="p-6 text-center">
              <span className="font-poster text-4xl sm:text-5xl font-black text-[#0A0A0A] block">
                {meta.name}
              </span>
              <span className="font-mono text-xs uppercase text-[#3A3A0A] mt-2 block border-t-2 border-[#0A0A0A] pt-1">
                TOKEN #{listing.tokenId.toString()}
              </span>
            </div>
          )}

          {/* Overlay stamp for Sold / Cancelled */}
          {isSold && (
            <div className="absolute inset-0 bg-[#0A0A0A]/80 flex items-center justify-center p-4">
              <span className="border-4 border-[#FF2E00] text-[#FF2E00] font-poster text-5xl sm:text-6xl font-black uppercase px-6 py-2 rotate-[-8deg] bg-[#0A0A0A] shadow-[6px_6px_0_#FF2E00]">
                SOLD
              </span>
            </div>
          )}
          {isCancelled && (
            <div className="absolute inset-0 bg-[#0A0A0A]/80 flex items-center justify-center p-4">
              <span className="border-4 border-[#FFFFFF] text-[#FFFFFF] font-poster text-3xl sm:text-4xl font-black uppercase px-4 py-2 rotate-[6deg] bg-[#0A0A0A] shadow-[4px_4px_0_#FFFFFF]">
                WITHDRAWN
              </span>
            </div>
          )}
        </div>

        {/* Token Title */}
        <div>
          <h3 className="font-poster text-2xl sm:text-3xl font-black text-[#0A0A0A] tracking-tight truncate">
            {meta.name}
          </h3>
          <p className="font-mono text-xs text-[#3A3A0A] uppercase truncate">
            CONTRACT: {listing.nft.slice(0, 8)}…{listing.nft.slice(-6)}
          </p>
        </div>

        {/* Compact Ticker */}
        <PriceTicker listing={listing} compact />
      </div>

      {/* Action Slab */}
      <div className="mt-5 pt-3 border-t-2 border-[#0A0A0A]">
        <Link
          href={`/l/${listing.id}`}
          className="w-full py-3 bg-[#0A0A0A] text-[#F7E600] font-mono text-xs font-black uppercase tracking-widest text-center block border-2 border-[#0A0A0A] hover:bg-[#FFFFFF] hover:text-[#0A0A0A] transition-none shadow-[3px_3px_0_#0A0A0A] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          {isActive ? "VIEW POSTER & BUY →" : "VIEW DETAILS →"}
        </Link>
      </div>
    </Panel>
  );
}
