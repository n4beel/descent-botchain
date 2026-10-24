import { useEffect, useState } from "react";
import type { PublicClient } from "viem";
import { erc721Abi } from "./erc721";

export interface ListingPriceParams {
  startPrice: bigint;
  floorPrice: bigint;
  startAt: bigint | number;
  duration: bigint | number;
}

export interface ListingView {
  id: bigint;
  seller: `0x${string}`;
  nft: `0x${string}`;
  tokenId: bigint;
  startPrice: bigint;
  floorPrice: bigint;
  startAt: bigint;
  duration: bigint;
  createdBlock: number;
  state: number; // 0 Active, 1 Sold, 2 Cancelled
  buyer: `0x${string}`;
  paid: bigint;
  price: bigint;
}

/**
 * Calculates current price using exact integer arithmetic matching Descent.sol:
 * elapsed = nowSec - startAt
 * if elapsed >= duration: floorPrice
 * else: startPrice - ((startPrice - floorPrice) * elapsed) / duration
 */
export function priceAt(
  listing: ListingPriceParams,
  nowSec: bigint | number
): bigint {
  const startAt = BigInt(listing.startAt);
  const duration = BigInt(listing.duration);
  const now = BigInt(nowSec);

  if (now <= startAt) {
    return listing.startPrice;
  }
  const elapsed = now - startAt;
  if (elapsed >= duration) {
    return listing.floorPrice;
  }
  const drop =
    ((listing.startPrice - listing.floorPrice) * elapsed) / duration;
  return listing.startPrice - drop;
}

/**
 * Calculates price curve preview points across steps.
 */
export function curve(
  listing: ListingPriceParams,
  steps = 20
): Array<{ time: number; price: bigint; progress: number }> {
  const startAt = Number(listing.startAt);
  const duration = Number(listing.duration);
  const count = Math.max(2, steps);
  const points: Array<{ time: number; price: bigint; progress: number }> = [];

  for (let i = 0; i <= count; i++) {
    const fraction = i / count;
    const time = Math.round(startAt + fraction * duration);
    const price = priceAt(listing, time);
    points.push({
      time,
      price,
      progress: Math.round(fraction * 100),
    });
  }
  return points;
}

/**
 * Calculates drop rate in wei per minute.
 */
export function ratePerMinute(listing: ListingPriceParams): bigint {
  const duration = BigInt(listing.duration);
  if (duration === 0n) return 0n;
  const totalDrop = listing.startPrice - listing.floorPrice;
  return (totalDrop * 60n) / duration;
}

/**
 * Calculates descent progress percentage (0 to 100).
 */
export function progress(
  listing: { startAt: bigint | number; duration: bigint | number },
  nowSec: bigint | number
): number {
  const startAt = Number(listing.startAt);
  const duration = Number(listing.duration);
  const now = Number(nowSec);

  if (duration <= 0) return 100;
  if (now <= startAt) return 0;
  const elapsed = now - startAt;
  if (elapsed >= duration) return 100;
  return Math.min(100, Math.max(0, (elapsed / duration) * 100));
}

/**
 * Calculates payment value with 0.5% + 1 wei buffer:
 * buyValue = price + 0.5% + 1 wei
 */
export function buyValue(price: bigint): bigint {
  return price + (price * 5n) / 1000n + 1n;
}

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

export function resolveIpfsUrl(url: string): string {
  if (url.startsWith("ipfs://")) {
    return `${IPFS_GATEWAY}${url.slice(7)}`;
  }
  return url;
}

export interface NftMeta {
  name: string;
  image: string;
}

/**
 * Fetches tokenURI and resolves NFT metadata with data:, https:, and ipfs: handling.
 */
export async function nftMeta(
  client: PublicClient,
  nft: `0x${string}`,
  tokenId: bigint
): Promise<NftMeta> {
  const fallback: NftMeta = {
    name: `#${tokenId.toString()}`,
    image: "",
  };

  try {
    const uri = await client.readContract({
      address: nft,
      abi: erc721Abi,
      functionName: "tokenURI",
      args: [tokenId],
    });

    if (!uri) return fallback;

    if (uri.startsWith("data:application/json;base64,")) {
      const b64 = uri.slice("data:application/json;base64,".length);
      const jsonStr = typeof atob !== "undefined"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf-8");
      const parsed = JSON.parse(jsonStr);
      return {
        name: parsed.name || fallback.name,
        image: resolveIpfsUrl(parsed.image || ""),
      };
    }

    if (uri.startsWith("data:application/json,")) {
      const jsonStr = decodeURIComponent(uri.slice("data:application/json,".length));
      const parsed = JSON.parse(jsonStr);
      return {
        name: parsed.name || fallback.name,
        image: resolveIpfsUrl(parsed.image || ""),
      };
    }

    const resolvedUrl = resolveIpfsUrl(uri);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(resolvedUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return fallback;
    const parsed = await res.json();
    return {
      name: parsed.name || fallback.name,
      image: resolveIpfsUrl(parsed.image || ""),
    };
  } catch {
    return fallback;
  }
}

/**
 * useTicker hook returning current time in seconds.
 * Uses requestAnimationFrame for immediate frame-accurate updates, or 1s intervals under reduced motion.
 * Callers should NOT put this hook's return in useEffect dependency arrays.
 */
export function useTicker(): number {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let animId: number;
    let intervalId: ReturnType<typeof setInterval>;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      intervalId = setInterval(() => {
        setNowSec(Math.floor(Date.now() / 1000));
      }, 1000);
    } else {
      let lastSec = Math.floor(Date.now() / 1000);
      const loop = () => {
        const curSec = Math.floor(Date.now() / 1000);
        if (curSec !== lastSec) {
          setNowSec(curSec);
          lastSec = curSec;
        }
        animId = requestAnimationFrame(loop);
      };
      animId = requestAnimationFrame(loop);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return nowSec;
}
