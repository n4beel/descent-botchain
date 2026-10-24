import { describe, expect, it } from "vitest";
import { describeError, isUserRejection } from "../errors";

describe("isUserRejection", () => {
  it("detects wallet rejections", () => {
    expect(isUserRejection(new Error("User rejected the request."))).toBe(true);
    expect(isUserRejection(new Error("user rejected transaction"))).toBe(true);
    expect(isUserRejection({ code: 4001, message: "User denied" })).toBe(true);
    expect(isUserRejection(new Error("Gas limit exceeded"))).toBe(false);
  });
});

describe("describeError", () => {
  it("translates user rejection", () => {
    expect(describeError(new Error("User rejected the request."))).toBe(
      "TRANSACTION CANCELLED."
    );
  });

  it("translates PriceNotMet with args", () => {
    const err = {
      data: {
        errorName: "PriceNotMet",
        args: [2000000000000000000n, 1000000000000000000n],
      },
    };
    expect(describeError(err)).toBe(
      "PRICE WAS 2 WHEN IT LANDED. YOU SENT 1. TRY AGAIN."
    );
  });

  it("translates NotActive sold", () => {
    const err = {
      data: {
        errorName: "NotActive",
        args: [1n, 1], // state 1 = Sold
      },
    };
    expect(describeError(err)).toBe("GONE. SOLD.");
  });

  it("translates NotActive cancelled/withdrawn", () => {
    const err = {
      data: {
        errorName: "NotActive",
        args: [1n, 2], // state 2 = Cancelled
      },
    };
    expect(describeError(err)).toBe("GONE. WITHDRAWN.");
  });

  it("translates NotTokenOwner", () => {
    const err = {
      data: {
        errorName: "NotTokenOwner",
        args: ["0x123", 1n, "0x456"],
      },
    };
    expect(describeError(err)).toBe("YOU DON'T OWN THAT TOKEN.");
  });

  it("translates EscrowFailed", () => {
    const err = {
      data: {
        errorName: "EscrowFailed",
        args: [],
      },
    };
    expect(describeError(err)).toBe("THAT TOKEN CAN'T BE HELD HERE.");
  });

  it("translates BadPrices", () => {
    const err = {
      data: {
        errorName: "BadPrices",
        args: [100n, 200n],
      },
    };
    expect(describeError(err)).toBe(
      "FLOOR MUST BE ABOVE ZERO AND NOT ABOVE THE START."
    );
  });

  it("translates BadDuration", () => {
    const err = {
      data: {
        errorName: "BadDuration",
        args: [100n],
      },
    };
    expect(describeError(err)).toBe("PICK TEN MINUTES TO THIRTY DAYS.");
  });

  it("translates NotSeller", () => {
    const err = {
      data: {
        errorName: "NotSeller",
        args: [1n, "0x123"],
      },
    };
    expect(describeError(err)).toBe("ONLY THE SELLER CAN CANCEL.");
  });

  it("translates NothingToWithdraw", () => {
    const err = {
      data: {
        errorName: "NothingToWithdraw",
        args: [],
      },
    };
    expect(describeError(err)).toBe("NOTHING TO COLLECT.");
  });

  it("translates NotAContract", () => {
    const err = {
      data: {
        errorName: "NotAContract",
        args: ["0x123"],
      },
    };
    expect(describeError(err)).toBe("THE ADDRESS IS NOT A CONTRACT.");
  });

  it("translates NoSuchListing", () => {
    const err = {
      data: {
        errorName: "NoSuchListing",
        args: [99n],
      },
    };
    expect(describeError(err)).toBe("LISTING DOES NOT EXIST.");
  });

  it("translates TransferFailed", () => {
    const err = {
      data: {
        errorName: "TransferFailed",
        args: [],
      },
    };
    expect(describeError(err)).toBe("TRANSFER FAILED.");
  });

  it("handles string messages in standard Error", () => {
    expect(describeError(new Error("PriceNotMet: price dropped"))).toBe(
      "PRICE NOT MET. TRY AGAIN."
    );
    expect(describeError(new Error("connector not connected"))).toBe(
      "CONNECT WALLET FIRST."
    );
  });
});
