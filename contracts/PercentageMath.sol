// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library PercentageMath {
    uint256 constant PERCENTAGE_FACTOR = 1e4; // 100.00%
    uint256 constant HALF_PERCENTAGE_FACTOR = 5e3; // 50.00%

    function percentMul(uint256 value, uint256 percentage) internal pure returns (uint256) {
        if (value == 0 || percentage == 0) {
            return 0;
        }
        return (value * percentage + HALF_PERCENTAGE_FACTOR) / PERCENTAGE_FACTOR;
    }

    function percentDiv(uint256 value, uint256 percentage) internal pure returns (uint256) {
        require(percentage != 0, "Division by zero");
        uint256 halfPercentage = percentage / 2;
        return (value * PERCENTAGE_FACTOR + halfPercentage) / percentage;
    }
}