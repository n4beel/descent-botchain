/**
 * Descent contract ABI.
 * Hand-written and `as const` for strict viem / wagmi typing.
 */
export const descentAbi = [
  // Constants & view state
  {
    type: "function",
    name: "MIN_DURATION",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_DURATION",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_PAGE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "listingCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pending",
    inputs: [{ name: "seller", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  // Mutating functions
  {
    type: "function",
    name: "list",
    inputs: [
      { name: "nft", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "startPrice", type: "uint128", internalType: "uint128" },
      { name: "floorPrice", type: "uint128", internalType: "uint128" },
      { name: "duration", type: "uint64", internalType: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "buy",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "cancel",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // View functions
  {
    type: "function",
    name: "currentPrice",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "listingOf",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Descent.ListingView",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "seller", type: "address", internalType: "address" },
          { name: "nft", type: "address", internalType: "address" },
          { name: "tokenId", type: "uint256", internalType: "uint256" },
          { name: "startPrice", type: "uint128", internalType: "uint128" },
          { name: "floorPrice", type: "uint128", internalType: "uint128" },
          { name: "startAt", type: "uint64", internalType: "uint64" },
          { name: "duration", type: "uint64", internalType: "uint64" },
          { name: "createdBlock", type: "uint32", internalType: "uint32" },
          { name: "state", type: "uint8", internalType: "uint8" },
          { name: "buyer", type: "address", internalType: "address" },
          { name: "paid", type: "uint128", internalType: "uint128" },
          { name: "price", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latest",
    inputs: [
      { name: "offset", type: "uint256", internalType: "uint256" },
      { name: "count", type: "uint256", internalType: "uint256" },
      { name: "activeOnly", type: "bool", internalType: "bool" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct Descent.ListingView[]",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "seller", type: "address", internalType: "address" },
          { name: "nft", type: "address", internalType: "address" },
          { name: "tokenId", type: "uint256", internalType: "uint256" },
          { name: "startPrice", type: "uint128", internalType: "uint128" },
          { name: "floorPrice", type: "uint128", internalType: "uint128" },
          { name: "startAt", type: "uint64", internalType: "uint64" },
          { name: "duration", type: "uint64", internalType: "uint64" },
          { name: "createdBlock", type: "uint32", internalType: "uint32" },
          { name: "state", type: "uint8", internalType: "uint8" },
          { name: "buyer", type: "address", internalType: "address" },
          { name: "paid", type: "uint128", internalType: "uint128" },
          { name: "price", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "listingsBy",
    inputs: [{ name: "seller", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  // Events
  {
    type: "event",
    name: "Listed",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "seller", type: "address", indexed: true, internalType: "address" },
      { name: "nft", type: "address", indexed: true, internalType: "address" },
      { name: "tokenId", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "startPrice", type: "uint128", indexed: false, internalType: "uint128" },
      { name: "floorPrice", type: "uint128", indexed: false, internalType: "uint128" },
      { name: "startAt", type: "uint64", indexed: false, internalType: "uint64" },
      { name: "duration", type: "uint64", indexed: false, internalType: "uint64" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Bought",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      { name: "seller", type: "address", indexed: true, internalType: "address" },
      { name: "price", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Cancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "seller", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "seller", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  // Custom errors
  {
    type: "error",
    name: "NotAContract",
    inputs: [{ name: "nft", type: "address", internalType: "address" }],
  },
  {
    type: "error",
    name: "BadPrices",
    inputs: [
      { name: "start", type: "uint128", internalType: "uint128" },
      { name: "floor", type: "uint128", internalType: "uint128" },
    ],
  },
  {
    type: "error",
    name: "BadDuration",
    inputs: [{ name: "duration", type: "uint64", internalType: "uint64" }],
  },
  {
    type: "error",
    name: "NotTokenOwner",
    inputs: [
      { name: "nft", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "owner", type: "address", internalType: "address" },
    ],
  },
  {
    type: "error",
    name: "EscrowFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "NoSuchListing",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "error",
    name: "NotActive",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "state", type: "uint8", internalType: "uint8" },
    ],
  },
  {
    type: "error",
    name: "PriceNotMet",
    inputs: [
      { name: "price", type: "uint256", internalType: "uint256" },
      { name: "sent", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NotSeller",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "caller", type: "address", internalType: "address" },
    ],
  },
  {
    type: "error",
    name: "NothingToWithdraw",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "Reentrancy",
    inputs: [],
  },
] as const;

export const contractAbi = descentAbi;
