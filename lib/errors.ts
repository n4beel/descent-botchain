import { BaseError, ContractFunctionRevertedError, formatEther } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Traverses an error to extract the custom revert error name and arguments.
 */
export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // If it's a viem BaseError, use walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as any).data?.errorName)
      )
        return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "errorName" in e &&
        Boolean((e as any).errorName)
      )
        return true;
      return false;
    });

    if (reverted) {
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
      if (errorObj.errorName) {
        return {
          errorName: errorObj.errorName,
          args: errorObj.args,
        };
      }
    }
  }

  return undefined;
}

/**
 * Checks whether an error represents the user rejecting the prompt in their wallet.
 */
export function isUserRejection(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 4001)
  );
}

/**
 * Translates an error into user-facing copy for Descent.
 * Follows Archetype P's telegraphic, capitalised copy register.
 */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) {
    return "TRANSACTION CANCELLED.";
  }

  const rev = extractRevert(err);
  if (rev?.errorName) {
    switch (rev.errorName) {
      case "PriceNotMet": {
        const p = rev.args?.[0];
        const s = rev.args?.[1];
        if (p !== undefined && s !== undefined) {
          const pStr = typeof p === "bigint" ? formatEther(p) : String(p);
          const sStr = typeof s === "bigint" ? formatEther(s) : String(s);
          return `PRICE WAS ${pStr} WHEN IT LANDED. YOU SENT ${sStr}. TRY AGAIN.`;
        }
        return "PRICE NOT MET. TRY AGAIN.";
      }
      case "NotActive": {
        const state = rev.args?.[1];
        if (state === 1 || state === 1n) {
          return "GONE. SOLD.";
        }
        if (state === 2 || state === 2n) {
          return "GONE. WITHDRAWN.";
        }
        return "GONE. NOT ACTIVE.";
      }
      case "NotTokenOwner":
        return "YOU DON'T OWN THAT TOKEN.";
      case "EscrowFailed":
        return "THAT TOKEN CAN'T BE HELD HERE.";
      case "BadPrices":
        return "FLOOR MUST BE ABOVE ZERO AND NOT ABOVE THE START.";
      case "BadDuration":
        return "PICK TEN MINUTES TO THIRTY DAYS.";
      case "NotSeller":
        return "ONLY THE SELLER CAN CANCEL.";
      case "NothingToWithdraw":
        return "NOTHING TO COLLECT.";
      case "NotAContract":
        return "THE ADDRESS IS NOT A CONTRACT.";
      case "NoSuchListing":
        return "LISTING DOES NOT EXIST.";
      case "TransferFailed":
        return "TRANSFER FAILED.";
      case "Reentrancy":
        return "REENTRANT CALL DETECTED.";
    }
  }

  if (err instanceof Error) {
    const m = err.message;
    if (m.includes("PriceNotMet")) return "PRICE NOT MET. TRY AGAIN.";
    if (m.includes("NotActive")) return "GONE. NOT ACTIVE.";
    if (m.includes("NotTokenOwner")) return "YOU DON'T OWN THAT TOKEN.";
    if (m.includes("EscrowFailed")) return "THAT TOKEN CAN'T BE HELD HERE.";
    if (m.includes("BadPrices")) return "FLOOR MUST BE ABOVE ZERO AND NOT ABOVE THE START.";
    if (m.includes("BadDuration")) return "PICK TEN MINUTES TO THIRTY DAYS.";
    if (m.includes("NotSeller")) return "ONLY THE SELLER CAN CANCEL.";
    if (m.includes("NothingToWithdraw")) return "NOTHING TO COLLECT.";
    if (m.includes("Reentrancy")) return "REENTRANT CALL DETECTED.";
    if (m.includes("connector not connected")) return "CONNECT WALLET FIRST.";
    return m.length < 120 ? m.toUpperCase() : `${m.slice(0, 117).toUpperCase()}…`;
  }

  return "AN UNEXPECTED ERROR OCCURRED.";
}
