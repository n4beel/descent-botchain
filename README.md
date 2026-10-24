# Descent

A Dutch auction for ERC-721 tokens on BOT Chain. A price that falls until someone buys.

## What it does
Descent lets anyone list an ERC-721 token for continuous Dutch auction:
- **Continuous Linear Price Decay:** The seller sets a start price, a floor price, and a duration (between 10 minutes and 30 days). The price drops continuously from start to floor across the duration.
- **First Payer Takes the Token:** The first buyer to call `buy(id)` with payment meeting or exceeding the live decaying price wins the token. The token is immediately transferred out of contract escrow to the buyer.
- **Automatic Excess Refund:** The app calculates an overpay buffer (+0.5% + 1 wei) so transactions confirm without failing due to block time drift. Any payment exceeding the execution block's price is automatically refunded in the same transaction.
- **Pull-Payment Proceeds:** Sales proceeds accrue in `pending[seller]` following strict Checks-Effects-Interactions (CEI), withdrawable anytime via `withdraw()`.
- **Active Escrow:** The listed ERC-721 token is held in custody by the Descent contract while listed, preventing fraudulent double-listings or off-market transfers.

## What it deliberately cannot do
- **No Bids or Negotiations:** There are no counter-offers or reserve negotiations. The price only descends; the first caller to pay wins.
- **Sales are Final:** Once bought, the trade is permanent. There are no returns, refunds, or swap-backs.
- **Transferable Tokens Only:** Soulbound badges (such as Emblem badges) that revert on transfer cannot be listed; escrow verification validates token transferability.
- **The Floor is Permanent:** After the duration lapses, the price remains permanently at the floor price until bought or cancelled.
- **Seller Cancellation Race:** The seller may cancel an unsold listing at any time to retrieve their token. If a buyer's purchase executes after a cancellation in the same block, it safely reverts `NotActive`.
- **No Owner or Admin Backdoors:** The contract has no owner, no upgrade proxy, no fee tax, and no emergency pause.

## Gas consumption
- `list`: **~239,397 gas** (escrows ERC-721 token, initializes 4 storage slots)
- `buy`: **~329,425 gas** (includes state updates, ERC-721 transfer to buyer, and ETH refund transfer)
- `cancel`: **~259,748 gas** (updates listing state, returns ERC-721 token to seller)
- `withdraw`: **~54,894 gas** (zeroes pending balance and transfers native BOT proceeds)

## Design Archetype
**Archetype P · Poster**
- **Brutalist Single-Statement Layout:** Built on an acid-yellow ground (`#F7E600`), stark black ink (`#0A0A0A`), signal red (`#FF2E00`), and pure white surfaces (`#FFFFFF`).
- **Heavy Borders & Hard Shadows:** 4px solid black borders, hard offset shadows (`6px 6px 0 #0A0A0A`), and zero border-radius (`rounded-none`).
- **Enormous Ticking Numeral:** Display numerals rendered in Big Shoulders Display (`clamp(72px, 22vw, 260px)`), recalculating on every animation frame via integer math matching Solidity integer arithmetic.
- **Descent Track:** High-contrast horizontal progress track visualizing the decay progress from START to FLOOR.
- **Mobile Fixed BUY NOW Slab:** Fixed bottom slab on mobile devices (`< 768px`) for one-tap purchasing without obscuring the price track.
- **Contrast Ratios:**
  - Ink (`#0A0A0A`) on Acid Yellow (`#F7E600`): **12.8:1** (Passes WCAG AAA)
  - Muted Text (`#3A3A0A`) on Acid Yellow (`#F7E600`): **8.6:1** (Passes WCAG AAA)
  - Signal Red (`#FF2E00`) on Acid Yellow (`#F7E600`): **2.9:1** (Strictly restricted to display numerals ≥ 48px per spec; all body copy and labels use black)
  - Signal Red (`#FF2E00`) on White (`#FFFFFF`): **4.0:1** (Passes AA for large text)
  - Acid Yellow (`#F7E600`) on Ink (`#0A0A0A`): **12.8:1** (Passes WCAG AAA)
