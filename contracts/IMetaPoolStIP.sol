// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IMetaPoolStIP
 * @notice Interface for Meta Pool's stIP contract
 * @dev Uses depositIP(address) payable instead of standard ERC4626
 */
interface IMetaPoolStIP is IERC20 {
    // Meta Pool specific deposit - takes msg.value as amount
    function depositIP(address _receiver) external payable returns (uint256 shares);
    
    // Standard ERC4626 functions
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function previewDeposit(uint256 assets) external view returns (uint256 shares);
    function previewRedeem(uint256 shares) external view returns (uint256 assets);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
    function convertToShares(uint256 assets) external view returns (uint256 shares);
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
}