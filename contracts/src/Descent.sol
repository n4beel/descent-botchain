// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @notice Minimal interface for ERC-721 tokens escrowed by Descent.
interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title Descent
/// @notice A Dutch auction engine for ERC-721 tokens on BOT Chain.
/// Prices fall continuously from a start price to a floor price until bought or cancelled.
contract Descent {
    uint64 public constant MIN_DURATION = 10 minutes;
    uint64 public constant MAX_DURATION = 30 days;
    uint256 public constant MAX_PAGE = 50;

    enum State {
        Active,
        Sold,
        Cancelled
    }

    struct Listing {
        address seller; // slot 1: 20 bytes
        uint64 startAt; // 8 bytes
        uint32 createdBlock; // 4 bytes
        address nft; // slot 2: 20 bytes
        uint64 duration; // 8 bytes
        uint8 state; // 1 byte (0: Active, 1: Sold, 2: Cancelled)
        uint256 tokenId; // slot 3: 32 bytes
        uint128 startPrice; // slot 4: 16 bytes
        uint128 floorPrice; // 16 bytes
    }

    struct ListingView {
        uint256 id;
        address seller;
        address nft;
        uint256 tokenId;
        uint128 startPrice;
        uint128 floorPrice;
        uint64 startAt;
        uint64 duration;
        uint32 createdBlock;
        uint8 state;
        address buyer;
        uint128 paid;
        uint256 price;
    }

    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => address) private _buyer;
    mapping(uint256 => uint128) private _paid;
    mapping(address => uint256) public pending;
    mapping(address => uint256[]) private _listingsBy;
    uint256 public listingCount;

    bool private _locked;

    // Events
    event Listed(
        uint256 indexed id,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint128 startPrice,
        uint128 floorPrice,
        uint64 startAt,
        uint64 duration
    );
    event Bought(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 price
    );
    event Cancelled(uint256 indexed id, address indexed seller);
    event Withdrawn(address indexed seller, uint256 amount);

    // Errors
    error NotAContract(address nft);
    error BadPrices(uint128 start, uint128 floor);
    error BadDuration(uint64 duration);
    error NotTokenOwner(address nft, uint256 tokenId, address owner);
    error EscrowFailed();
    error NoSuchListing(uint256 id);
    error NotActive(uint256 id, uint8 state);
    error PriceNotMet(uint256 price, uint256 sent);
    error NotSeller(uint256 id, address caller);
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    /// @notice Lists an ERC-721 token for sale with a continuous linear price decay.
    /// @param nft The ERC-721 token contract address.
    /// @param tokenId The identifier of the token being listed.
    /// @param startPrice Initial listing price in wei.
    /// @param floorPrice Minimum final price in wei.
    /// @param duration Total decay duration in seconds.
    function list(
        address nft,
        uint256 tokenId,
        uint128 startPrice,
        uint128 floorPrice,
        uint64 duration
    ) external nonReentrant returns (uint256 id) {
        if (nft.code.length == 0) revert NotAContract(nft);
        if (floorPrice == 0 || startPrice < floorPrice) {
            revert BadPrices(startPrice, floorPrice);
        }
        if (duration < MIN_DURATION || duration > MAX_DURATION) {
            revert BadDuration(duration);
        }

        address currentOwner = IERC721(nft).ownerOf(tokenId);
        if (currentOwner != msg.sender) {
            revert NotTokenOwner(nft, tokenId, currentOwner);
        }

        // Escrow token into this contract
        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);
        if (IERC721(nft).ownerOf(tokenId) != address(this)) {
            revert EscrowFailed();
        }

        id = ++listingCount;

        _listings[id] = Listing({
            seller: msg.sender,
            startAt: uint64(block.timestamp),
            createdBlock: uint32(block.number),
            nft: nft,
            duration: duration,
            state: uint8(State.Active),
            tokenId: tokenId,
            startPrice: startPrice,
            floorPrice: floorPrice
        });

        _listingsBy[msg.sender].push(id);

        emit Listed(
            id,
            msg.sender,
            nft,
            tokenId,
            startPrice,
            floorPrice,
            uint64(block.timestamp),
            duration
        );
    }

    /// @notice Buys an active listing at the current decaying price.
    /// Excess funds are refunded immediately to the buyer.
    /// @param id The listing ID to buy.
    function buy(uint256 id) external payable nonReentrant {
        if (id == 0 || id > listingCount) revert NoSuchListing(id);
        Listing storage l = _listings[id];
        if (l.state != uint8(State.Active)) revert NotActive(id, l.state);

        uint256 price = _calculatePrice(l);
        if (msg.value < price) revert PriceNotMet(price, msg.value);

        // Effects before interactions
        l.state = uint8(State.Sold);
        _buyer[id] = msg.sender;
        _paid[id] = uint128(price);
        pending[l.seller] += price;

        // Interactions
        IERC721(l.nft).transferFrom(address(this), msg.sender, l.tokenId);

        if (msg.value > price) {
            uint256 refundAmount = msg.value - price;
            (bool ok, ) = msg.sender.call{value: refundAmount}("");
            if (!ok) revert TransferFailed();
        }

        emit Bought(id, msg.sender, l.seller, price);
    }

    /// @notice Cancels an active listing and returns the escrowed token to the seller.
    /// @param id The listing ID to cancel.
    function cancel(uint256 id) external nonReentrant {
        if (id == 0 || id > listingCount) revert NoSuchListing(id);
        Listing storage l = _listings[id];
        if (l.seller != msg.sender) revert NotSeller(id, msg.sender);
        if (l.state != uint8(State.Active)) revert NotActive(id, l.state);

        l.state = uint8(State.Cancelled);

        IERC721(l.nft).transferFrom(address(this), l.seller, l.tokenId);

        emit Cancelled(id, msg.sender);
    }

    /// @notice Withdraws accrued proceeds from sales.
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Calculates the current price for a listing according to continuous time decay.
    /// @param id The listing ID.
    function currentPrice(uint256 id) external view returns (uint256) {
        if (id == 0 || id > listingCount) revert NoSuchListing(id);
        Listing storage l = _listings[id];
        if (l.state == uint8(State.Sold)) return _paid[id];
        if (l.state == uint8(State.Cancelled)) return l.floorPrice;
        return _calculatePrice(l);
    }

    /// @notice Internal pure decay formula:
    /// elapsed = block.timestamp - startAt
    /// if elapsed >= duration: floorPrice
    /// else: startPrice - ((startPrice - floorPrice) * elapsed) / duration
    function _calculatePrice(Listing storage l) internal view returns (uint256) {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= l.startAt) return l.startPrice;
        // forge-lint: disable-next-line(block-timestamp)
        uint256 elapsed = block.timestamp - l.startAt;
        if (elapsed >= l.duration) return l.floorPrice;
        uint256 drop = (uint256(l.startPrice - l.floorPrice) * elapsed) / l.duration;
        return uint256(l.startPrice) - drop;
    }

    /// @notice Returns full view metadata for a listing.
    function listingOf(uint256 id) public view returns (ListingView memory) {
        if (id == 0 || id > listingCount) revert NoSuchListing(id);
        Listing storage l = _listings[id];

        uint256 pr;
        if (l.state == uint8(State.Sold)) {
            pr = _paid[id];
        } else if (l.state == uint8(State.Cancelled)) {
            pr = l.floorPrice;
        } else {
            pr = _calculatePrice(l);
        }

        return ListingView({
            id: id,
            seller: l.seller,
            nft: l.nft,
            tokenId: l.tokenId,
            startPrice: l.startPrice,
            floorPrice: l.floorPrice,
            startAt: l.startAt,
            duration: l.duration,
            createdBlock: l.createdBlock,
            state: l.state,
            buyer: _buyer[id],
            paid: _paid[id],
            price: pr
        });
    }

    /// @notice Returns newest listings paginated, optionally filtered to active only.
    function latest(
        uint256 offset,
        uint256 count,
        bool activeOnly
    ) external view returns (ListingView[] memory) {
        if (count > MAX_PAGE) count = MAX_PAGE;
        if (listingCount == 0 || offset >= listingCount) {
            return new ListingView[](0);
        }

        uint256 remaining = listingCount - offset;
        uint256 limit = count < remaining ? count : remaining;

        // Count matching items
        uint256 matchCount = 0;
        for (uint256 i = 0; i < limit; i++) {
            uint256 id = listingCount - offset - i;
            if (!activeOnly || _listings[id].state == uint8(State.Active)) {
                matchCount++;
            }
        }

        ListingView[] memory views = new ListingView[](matchCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < limit; i++) {
            uint256 id = listingCount - offset - i;
            if (!activeOnly || _listings[id].state == uint8(State.Active)) {
                views[idx++] = listingOf(id);
            }
        }

        return views;
    }

    /// @notice Returns all listing IDs created by a seller.
    function listingsBy(address seller) external view returns (uint256[] memory) {
        return _listingsBy[seller];
    }
}
