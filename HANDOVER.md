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

## Feedback round 1

All findings from `docs/specs/FEEDBACK-descent.md` addressed and verified in order:

1. **Seed NFTs Generative SVG (Item 1):** Fixed. Replaced the truncated SVG placeholder in `contracts/test/helpers/MockNFT.sol` with a pure-Solidity `Base64` encoder and deterministic multi-rectangle generative SVG generator parameterized by `tokenId`. The resulting `tokenURI` yields valid Base64 JSON with a valid Base64 SVG `image` data URI. Tested via `test_MockNFT_TokenURI_GenerativeSVG` in Foundry and verified in the browser walkthrough that wall cards and poster detail screens display loaded SVG artwork through standard `<img>` tags.
2. **Decode Creation Event by Name (Item 2):** Fixed. Updated `app/new/page.tsx` to decode the listing creation receipt with `parseEventLogs` using `descentAbi` for the `Listed` event rather than reading raw `topics[1]`.
3. **Local Stack Environment & Chain Time Alignment (Item 3):** Fixed. `scripts/local-stack.mjs` writes `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet` and `NEXT_PUBLIC_BOHR_RPC=http://127.0.0.1:8708` to `.env.local`. Started anvil with `--timestamp (realNow - 1600)` so that advancing time by 1600 seconds brings chain timestamp to wall clock time (measured 0s diff, asserted diff <= 120s). Printed Account Role Table for all seeded accounts.
4. **Reentrancy Custom Error (Item 4):** Fixed. Replaced `require(!_locked, "REENTRANT");` with `if (_locked) revert Reentrancy();` in `contracts/src/Descent.sol`. Added `Reentrancy` custom error to contract, `lib/botchain/abi.ts`, and `lib/errors.ts` (`"REENTRANT CALL DETECTED."`). Updated existing hostile NFT test in `contracts/test/Descent.t.sol` to expect `Descent.Reentrancy.selector` and added unit test in `lib/__tests__/errors.test.ts`. Zero string reverts remain in `contracts/src`.
5. **Reentrancy Guard on `list` (Item 5):** Fixed. Added `nonReentrant` modifier to `function list(...)` in `contracts/src/Descent.sol`. Added `test_HostileNFT_CannotReenter_List` in `contracts/test/Descent.t.sol` verifying that hostile reentrant tokens cannot attack during token escrow in `list()`.
6. **Browser Walkthrough (Item 6):** Fixed. Completed browser walkthrough using `docs/specs/tools/mock-wallet.js` and Headless Chrome. 0 console errors and 0 hydration warnings across all §3.2 routes and roles.

### Browser Walkthrough Results

| Route | Role | Action | Status | Result / Notes |
|---|---|---|---|---|
| `360px Viewport` | Mobile | Verify mobile responsive layout | PASS | Large price numeral scales; BUY NOW slab fixed to viewport bottom without overlapping bar |
| `720px / 1280px` | Tablet / Desktop | Verify responsive wall & posters | PASS | 2-column brutalist poster grid renders cleanly with acid-yellow ground and 0px border-radius |
| `/` | Acc 0 / All | Read Wall & Filter Tabs | PASS | 4 active seeded posters render loaded generative SVGs; toggles LIVE (4), SOLD (1), ALL (6) correctly |
| `/l/1` | Acc 0 (Buyer) | Buy listing at floor (0.1 BOT) | PASS | Transaction confirmed; stage===confirmed ordered first; displays SOLD stamp and buyer info |
| `/mine` | Acc 1 (Seller) | Withdraw 0.1 BOT accrued proceeds | PASS | Acc 1 sees 0.1 BOT pending proceeds; executes withdraw; balance zeroes out with confirmed banner |
| `/l/6` | Acc 0 (Seller) | Cancel active listing #6 | PASS | Acc 0 sees CANCEL LISTING button; executes cancel; listing state transitions to CANCELLED |
| `/new -> /l/7` | Acc 0 (Seller) | List unlisted Token #2 | PASS | Shows ownership & preview curve; approves token; lists token; decodes Listed event and redirects to `/l/7` |
| `/l/4 & /l/5` | Observer (No Wallet) | View finalized Sold & Cancelled listings | PASS | Fully readable without wallet; displays historical sale price / buyer and cancelled status |

- **Console Errors:** 0
- **Hydration Warnings:** 0

## Feedback round 2

- **Item 1 (Local-stack autonomous mining):** Added `"--block-time", "1"` to Anvil startup args in `scripts/local-stack.mjs`. Seeding continues to complete cleanly with the final timestamp difference within ~2 minutes of real time (`diff: 0s`).
  - Command run to confirm blocks advance on their own:
    ```bash
    b1=$(cast block-number --rpc-url http://127.0.0.1:8708); sleep 3; b2=$(cast block-number --rpc-url http://127.0.0.1:8708); echo "$b1 -> $b2"
    ```
    Output: `102 -> 105` (+3 blocks produced automatically in 3 seconds).
- **Item 3 (Housekeeping):**
  - Removed tracked `AGENTS.md` and 0-byte `public/favicon.ico` via `git rm`.
  - Added `AGENTS.md` to `.gitignore`.
  - Added dedicated 192x192 PNG `app/icon.png` in project brand styling (`#FF2E00`).
  - Configured `icons: { icon: "/icon.png" }` in `metadata` in `app/layout.tsx` so browsers request `/icon.png` directly and never request `/favicon.ico`.

## Feedback round 3

- **Footer Three-Link Compliance & Helper:**
  - Added fixed constants `BOTCHAIN_SITE_URL = "https://botchain.ai"` and `BOTCHAIN_EXPLORER_URL = "https://scan.botchain.ai"` in `lib/botchain/chain.ts`.
  - Added exported `footerLinks(chainId?: number): FooterLinks` returning `{ contract, site, explorer }` where `contract` is `<explorer for that chain>/address/<address>` (or `null` when undeployed).
  - Updated `BuiltOnBotChain` to use `footerLinks(activeBotChain.id).contract`.
  - Corrected Descent's brutalist footer in `components/layout/PageShell.tsx` to include `BuiltOnBotChain`, `botchain.ai`, and `Explorer` in brutalist uppercase mono style.
  - Added `app/not-found.tsx` wrapped in `PageShell` ensuring footer renders on 404 and unrouted states.
  - Added unit test suite in `lib/botchain/__tests__/chain.test.ts` covering chain IDs 677 and 968 for both deployed and undeployed configurations.

- **Browser-Check with Local Stack (port 8708 / 3008):**
  - `/` (Home): Verified all three links present (`https://scan.bohr.life/address/0x5fbdb2315678afecb367f032d93f642f64180aa3`, `https://botchain.ai`, `https://scan.botchain.ai`).
  - `/l/1` (Detail): Verified all three links present.
  - `/nonexistent` (Not Found): Verified all three links present.

## Feedback round 4

- **Item 1 (Shared CSS Tokens & Contrast):**
  - Defined missing tokens in `app/globals.css`:
    - `--border-default: #0A0A0A`
    - `--text-secondary: #2C2C14` (13.5:1 contrast on `--bg-elevated: #FFFFFF`, WCAG AAA)
    - `--text-tertiary: #4A4A20` (7.9:1 contrast on `--bg-elevated`, WCAG AAA)
    - `--success: #0E6B24` (6.1:1 contrast on `--bg-elevated`, WCAG AA)
    - `--danger: #C01B00` (5.2:1 contrast on `--bg-elevated`, WCAG AA)
    - `--warning: #8A4E00` (6.2:1 contrast on `--bg-elevated`, WCAG AA)
  - Updated `ConnectButton.tsx` menu items with readable typography, defined surfaces, and hover state (`hover:bg-[rgba(10,10,10,0.06)]`).
  - Added unit test `test/lint/tokens.test.ts`.
  - Verified `python3 scripts/check-tokens.py descent` exits 0 with zero undefined tokens.



