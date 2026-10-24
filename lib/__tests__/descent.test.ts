import { describe, expect, it, vi } from "vitest";
import {
  buyValue,
  curve,
  nftMeta,
  priceAt,
  progress,
  ratePerMinute,
  resolveIpfsUrl,
} from "../descent";

describe("priceAt", () => {
  const listing = {
    startPrice: 200n,
    floorPrice: 100n,
    startAt: 1000n,
    duration: 1000n,
  };

  it("returns startPrice before startAt", () => {
    expect(priceAt(listing, 500n)).toBe(200n);
  });

  it("returns startPrice at exact startAt", () => {
    expect(priceAt(listing, 1000n)).toBe(200n);
  });

  it("calculates exact integer price mid-descent", () => {
    // 25% elapsed: elapsed = 250, drop = (100 * 250) / 1000 = 25
    expect(priceAt(listing, 1250n)).toBe(175n);
    // 50% elapsed: elapsed = 500, drop = 50
    expect(priceAt(listing, 1500n)).toBe(150n);
    // 75% elapsed: elapsed = 750, drop = 75
    expect(priceAt(listing, 1750n)).toBe(125n);
  });

  it("returns floorPrice at end of duration", () => {
    expect(priceAt(listing, 2000n)).toBe(100n);
  });

  it("returns floorPrice long after end of duration", () => {
    expect(priceAt(listing, 9999n)).toBe(100n);
  });

  it("handles integer rounding division correctly", () => {
    const oddListing = {
      startPrice: 100n,
      floorPrice: 10n,
      startAt: 0n,
      duration: 7n,
    };
    // drop = (90 * 1) / 7 = 12
    expect(priceAt(oddListing, 1n)).toBe(88n);
    // drop = (90 * 2) / 7 = 25
    expect(priceAt(oddListing, 2n)).toBe(75n);
  });
});

describe("curve", () => {
  const listing = {
    startPrice: 1000n,
    floorPrice: 200n,
    startAt: 1000,
    duration: 500,
  };

  it("generates correct number of steps and bounds", () => {
    const points = curve(listing, 10);
    expect(points).toHaveLength(11);
    expect(points[0].time).toBe(1000);
    expect(points[0].price).toBe(1000n);
    expect(points[0].progress).toBe(0);

    const last = points[points.length - 1];
    expect(last.time).toBe(1500);
    expect(last.price).toBe(200n);
    expect(last.progress).toBe(100);
  });
});

describe("ratePerMinute", () => {
  it("calculates drop rate per minute in wei", () => {
    const listing = {
      startPrice: 1000n,
      floorPrice: 400n, // drop = 600
      startAt: 0n,
      duration: 600n, // 10 minutes = 600s
    };
    // rate = (600 * 60) / 600 = 60 wei/min
    expect(ratePerMinute(listing)).toBe(60n);
  });

  it("returns 0 if duration is 0", () => {
    expect(
      ratePerMinute({
        startPrice: 100n,
        floorPrice: 50n,
        startAt: 0n,
        duration: 0n,
      })
    ).toBe(0n);
  });
});

describe("progress", () => {
  const listing = { startAt: 1000, duration: 1000 };

  it("calculates progress percentage correctly", () => {
    expect(progress(listing, 500)).toBe(0);
    expect(progress(listing, 1000)).toBe(0);
    expect(progress(listing, 1250)).toBe(25);
    expect(progress(listing, 1500)).toBe(50);
    expect(progress(listing, 2000)).toBe(100);
    expect(progress(listing, 3000)).toBe(100);
  });
});

describe("buyValue", () => {
  it("adds 0.5% + 1 wei buffer", () => {
    expect(buyValue(1000n)).toBe(1006n);
    expect(buyValue(1_000_000_000_000_000_000n)).toBe(1_005_000_000_000_000_001n);
  });
});

describe("resolveIpfsUrl", () => {
  it("converts ipfs:// to gateway url", () => {
    expect(resolveIpfsUrl("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toBe(
      "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
    );
  });

  it("preserves standard http and data urls", () => {
    expect(resolveIpfsUrl("https://example.com/image.png")).toBe("https://example.com/image.png");
    expect(resolveIpfsUrl("data:image/svg+xml;utf8,<svg/>")).toBe("data:image/svg+xml;utf8,<svg/>");
  });
});

describe("nftMeta", () => {
  it("parses data:application/json;base64 URI", async () => {
    const json = JSON.stringify({
      name: "Generative Kiln #42",
      image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    });
    const b64 = Buffer.from(json).toString("base64");
    const tokenURI = `data:application/json;base64,${b64}`;

    const client = {
      readContract: vi.fn().mockResolvedValue(tokenURI),
    } as any;

    const meta = await nftMeta(client, "0x1111111111111111111111111111111111111111", 42n);
    expect(meta.name).toBe("Generative Kiln #42");
    expect(meta.image).toBe("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
  });

  it("returns fallback on readContract failure", async () => {
    const client = {
      readContract: vi.fn().mockRejectedValue(new Error("RPC failure")),
    } as any;

    const meta = await nftMeta(client, "0x1111111111111111111111111111111111111111", 99n);
    expect(meta.name).toBe("#99");
    expect(meta.image).toBe("");
  });
});
