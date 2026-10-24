// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {MockNFT} from "./MockNFT.sol";
import {Descent} from "../../src/Descent.sol";

contract HostileNFT is MockNFT {
    Descent public descent;
    uint256 public targetListingId;
    bool public shouldAttack;

    function setAttack(Descent _descent, uint256 _id, bool _should) external {
        descent = _descent;
        targetListingId = _id;
        shouldAttack = _should;
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (shouldAttack) {
            shouldAttack = false; // prevent infinite loop
            // Attempt to reenter cancel or buy
            descent.cancel(targetListingId);
        }
        super.transferFrom(from, to, tokenId);
    }
}
