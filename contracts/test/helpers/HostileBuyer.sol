// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Descent} from "../../src/Descent.sol";

contract HostileBuyer {
    Descent public descent;
    uint256 public targetListingId;
    bool public attacked;

    constructor(Descent _descent) {
        descent = _descent;
    }

    function buyWithOverpay(uint256 id) external payable {
        targetListingId = id;
        attacked = false;
        descent.buy{value: msg.value}(id);
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            // Attempt to reenter buy on same listing or withdraw
            try descent.buy{value: msg.value}(targetListingId) {} catch {}
            try descent.withdraw() {} catch {}
        }
    }
}
