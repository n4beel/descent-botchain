import { type HTMLAttributes, type ReactNode } from "react";

export interface PosterPanelProps extends HTMLAttributes<HTMLDivElement> {
  banner?: ReactNode;
  dense?: boolean;
  solidBlack?: boolean;
}

/**
 * Archetype P · Brutalist Poster Frame Panel.
 * Hard 4px black borders with 6px 6px offset shadow and 0px radius.
 */
export default function Panel({
  banner,
  dense = false,
  solidBlack = false,
  children,
  className = "",
  style,
  ...props
}: PosterPanelProps) {
  return (
    <div
      className={[
        "relative border-4 border-[#0A0A0A]",
        solidBlack ? "bg-[#0A0A0A] text-[#F7E600]" : "bg-[#FFFFFF] text-[#0A0A0A]",
        "shadow-[6px_6px_0px_#0A0A0A]",
        className,
      ].join(" ")}
      style={style}
      {...props}
    >
      {banner && (
        <div className="border-b-4 border-[#0A0A0A] bg-[#0A0A0A] text-[#F7E600] px-4 py-2 font-mono text-xs uppercase tracking-widest font-bold">
          {banner}
        </div>
      )}
      <div className={dense ? "p-3 sm:p-4" : "p-5 sm:p-7"}>{children}</div>
    </div>
  );
}
