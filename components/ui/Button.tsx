"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

export type PosterButtonVariant = "slab" | "outline" | "danger" | "ghost";
export type PosterButtonSize = "sm" | "md" | "lg" | "giant";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PosterButtonVariant;
  size?: PosterButtonSize;
  busy?: boolean;
}

const variantClasses: Record<PosterButtonVariant, string> = {
  slab: "bg-[#0A0A0A] text-[#F7E600] hover:bg-[#1A1A1A] active:bg-[#000000]",
  outline: "bg-[#FFFFFF] text-[#0A0A0A] hover:bg-[#F0F0F0] active:bg-[#E0E0E0]",
  danger: "bg-[#FF2E00] text-[#0A0A0A] hover:bg-[#E02600] active:bg-[#C01F00]",
  ghost: "bg-transparent text-[#0A0A0A] border-transparent shadow-none hover:bg-[#0A0A0A]/10",
};

const sizeClasses: Record<PosterButtonSize, string> = {
  sm: "px-3 py-1 text-xs tracking-wider",
  md: "px-5 py-2.5 text-sm tracking-widest",
  lg: "px-6 py-4 text-base tracking-widest font-bold",
  giant: "w-full py-5 text-xl sm:text-2xl tracking-[0.2em] font-extrabold",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "slab",
      size = "md",
      busy = false,
      disabled,
      children,
      className = "",
      ...rest
    },
    ref
  ) => {
    const isGhost = variant === "ghost";

    return (
      <button
        ref={ref}
        disabled={disabled || busy}
        className={[
          "inline-flex items-center justify-center gap-2 font-mono uppercase font-black cursor-pointer",
          "border-4 border-[#0A0A0A] transition-none select-none",
          isGhost ? "" : "shadow-[4px_4px_0px_#0A0A0A] active:translate-x-1 active:translate-y-1 active:shadow-none",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_#0A0A0A]",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...rest}
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent animate-spin" />
            <span>WAITING…</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
