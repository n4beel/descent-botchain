# Handover — Descent

## What was built
- **Smart Contract (`contracts/src/Descent.sol`):**
  - Continuous linear Dutch auction engine for ERC-721 tokens on BOT Chain.
  - Storage packed across 4 slots per listing:
    - Slot 1: `address seller` (20B) + `uint64 startAt` (8B) + `uint32 createdBlock` (4B).
    - Slot 2: `address nft` (20B) + `uint64 duration` (8B) + `uint8 state` (1B).
    - Slot 3: `uint256 tokenId` (32B).
    - Slot 4: `uint128 startPrice` (16B) + `uint128 floorPrice` (16B).
  - Non-reentrant execution (`nonReentrant` modifier) and strict Checks-Effects-Interactions (CEI).
  - Pull-payment balances accrued in `pending[seller]`, withdrawable via `withdraw()`.
  - Automatic refund of excess payment when `msg.value > price`.
  - Zero compiler warnings in `src/`.
- **Foundry Test Suite (`contracts/test/Descent.t.sol`):**
  - 21 passed tests, 0 failed, 0 skipped.
  - Stateful invariant test `invariant_BalanceEqualsPending`: 256 runs, 128,000 calls across `DescentHandler` with 0 reverts, proving `address(descent).balance == Σ pending[*]`.
  - 256 fuzz runs on `testFuzz_PriceWithinBounds_AndMonotone`.
  - Security tests verifying resistance against hostile reentrant tokens (`HostileNFT`) and hostile reentrant buyers (`HostileBuyer`).
  - Gas snapshots verifying all protocol actions remain well below gas ceilings.
- **TypeScript Library (`lib/descent.ts`, `lib/limits.ts`, `lib/errors.ts`, `lib/erc721.ts`, `lib/botchain/abi.ts`):**
  - `priceAt(listing, nowSec)` with integer arithmetic matching Solidity integer division.
  - `curve(listing, steps)` generating multi-step preview curve coordinates.
  - `ratePerMinute(listing)` calculating decay velocity in wei/minute.
  - `progress(listing, nowSec)` calculating exact percent progress to floor.
  - `buyValue(price)` providing +0.5% + 1 wei buffer against block drift.
  - `nftMeta(client, nft, tokenId)` handling `data:application/json;base64`, `data:application/json;utf8`, `https:`, and `ipfs:` (gateway `https://ipfs.io/ipfs/`).
  - `useTicker()` returning frame-accurate second timestamps via `requestAnimationFrame` (1s intervals under prefers-reduced-motion).
  - `describeError()` translating all 11 custom errors and wallet cancellations into telegraphic capitalised statements.
- **Integration Tests & Local Stack (`test/integration/descent.test.ts`, `scripts/local-stack.mjs`):**
  - 13 integration tests on port 8608 (chain 968) checking `priceAt` equality against `currentPrice` at 10 timestamps, overpay refunds, underpay rejection, cancellation token recovery, proceeds withdrawal, drift tolerances, and pagination.
  - Local stack runner on port 8708 seeding 12 tokens and 6 scenarios:
    1. Mid-descent (~40%): Listing #3 (Token 4, 5.0 -> 0.5 BOT)
    2. Nearly at floor: Listing #2 (Token 5, 2.5 -> 0.25 BOT)
    3. At floor for 10 min: Listing #1 (Token 6, 1.0 -> 0.1 BOT)
    4. Sold to account 3: Listing #4 (Token 7)
    5. Cancelled: Listing #5 (Token 8)
    6. Account 0 active listing: Listing #6 (Token 1, 10.0 -> 1.0 BOT)
    Plus unlisted tokens owned by account 0 for manual listing creation.
- **Frontend & Archetype P Poster (`components/layout/PageShell.tsx`, `components/descent/`, `app/`):**
  - Brutalist poster aesthetic on acid-yellow ground (`#F7E600`), 4px solid black borders, hard offset shadows (`6px 6px 0 #0A0A0A`), 0px border-radius.
  - Ticking display numeral (`clamp(72px, 22vw, 260px)`) in Big Shoulders Display with tabular figures.
  - Mobile fixed BUY NOW slab that remains anchored to bottom without covering price track.
  - Screens:
    - `/`: Two-column wall of active posters, toggleable between LIVE / SOLD / ALL, sorted closest-to-floor first.
    - `/l/[id]`: Poster detail view with real-time ticking numeral, horizontal descent progress track, BUY NOW slab, and seller CANCEL button.
    - `/new`: Sell screen with ownership check, image preview, start/floor/duration inputs, preview curve, approval step, and listing transaction.
    - `/mine`: My listings management and one-click proceeds withdrawal.

## Verification Commands and Test Counts

```bash
# 1. Forge build & test
cd contracts && forge build --force && forge test
# Result: 21 passed; 0 failed; 0 skipped; 256 fuzz runs; 128,000 invariant calls; zero warnings

# 2. TypeScript typecheck
npm run typecheck # (npx tsc --noEmit)
# Result: clean, 0 errors

# 3. Frontend unit tests
npm test # (vitest run lib test/lint)
# Result: 67 passed; 0 failed; 10 test files

# 4. Integration tests
npm run test:integration # (vitest run test/integration)
# Result: 13 passed; 0 failed; 2 test files

# 5. Production build
npm run build # (next build)
# Result: compiled successfully, all 4 routes optimized

# 6. Distinctness verification
python3 ../scripts/check-distinct.py descent
# Result: 23 projects compared; 0 pair/file problem(s)
```

## What could not be tested
- Real mainnet execution against production BOT Chain validator sets with real BOT funds (all tests run against local anvil nodes simulating chain 968).
