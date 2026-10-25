// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Descent} from "../src/Descent.sol";
import {MockNFT} from "./helpers/MockNFT.sol";
import {HostileNFT} from "./helpers/HostileNFT.sol";
import {HostileBuyer} from "./helpers/HostileBuyer.sol";

contract DescentHandler is Test {
    Descent public descent;
    MockNFT public nft;
    address[] public users;
    uint256 public nextTokenId;

    constructor(Descent _descent, MockNFT _nft, address[] memory _users) {
        descent = _descent;
        nft = _nft;
        users = _users;
    }

    function list(uint8 userIndex, uint128 start, uint128 floor, uint32 duration) external {
        address seller = users[userIndex % users.length];
        floor = uint128(bound(floor, 0.01 ether, 100 ether));
        start = uint128(bound(start, floor, 1000 ether));
        duration = uint32(bound(duration, 10 minutes, 30 days));

        uint256 tid = ++nextTokenId;
        nft.mint(seller, tid);

        vm.startPrank(seller);
        nft.approve(address(descent), tid);
        descent.list(address(nft), tid, start, floor, duration);
        vm.stopPrank();
    }

    function buy(uint8 userIndex, uint256 listingIdSeed, uint256 extra) external {
        uint256 total = descent.listingCount();
        if (total == 0) return;
        uint256 id = (listingIdSeed % total) + 1;

        Descent.ListingView memory lv = descent.listingOf(id);
        if (lv.state != uint8(Descent.State.Active)) return;

        address buyer = users[userIndex % users.length];
        uint256 price = descent.currentPrice(id);
        uint256 toPay = price + (extra % 0.1 ether);

        vm.deal(buyer, toPay + 1 ether);
        vm.prank(buyer);
        try descent.buy{value: toPay}(id) {} catch {}
    }

    function cancel(uint256 listingIdSeed) external {
        uint256 total = descent.listingCount();
        if (total == 0) return;
        uint256 id = (listingIdSeed % total) + 1;

        Descent.ListingView memory lv = descent.listingOf(id);
        if (lv.state != uint8(Descent.State.Active)) return;

        vm.prank(lv.seller);
        try descent.cancel(id) {} catch {}
    }

    function withdraw(uint8 userIndex) external {
        address user = users[userIndex % users.length];
        if (descent.pending(user) == 0) return;

        vm.prank(user);
        try descent.withdraw() {} catch {}
    }

    function warp(uint32 secondsForward) external {
        uint256 forward = bound(secondsForward, 1, 3 days);
        vm.warp(block.timestamp + forward);
    }
}

contract DescentTest is Test {
    Descent public descent;
    MockNFT public nft;
    DescentHandler public handler;

    address public alice = address(0xAA11);
    address public bob = address(0xBB22);
    address public charlie = address(0xCC33);

    function setUp() public {
        vm.warp(1_760_000_000);
        descent = new Descent();
        nft = new MockNFT();

        address[] memory users = new address[](3);
        users[0] = alice;
        users[1] = bob;
        users[2] = charlie;

        handler = new DescentHandler(descent, nft, users);
        targetContract(address(handler));
    }

    function test_List_EscrowsToken_StoresAll() public {
        nft.mint(alice, 1);

        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 1 ether, 1 days);
        vm.stopPrank();

        assertEq(id, 1);
        assertEq(descent.listingCount(), 1);
        assertEq(nft.ownerOf(1), address(descent));

        Descent.ListingView memory lv = descent.listingOf(1);
        assertEq(lv.id, 1);
        assertEq(lv.seller, alice);
        assertEq(lv.nft, address(nft));
        assertEq(lv.tokenId, 1);
        assertEq(lv.startPrice, 10 ether);
        assertEq(lv.floorPrice, 1 ether);
        assertEq(lv.startAt, 1_760_000_000);
        assertEq(lv.duration, 1 days);
        assertEq(lv.state, uint8(Descent.State.Active));
        assertEq(lv.buyer, address(0));
        assertEq(lv.paid, 0);
        assertEq(lv.price, 10 ether);

        uint256[] memory aliceListings = descent.listingsBy(alice);
        assertEq(aliceListings.length, 1);
        assertEq(aliceListings[0], 1);
    }

    function test_List_Rejects_NonContract_BadPrices_BadDuration_NotOwner_NoApproval() public {
        // Non-contract
        vm.expectRevert(abi.encodeWithSelector(Descent.NotAContract.selector, address(0x123)));
        descent.list(address(0x123), 1, 10 ether, 1 ether, 1 days);

        // Bad prices (floor == 0)
        vm.expectRevert(abi.encodeWithSelector(Descent.BadPrices.selector, 10 ether, 0));
        descent.list(address(nft), 1, 10 ether, 0, 1 days);

        // Bad prices (start < floor)
        vm.expectRevert(abi.encodeWithSelector(Descent.BadPrices.selector, 1 ether, 2 ether));
        descent.list(address(nft), 1, 1 ether, 2 ether, 1 days);

        // Bad duration (< 10 minutes)
        vm.expectRevert(abi.encodeWithSelector(Descent.BadDuration.selector, 9 minutes));
        descent.list(address(nft), 1, 10 ether, 1 ether, 9 minutes);

        // Bad duration (> 30 days)
        vm.expectRevert(abi.encodeWithSelector(Descent.BadDuration.selector, 31 days));
        descent.list(address(nft), 1, 10 ether, 1 ether, 31 days);

        // Not token owner
        nft.mint(bob, 2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Descent.NotTokenOwner.selector, address(nft), 2, bob));
        descent.list(address(nft), 2, 10 ether, 1 ether, 1 days);

        // No approval
        nft.mint(alice, 3);
        vm.prank(alice);
        vm.expectRevert("NOT_AUTHORIZED");
        descent.list(address(nft), 3, 10 ether, 1 ether, 1 days);
    }

    function test_Price_AtStart_Mid_End_AfterEnd() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        // At start
        assertEq(descent.currentPrice(id), 10 ether);

        // 25% through (elapsed = 250s): drop = (8 ether * 250) / 1000 = 2 ether -> price = 8 ether
        vm.warp(1_760_000_000 + 250);
        assertEq(descent.currentPrice(id), 8 ether);

        // Halfway (elapsed = 500s): drop = (8 ether * 500) / 1000 = 4 ether -> price = 6 ether
        vm.warp(1_760_000_000 + 500);
        assertEq(descent.currentPrice(id), 6 ether);

        // At end (elapsed = 1000s): floor = 2 ether
        vm.warp(1_760_000_000 + 1000);
        assertEq(descent.currentPrice(id), 2 ether);

        // Past end (elapsed = 5000s): stays at floor = 2 ether
        vm.warp(1_760_000_000 + 5000);
        assertEq(descent.currentPrice(id), 2 ether);
    }

    uint256 private _fuzzTokenCounter = 1000;

    function testFuzz_PriceWithinBounds_AndMonotone(
        uint128 start,
        uint128 floor,
        uint32 duration,
        uint32 elapsed1,
        uint32 elapsed2
    ) public {
        floor = uint128(bound(floor, 1, 1_000_000 ether));
        start = uint128(bound(start, floor, 2_000_000 ether));
        duration = uint32(bound(duration, 10 minutes, 30 days));

        uint256 tid = ++_fuzzTokenCounter;
        nft.mint(alice, tid);
        vm.startPrank(alice);
        nft.approve(address(descent), tid);
        uint256 id = descent.list(address(nft), tid, start, floor, duration);
        vm.stopPrank();

        if (elapsed1 > elapsed2) {
            uint32 t = elapsed1;
            elapsed1 = elapsed2;
            elapsed2 = t;
        }

        vm.warp(uint256(1_760_000_000) + uint256(elapsed1));
        uint256 p1 = descent.currentPrice(id);

        vm.warp(uint256(1_760_000_000) + uint256(elapsed2));
        uint256 p2 = descent.currentPrice(id);

        // Monotone non-increasing
        assertTrue(p1 >= p2, "Price must be monotone non-increasing");
        // Bounds
        assertTrue(p1 <= start, "p1 above start");
        assertTrue(p2 >= floor, "p2 below floor");
    }

    function test_Buy_PaysSellerPending_TransfersToken() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        // Warp to halfway: price is 6 ether
        vm.warp(1_760_000_000 + 500);
        uint256 price = descent.currentPrice(id);
        assertEq(price, 6 ether);

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        descent.buy{value: price}(id);

        // Bob got the NFT
        assertEq(nft.ownerOf(1), bob);

        // Listing updated to Sold
        Descent.ListingView memory lv = descent.listingOf(id);
        assertEq(lv.state, uint8(Descent.State.Sold));
        assertEq(lv.buyer, bob);
        assertEq(lv.paid, 6 ether);
        assertEq(lv.price, 6 ether);

        // Alice pending balance increased by exactly price
        assertEq(descent.pending(alice), 6 ether);
        assertEq(address(descent).balance, 6 ether);
    }

    function test_Buy_Overpay_RefundsDifference() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        // Warp to halfway (6 ether)
        vm.warp(1_760_000_000 + 500);

        vm.deal(bob, 10 ether);
        uint256 bobBalBefore = bob.balance;

        // Bob sends 8 ether (2 ether overpay)
        vm.prank(bob);
        descent.buy{value: 8 ether}(id);

        uint256 bobBalAfter = bob.balance;
        // Bob was charged 6 ether and refunded 2 ether
        assertEq(bobBalBefore - bobBalAfter, 6 ether);
        assertEq(descent.pending(alice), 6 ether);
        assertEq(address(descent).balance, 6 ether);
    }

    function test_Buy_Underpay_Args() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        // Warp to halfway (6 ether)
        vm.warp(1_760_000_000 + 500);

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Descent.PriceNotMet.selector, 6 ether, 5 ether));
        descent.buy{value: 5 ether}(id);
    }

    function test_Buy_AfterEnd_AtFloor() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        // Warp past end (2000s)
        vm.warp(1_760_000_000 + 2000);
        assertEq(descent.currentPrice(id), 2 ether);

        vm.deal(bob, 2 ether);
        vm.prank(bob);
        descent.buy{value: 2 ether}(id);

        assertEq(nft.ownerOf(1), bob);
        assertEq(descent.pending(alice), 2 ether);
    }

    function test_Buy_Twice_NotActive() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        descent.buy{value: 10 ether}(id);

        // Charlie tries to buy again
        vm.deal(charlie, 10 ether);
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Descent.NotActive.selector, id, uint8(Descent.State.Sold)));
        descent.buy{value: 10 ether}(id);
    }

    function test_Cancel_ReturnsToken_SellerOnly() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        // Non-seller cannot cancel
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Descent.NotSeller.selector, id, bob));
        descent.cancel(id);

        // Seller cancels
        vm.prank(alice);
        descent.cancel(id);

        assertEq(nft.ownerOf(1), alice);

        Descent.ListingView memory lv = descent.listingOf(id);
        assertEq(lv.state, uint8(Descent.State.Cancelled));
        assertEq(lv.price, 2 ether); // floor price
    }

    function test_Cancel_AfterSale_NotActive() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        descent.buy{value: 10 ether}(id);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Descent.NotActive.selector, id, uint8(Descent.State.Sold)));
        descent.cancel(id);
    }

    function test_Cancel_ThenBuy_RevertsNotActive() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        vm.prank(alice);
        descent.cancel(id);

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Descent.NotActive.selector, id, uint8(Descent.State.Cancelled)));
        descent.buy{value: 10 ether}(id);
    }

    function test_Withdraw_Pays_Zeroes_Nothing() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 10 ether, 2 ether, 1000);
        vm.stopPrank();

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        descent.buy{value: 10 ether}(id);

        uint256 aliceBalBefore = alice.balance;
        assertEq(descent.pending(alice), 10 ether);

        vm.prank(alice);
        descent.withdraw();

        assertEq(alice.balance - aliceBalBefore, 10 ether);
        assertEq(descent.pending(alice), 0);
        assertEq(address(descent).balance, 0);

        // Calling withdraw again reverts NothingToWithdraw
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Descent.NothingToWithdraw.selector));
        descent.withdraw();
    }

    function test_HostileNFT_CannotReenter() public {
        HostileNFT hostile = new HostileNFT();
        hostile.mint(alice, 1);

        vm.startPrank(alice);
        hostile.approve(address(descent), 1);
        uint256 id = descent.list(address(hostile), 1, 5 ether, 1 ether, 1 days);
        vm.stopPrank();

        // Configure hostile NFT to attack during transferFrom
        hostile.setAttack(descent, id, true);

        vm.deal(bob, 5 ether);
        vm.prank(bob);
        // During buy(), transferFrom is called, which attempts descent.cancel(id) -> reverts Reentrancy
        vm.expectRevert(abi.encodeWithSelector(Descent.Reentrancy.selector));
        descent.buy{value: 5 ether}(id);

        // Contract remains safe and listing is still active
        Descent.ListingView memory lv = descent.listingOf(id);
        assertEq(lv.state, uint8(Descent.State.Active));
    }

    function test_HostileNFT_CannotReenter_List() public {
        HostileNFT hostile = new HostileNFT();
        hostile.mint(alice, 1);

        // Configure hostile to attack during transferFrom in list()
        hostile.setAttack(descent, 1, true);

        vm.startPrank(alice);
        hostile.approve(address(descent), 1);
        vm.expectRevert(abi.encodeWithSelector(Descent.Reentrancy.selector));
        descent.list(address(hostile), 1, 5 ether, 1 ether, 1 days);
        vm.stopPrank();
    }

    function test_HostileBuyer_CannotReenter() public {
        nft.mint(alice, 1);
        vm.startPrank(alice);
        nft.approve(address(descent), 1);
        uint256 id = descent.list(address(nft), 1, 5 ether, 1 ether, 1 days);
        vm.stopPrank();

        HostileBuyer hostileBuyer = new HostileBuyer(descent);
        vm.deal(address(hostileBuyer), 10 ether);

        // HostileBuyer overpays (sends 8 ether for 5 ether item).
        // During refund of 3 ether, receive() attempts to buy or withdraw, but nonReentrant blocks it.
        hostileBuyer.buyWithOverpay{value: 8 ether}(id);

        // Attack failed cleanly: NFT transferred to buyer, seller pending is 5 ether
        assertEq(nft.ownerOf(1), address(hostileBuyer));
        assertEq(descent.pending(alice), 5 ether);
        assertEq(address(descent).balance, 5 ether);
    }

    function test_Latest_ActiveOnly_Pagination() public {
        for (uint256 i = 1; i <= 5; i++) {
            nft.mint(alice, i);
            vm.startPrank(alice);
            nft.approve(address(descent), i);
            descent.list(address(nft), i, 10 ether, 1 ether, 1 days);
            vm.stopPrank();
        }

        // Cancel listing 2
        vm.prank(alice);
        descent.cancel(2);

        // Buy listing 4
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        descent.buy{value: 10 ether}(4);

        // Read all 5
        Descent.ListingView[] memory allListings = descent.latest(0, 10, false);
        assertEq(allListings.length, 5);
        assertEq(allListings[0].id, 5); // newest first
        assertEq(allListings[4].id, 1);

        // Read active only (should return 5, 3, 1 -> 3 items)
        Descent.ListingView[] memory activeListings = descent.latest(0, 10, true);
        assertEq(activeListings.length, 3);
        assertEq(activeListings[0].id, 5);
        assertEq(activeListings[1].id, 3);
        assertEq(activeListings[2].id, 1);
    }

    function test_GasSnapshot_List() public {
        nft.mint(alice, 999);
        vm.startPrank(alice);
        nft.approve(address(descent), 999);
        uint256 gasBefore = gasleft();
        descent.list(address(nft), 999, 10 ether, 1 ether, 1 days);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        assertLt(gasUsed, 230_000);
    }

    function test_GasSnapshot_Buy() public {
        nft.mint(alice, 998);
        vm.startPrank(alice);
        nft.approve(address(descent), 998);
        uint256 id = descent.list(address(nft), 998, 10 ether, 1 ether, 1 days);
        vm.stopPrank();

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        uint256 gasBefore = gasleft();
        descent.buy{value: 10 ether}(id);
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 130_000);
    }

    function test_GasSnapshot_Cancel() public {
        nft.mint(alice, 997);
        vm.startPrank(alice);
        nft.approve(address(descent), 997);
        uint256 id = descent.list(address(nft), 997, 10 ether, 1 ether, 1 days);
        vm.stopPrank();

        vm.prank(alice);
        uint256 gasBefore = gasleft();
        descent.cancel(id);
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 90_000);
    }

    function test_GasSnapshot_Withdraw() public {
        nft.mint(alice, 996);
        vm.startPrank(alice);
        nft.approve(address(descent), 996);
        uint256 id = descent.list(address(nft), 996, 10 ether, 1 ether, 1 days);
        vm.stopPrank();

        vm.deal(bob, 10 ether);
        vm.prank(bob);
        descent.buy{value: 10 ether}(id);

        vm.prank(alice);
        uint256 gasBefore = gasleft();
        descent.withdraw();
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 65_000);
    }

    function test_MockNFT_TokenURI_GenerativeSVG() public view {
        string memory uri1 = nft.tokenURI(1);
        string memory uri2 = nft.tokenURI(2);
        assertTrue(bytes(uri1).length > 0);
        assertTrue(bytes(uri2).length > 0);
        // Ensure uri begins with data:application/json;base64,
        bytes memory prefix = bytes("data:application/json;base64,");
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(bytes(uri1)[i], prefix[i]);
        }
        // Different token IDs produce different tokenURIs
        assertTrue(keccak256(bytes(uri1)) != keccak256(bytes(uri2)));
    }

    function invariant_BalanceEqualsPending() public view {
        uint256 sumPending = descent.pending(alice) +
            descent.pending(bob) +
            descent.pending(charlie);
        assertEq(address(descent).balance, sumPending);
    }
}
