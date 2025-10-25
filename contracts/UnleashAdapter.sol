// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/aave/IPool.sol";
import "../interfaces/aave/IPoolAddressesProvider.sol";
import "../interfaces/aave/IPriceOracle.sol";
import "../interfaces/aave/IVariableDebtToken.sol";

/**
 * @title UnleashAdapter
 * @notice Adapter for Unleash Protocol (Aave V3 fork) money market operations
 */
contract UnleashAdapter {
    using SafeERC20 for IERC20;

    IPoolAddressesProvider public immutable addressesProvider;
    uint256 public constant INTEREST_RATE_MODE_VARIABLE = 2;
    uint256 private constant LTV_PRECISION = 10000; // 100.00%

    event Supplied(address indexed asset, uint256 amount, address indexed onBehalfOf);
    event Borrowed(address indexed asset, uint256 amount, address indexed onBehalfOf);
    event Repaid(address indexed asset, uint256 amount, address indexed onBehalfOf);
    event Withdrawn(address indexed asset, uint256 amount, address indexed to);
    event CollateralSet(address indexed asset, bool useAsCollateral);

    error ZeroAmount();
    error ZeroAddress();
    error HealthFactorTooLow();

    constructor(address _addressesProvider) {
        require(_addressesProvider != address(0), ZeroAddress());
        addressesProvider = IPoolAddressesProvider(_addressesProvider);
    }

    /**
     * @notice Get the Pool contract
     */
    function getPool() public view returns (IPool) {
        return IPool(addressesProvider.getPool());
    }

    /**
     * @notice Get the Price Oracle
     */
    function getPriceOracle() public view returns (IPriceOracle) {
        return IPriceOracle(addressesProvider.getPriceOracle());
    }

    /**
     * @notice Supply collateral to Unleash - simplified version
     * @param asset The asset to supply
     * @param amount The amount to supply
     * @param onBehalfOf The address receiving the aTokens
     */
    function supplyCollateral(address asset, uint256 amount, address onBehalfOf) external {
        require(amount > 0, ZeroAmount());
        
        IPool pool = getPool();
        
        // Transfer tokens from sender to this contract
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve pool to spend tokens
        IERC20(asset).safeApprove(address(pool), amount);
        
        // Call supply directly without Pyth updates
        pool.supply(asset, amount, onBehalfOf, 0);
        
        emit Supplied(asset, amount, onBehalfOf);
    }

    /**
     * @notice Set an asset to be used as collateral
     * @param asset The asset address
     * @param useAsCollateral True to use as collateral
     */
    function setCollateral(address asset, bool useAsCollateral) external {
        getPool().setUserUseReserveAsCollateral(asset, useAsCollateral);
        emit CollateralSet(asset, useAsCollateral);
    }

    /**
     * @notice Borrow assets from Unleash
     * @param asset The asset to borrow
     * @param amount The amount to borrow
     * @param onBehalfOf The address receiving the borrowed funds
     */
    function borrow(address asset, uint256 amount, address onBehalfOf) external {
        require(amount > 0, ZeroAmount());
        
        getPool().borrow(asset, amount, INTEREST_RATE_MODE_VARIABLE, 0, onBehalfOf);
        
        emit Borrowed(asset, amount, onBehalfOf);
    }

    /**
     * @notice Repay borrowed assets
     * @param asset The asset to repay
     * @param amount The amount to repay
     * @param onBehalfOf The address whose debt is being repaid
     */
    function repay(address asset, uint256 amount, address onBehalfOf) external returns (uint256) {
        require(amount > 0, ZeroAmount());
        
        IPool pool = getPool();
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).safeApprove(address(pool), amount);
        
        uint256 repaidAmount = pool.repay(asset, amount, INTEREST_RATE_MODE_VARIABLE, onBehalfOf);
        
        emit Repaid(asset, repaidAmount, onBehalfOf);
        return repaidAmount;
    }

    /**
     * @notice Withdraw supplied collateral
     * @param asset The asset to withdraw
     * @param amount The amount to withdraw (use type(uint256).max for full withdrawal)
     * @param to The address receiving the withdrawn funds
     */
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        require(amount > 0, ZeroAmount());
        
        uint256 withdrawnAmount = getPool().withdraw(asset, amount, to);
        
        emit Withdrawn(asset, withdrawnAmount, to);
        return withdrawnAmount;
    }

    /**
     * @notice Get user account data
     * @param user The user address
     * @return totalCollateralBase Total collateral in base currency
     * @return totalDebtBase Total debt in base currency
     * @return availableBorrowsBase Available borrows in base currency
     * @return currentLiquidationThreshold Current liquidation threshold
     * @return ltv Loan to value
     * @return healthFactor Health factor
     */
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return getPool().getUserAccountData(user);
    }

    /**
     * @notice Get reserve configuration
     * @param asset The asset address
     * @return ltv The loan to value
     * @return liquidationThreshold The liquidation threshold
     * @return liquidationBonus The liquidation bonus
     */
    function getReserveConfiguration(address asset)
        external
        view
        returns (uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus)
    {
        IPool.ReserveData memory reserveData = getPool().getReserveData(asset);
        uint256 data = reserveData.configuration.data;
        
        ltv = data & 0xFFFF; // First 16 bits
        liquidationThreshold = (data >> 16) & 0xFFFF; // Next 16 bits
        liquidationBonus = (data >> 32) & 0xFFFF; // Next 16 bits
    }

    /**
     * @notice Get asset price from oracle
     * @param asset The asset address
     * @return price The asset price
     */
    function getAssetPrice(address asset) external view returns (uint256) {
        return getPriceOracle().getAssetPrice(asset);
    }

    /**
     * @notice Approve debt delegation
     * @param debtToken The variable debt token address
     * @param delegatee The address to delegate to
     * @param amount The amount to approve
     */
    function approveDelegation(address debtToken, address delegatee, uint256 amount) external {
        IVariableDebtToken(debtToken).approveDelegation(delegatee, amount);
    }
}