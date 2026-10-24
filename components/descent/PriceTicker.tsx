"use client";

import { useMemo } from "react";
import { formatEther } from "viem";
import {
  priceAt,
  progress,
  ratePerMinute,
  useTicker,
  type ListingPriceParams,
} from "@/lib/descent";

export interface PriceTickerProps {
  listing: ListingPriceParams & {
    state?: number; // 0 Active, 1 Sold, 2 Cancelled
    paid?: bigint;
  };
  compact?: boolean;
}

/**
 * Archetype P · Price Ticker.
 * Ticking red display numeral (`clamp(72px, 22vw, 260px)`) computed on every animation frame.
 * Shows descent progress bar from START to FLOOR.
 */
export default function PriceTicker({ listing, compact = false }: PriceTickerProps) {
  const nowSec = useTicker();

  // Calculate live values
  const currentPrice = useMemo(() => {
    if (listing.state === 1) return listing.paid ?? listing.floorPrice;
    if (listing.state === 2) return listing.floorPrice;
    return priceAt(listing, nowSec);
  }, [listing, nowSec]);

  const pct = useMemo(() => {
    if (listing.state === 1 || listing.state === 2) return 100;
    return progress(listing, nowSec);
  }, [listing, nowSec]);

  const rate = useMemo(() => {
    return ratePerMinute(listing);
  }, [listing]);

  const isAtFloor = pct >= 100 && listing.state === 0;
  const isSold = listing.state === 1;
  const isCancelled = listing.state === 2;

  const formattedPrice = formatEther(currentPrice);
  // Separate integer and decimal parts for crisp display
  const [intPart, decPart = "0"] = formattedPrice.split(".");
  const displayDec = decPart.slice(0, 4);

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#0A0A0A]">
            {isSold ? "SOLD FOR" : isCancelled ? "FINAL FLOOR" : "NOW"}
          </span>
          <span className="font-poster text-4xl sm:text-5xl font-black text-[#FF2E00] tabular-nums tracking-tight leading-none">
            {intPart}.{displayDec} <span className="text-xl sm:text-2xl text-[#0A0A0A]">BOT</span>
          </span>
        </div>
        {/* Progress Bar */}
        <div className="w-full h-3 border-2 border-[#0A0A0A] bg-[#FFFFFF] p-0.5 relative">
          <div
            className="h-full bg-[#0A0A0A] transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Massive Display Numeral */}
      <div className="text-center sm:text-left">
        <div className="flex items-baseline gap-3 justify-center sm:justify-start">
          <span className="text-sm sm:text-base font-mono font-black uppercase tracking-[0.2em] text-[#0A0A0A] border-b-2 border-[#0A0A0A] pb-0.5">
            {isSold ? "SOLD AT" : isCancelled ? "WITHDRAWN" : "CURRENT PRICE"}
          </span>
          {isAtFloor && (
            <span className="px-2 py-0.5 bg-[#0A0A0A] text-[#F7E600] font-mono text-xs font-black uppercase tracking-wider">
              AT FLOOR
            </span>
          )}
        </div>

        <div className="poster-numeral text-[clamp(64px,18vw,220px)] tracking-tight leading-[0.88] select-all my-2">
          {intPart}
          <span className="text-[0.65em]">.{displayDec}</span>
          <span className="text-[0.35em] ml-2 text-[#0A0A0A] font-mono tracking-normal">
            BOT
          </span>
        </div>

        {/* Live Descent Rate or Status Info */}
        <div className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-[#3A3A0A]">
          {isSold ? (
            <span className="text-[#0A0A0A] bg-[#FFFFFF] px-2 py-1 border-2 border-[#0A0A0A]">
              AUCTION CONCLUDED — ITEM TRANSFERRED
            </span>
          ) : isCancelled ? (
            <span className="text-[#0A0A0A] bg-[#FFFFFF] px-2 py-1 border-2 border-[#0A0A0A]">
              WITHDRAWN BY SELLER — TOKEN RETURNED
            </span>
          ) : isAtFloor ? (
            <span>PRICE WILL NOT GO LOWER. FIRST TO PAY THE FLOOR WINS.</span>
          ) : (
            <span>
              FALLING AT ~{formatEther(rate)} BOT/MIN. FIRST PAYER WINS.
            </span>
          )}
        </div>
      </div>

      {/* Heavy Brutalist Descent Track */}
      <div className="space-y-2 border-4 border-[#0A0A0A] bg-[#FFFFFF] p-4 sm:p-5 shadow-[4px_4px_0_#0A0A0A]">
        <div className="flex items-center justify-between text-xs font-mono font-black uppercase text-[#0A0A0A]">
          <span>START: {formatEther(listing.startPrice)} BOT</span>
          <span>FLOOR: {formatEther(listing.floorPrice)} BOT</span>
        </div>

        {/* The Track */}
        <div className="w-full h-8 border-4 border-[#0A0A0A] bg-[#F7E600] relative overflow-hidden">
          {/* Progress fill */}
          <div
            className="h-full bg-[#0A0A0A] transition-none"
            style={{ width: `${pct}%` }}
          />
          {/* Marker label */}
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-black text-[#FFFFFF] mix-blend-difference pointer-events-none">
            {pct.toFixed(1)}% OF DESCENT COMPLETED
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-[#3A3A0A]">
          <span>T = 0s</span>
          <span>DURATION: {Number(listing.duration)} SECONDS</span>
        </div>
      </div>
    </div>
  );
}
