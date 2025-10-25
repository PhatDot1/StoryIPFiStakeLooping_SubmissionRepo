// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IMetaPoolStIP.sol";
import "../interfaces/IWIP.sol";

/**
 * @title MetaPool4626Adapter
 * @notice Adapter for Meta Pool's stIP vault
 * @dev Meta Pool uses depositIP(address _receiver) payable
 */
contract MetaPool4626Adapter {
    using SafeERC20 for IERC20;

    IMetaPoolStIP public immutable stIP;
    address public immutable WIP;

    event Staked(address indexed user, uint256 assets, uint256 shares);
    event Unstaked(address indexed user, uint256 shares, uint256 assets);

    error ZeroAmount();
    error ZeroAddress();

    constructor(address _stIP, address _WIP) {
        require(_stIP != address(0) && _WIP != address(0), ZeroAddress());
        stIP = IMetaPoolStIP(_stIP);
        WIP = _WIP;
    }

    /**
     * @notice Stake IP into stIP vault
     * @param amount Amount of IP to stake (must equal msg.value)
     * @param receiver Receiver of stIP shares
     * @return shares Amount of stIP shares minted
     */
    function stakeIP(uint256 amount, address receiver) external payable returns (uint256 shares) {
        require(amount > 0, ZeroAmount());
        require(msg.value == amount, "Incorrect IP amount");

        // Call Meta Pool's depositIP(address) payable function
        shares = stIP.depositIP{value: amount}(receiver);

        emit Staked(receiver, amount, shares);
    }

    /**
     * @notice Unstake stIP for IP
     * @param shares Amount of stIP shares to redeem
     * @param receiver Receiver of IP
     * @param owner Owner of the shares
     * @return assets Amount of IP withdrawn
     */
    function unstakeIP(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        require(shares > 0, ZeroAmount());

        // Transfer stIP from owner to this contract if not already here
        if (owner != address(this)) {
            IERC20(address(stIP)).safeTransferFrom(owner, address(this), shares);
        }

        // Approve stIP contract to spend shares
        IERC20(address(stIP)).safeApprove(address(stIP), shares);

        // Redeem stIP for IP
        assets = stIP.redeem(shares, receiver, address(this));

        emit Unstaked(owner, shares, assets);
    }

    /**
     * @notice Get preview of shares for given assets
     */
    function previewStake(uint256 assets) external view returns (uint256) {
        return stIP.previewDeposit(assets);
    }

    /**
     * @notice Get preview of assets for given shares
     */
    function previewUnstake(uint256 shares) external view returns (uint256) {
        return stIP.previewRedeem(shares);
    }

    /**
     * @notice Get stIP balance of an account
     */
    function getStIPBalance(address account) external view returns (uint256) {
        return stIP.balanceOf(account);
    }

    /**
     * @notice Convert shares to assets
     */
    function convertToAssets(uint256 shares) external view returns (uint256) {
        return stIP.convertToAssets(shares);
    }

    /**
     * @notice Convert assets to shares
     */
    function convertToShares(uint256 assets) external view returns (uint256) {
        return stIP.convertToShares(assets);
    }

    // Receive IP from redemptions
    receive() external payable {}
}