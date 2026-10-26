"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChainId, useReadContract } from "wagmi";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";
import { descentAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId, footerLinks } from "@/lib/botchain/chain";

export interface PageShellProps {
  children: React.ReactNode;
  activeCount?: number;
}

/**
 * Archetype P · Brutalist Poster Shell.
 *
 * Single-statement pages on acid yellow ground (#F7E600) with heavy 4px black borders.
 * Header: `DESCENT — {n} LIVE` and a bordered connect tag.
 * Sub-banner: `NO BIDS. PRICE ONLY FALLS. FIRST PAYER WINS. SALES ARE FINAL.`
 */
export default function PageShell({ children, activeCount }: PageShellProps) {
  const pathname = usePathname();
  const chainId = useChainId();
  const contract = isBotChainId(chainId) ? getDeployment(chainId).address : undefined;
  const { site, explorer } = footerLinks();

  // Read latest listings to count active items if not provided
  const { data: latestData } = useReadContract({
    address: contract,
    abi: descentAbi,
    functionName: "latest",
    args: [0n, 50n, true],
    query: {
      enabled: activeCount === undefined && Boolean(contract),
      refetchInterval: 10_000,
    },
  });

  const countDisplay =
    activeCount !== undefined
      ? String(activeCount).padStart(2, "0")
      : latestData
      ? String(latestData.length).padStart(2, "0")
      : "--";

  const isWall = pathname === "/";
  const isSell = pathname === "/new";
  const isMine = pathname === "/mine";

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-[#F7E600] text-[#0A0A0A] font-mono selection:bg-[#0A0A0A] selection:text-[#F7E600]">
      {/* Top Poster Header */}
      <header className="border-b-4 border-[#0A0A0A] bg-[#F7E600] sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Logo / Headline Statement */}
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/"
              className="font-poster text-3xl sm:text-4xl font-black tracking-tight text-[#0A0A0A] hover:opacity-80 transition-none"
            >
              {app.name.toUpperCase()} — {countDisplay} LIVE
            </Link>

            {/* Nav Links */}
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/"
                className={[
                  "px-2.5 py-1 text-xs sm:text-sm font-black border-2 border-[#0A0A0A] uppercase transition-none",
                  isWall
                    ? "bg-[#0A0A0A] text-[#F7E600]"
                    : "bg-[#FFFFFF] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#F7E600]",
                ].join(" ")}
              >
                WALL
              </Link>
              <Link
                href="/new"
                className={[
                  "px-2.5 py-1 text-xs sm:text-sm font-black border-2 border-[#0A0A0A] uppercase transition-none",
                  isSell
                    ? "bg-[#0A0A0A] text-[#F7E600]"
                    : "bg-[#FFFFFF] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#F7E600]",
                ].join(" ")}
              >
                SELL
              </Link>
              <Link
                href="/mine"
                className={[
                  "px-2.5 py-1 text-xs sm:text-sm font-black border-2 border-[#0A0A0A] uppercase transition-none",
                  isMine
                    ? "bg-[#0A0A0A] text-[#F7E600]"
                    : "bg-[#FFFFFF] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#F7E600]",
                ].join(" ")}
              >
                MY ITEMS
              </Link>
            </nav>
          </div>

          {/* Bordered Tag Connect Control */}
          <div className="flex items-center gap-2">
            <NetworkBadge />
            <div className="border-2 border-[#0A0A0A] bg-[#FFFFFF] shadow-[3px_3px_0px_#0A0A0A]">
              <ConnectButton />
            </div>
          </div>
        </div>

        {/* Global Limits Ticker Banner */}
        <div className="border-t-2 border-[#0A0A0A] bg-[#0A0A0A] text-[#F7E600] py-1.5 px-4 text-center font-mono text-[11px] sm:text-xs tracking-wider uppercase font-bold overflow-x-auto whitespace-nowrap">
          NO BIDS. PRICE ONLY FALLS. FIRST PAYER WINS. SALES ARE FINAL.
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {children}
      </main>

      {/* Brutalist Footer */}
      <footer className="border-t-4 border-[#0A0A0A] bg-[#FFFFFF] py-6 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono uppercase font-bold text-[#0A0A0A]">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 bg-[#FF2E00] border-2 border-[#0A0A0A]" />
            <span>DESCENT DUTCH AUCTION PROTOCOL</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono uppercase font-bold text-[#0A0A0A]">
            <BuiltOnBotChain className="hover:underline" />
            <span className="text-[#0A0A0A]/40" aria-hidden="true">•</span>
            <a
              href={site}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              botchain.ai
            </a>
            <span className="text-[#0A0A0A]/40" aria-hidden="true">•</span>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
