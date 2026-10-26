import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <div className="py-12 w-full max-w-xl mx-auto font-mono text-center">
        <div className="bg-[#FFFFFF] border-4 border-[#0A0A0A] p-8 shadow-[8px_8px_0px_#0A0A0A] space-y-6">
          <div className="inline-block bg-[#FF2E00] text-white px-3 py-1 font-bold text-sm uppercase">
            404 NOT FOUND
          </div>
          <h2 className="text-2xl font-black uppercase text-[#0A0A0A] tracking-tight">
            LISTING NOT FOUND
          </h2>
          <p className="text-xs uppercase text-[#0A0A0A]/80 font-bold">
            The requested Dutch auction listing does not exist or has already elapsed on this network.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-block bg-[#0A0A0A] text-[#F7E600] px-6 py-3 font-bold text-sm uppercase hover:bg-[#FF2E00] hover:text-white transition-colors"
            >
              ← RETURN TO AUCTION WALL
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
