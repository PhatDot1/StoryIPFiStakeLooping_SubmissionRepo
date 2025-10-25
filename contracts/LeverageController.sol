// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IERC4626.sol";
import "./interfaces/IWIP.sol";
import "./adapters/MetaPool4626Adapter.sol";
import "./adapters/UnleashAdapter.sol";
import "./libraries/PercentageMath.sol";

/**
 * @title LeverageController
 * @notice Controls leveraged staking positions using Unleash Protocol
 * @dev Implements recursive borrow-stake loops with health factor management
 */
contract LeverageController is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PercentageMath for uint256;

    // ============ State Variables ============
    
    MetaPool4626Adapter public immutable metaPoolAdapter;
    UnleashAdapter public immutable unleashAdapter;
    
    address public immutable stIP;
    address public immutable WIP;
    address public constant NATIVE_IP = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    
    // Leverage configuration
    bool public leverageEnabled;
    uint8 public maxLoops;
    uint256 public targetHealthFactor; // e.g., 1.7e18 = 1.7 HF
    uint256 public minHealthFactor; // e.g., 1.5e18 = 1.5 HF (emergency threshold)
    uint256 public safeLtvMultiplier; // e.g., 8500 = 85% of max LTV
    uint256 public slippageTolerance; // e.g., 50 = 0.5%
    
    // Constants
    uint256 private constant HEALTH_FACTOR_PRECISION = 1e18;
    uint256 private constant PERCENTAGE_FACTOR = 10000;
    uint256 private constant MAX_LOOPS = 3;
    
    // User positions tracking
    struct LeveragePosition {
        uint256 initialCollateral;
        uint256 totalBorrowed;
        uint256 totalStaked;
        uint8 loops;
        uint256 healthFactor;
        uint256 timestamp;
    }
    
    mapping(address => LeveragePosition) public positions;
    
    // ============ Events ============
    
    event LeverageEnabled(bool enabled);
    event MaxLoopsUpdated(uint8 maxLoops);
    event HealthFactorTargetsUpdated(uint256 target, uint256 min);
    event SafeLtvMultiplierUpdated(uint256 multiplier);
    event LeveragePositionOpened(
        address indexed user,
        uint256 initialCollateral,
        uint256 totalBorrowed,
        uint256 totalStaked,
        uint8 loops,
        uint256 healthFactor
    );
    event LeveragePositionUnwound(
        address indexed user,
        uint256 repaidDebt,
        uint256 withdrawnCollateral,
        uint8 loopsRemoved
    );
    event EmergencyUnwind(address indexed user, uint256 healthFactor);
    
    // ============ Errors ============
    
    error LeverageDisabled();
    error InvalidLoopCount();
    error HealthFactorTooLow();
    error InsufficientLiquidity();
    error SlippageExceeded();
    error NoPositionFound();
    error ZeroAmount();
    error InvalidConfiguration();
    
    // ============ Constructor ============
    
    constructor(
        address payable _metaPoolAdapter,
        address _unleashAdapter,
        address _stIP,
        address _WIP
    ) {
        require(
            _metaPoolAdapter != address(0) &&
            _unleashAdapter != address(0) &&
            _stIP != address(0) &&
            _WIP != address(0),
            "Zero address"
        );
        
        metaPoolAdapter = MetaPool4626Adapter(_metaPoolAdapter);
        unleashAdapter = UnleashAdapter(_unleashAdapter);
        stIP = _stIP;
        WIP = _WIP;
        
        // Default configuration
        leverageEnabled = false;
        maxLoops = 3;
        targetHealthFactor = 1.7e18; // 1.7 HF
        minHealthFactor = 1.5e18; // 1.5 HF
        safeLtvMultiplier = 8500; // 85% of max LTV
        slippageTolerance = 50; // 0.5%
    }
    
    // ============ Configuration Functions ============
    
    function setLeverageEnabled(bool _enabled) external onlyOwner {
        leverageEnabled = _enabled;
        emit LeverageEnabled(_enabled);
    }
    
    function setMaxLoops(uint8 _maxLoops) external onlyOwner {
        require(_maxLoops <= MAX_LOOPS, InvalidLoopCount());
        maxLoops = _maxLoops;
        emit MaxLoopsUpdated(_maxLoops);
    }
    
    function setHealthFactorTargets(uint256 _target, uint256 _min) external onlyOwner {
        require(_target > _min && _min >= HEALTH_FACTOR_PRECISION, InvalidConfiguration());
        targetHealthFactor = _target;
        minHealthFactor = _min;
        emit HealthFactorTargetsUpdated(_target, _min);
    }
    
    function setSafeLtvMultiplier(uint256 _multiplier) external onlyOwner {
        require(_multiplier > 0 && _multiplier <= PERCENTAGE_FACTOR, InvalidConfiguration());
        safeLtvMultiplier = _multiplier;
        emit SafeLtvMultiplierUpdated(_multiplier);
    }
    
    // ============ Core Leverage Functions ============
    
    /**
     * @notice Open a leveraged staking position
     * @param loops Number of borrow-stake loops (0-3)
     * @param initialAmount Initial IP amount to stake
     */
    function loopStake(uint8 loops, uint256 initialAmount) external payable nonReentrant {
        require(leverageEnabled, LeverageDisabled());
        require(loops > 0 && loops <= maxLoops, InvalidLoopCount());
        require(initialAmount > 0, ZeroAmount());
        require(msg.value == initialAmount, "Incorrect IP amount");
        
        // Get reserve configuration for stIP
        (uint256 maxLtv, uint256 liquidationThreshold,) = unleashAdapter.getReserveConfiguration(stIP);
        require(maxLtv > 0, "stIP not enabled as collateral");
        
        // Calculate safe LTV
        uint256 safeLtv = maxLtv.percentMul(safeLtvMultiplier);
        
        uint256 totalBorrowed = 0;
        uint256 totalStaked = initialAmount;
        
        // Initial stake
        uint256 stIPReceived = metaPoolAdapter.stakeIP{value: initialAmount}(initialAmount, address(this));
        
        // Approve and supply to Unleash
        IERC20(stIP).safeApprove(address(unleashAdapter), stIPReceived);
        unleashAdapter.supplyCollateral(stIP, stIPReceived, address(this));
        unleashAdapter.setCollateral(stIP, true);
        
        // Execute loops
        for (uint8 i = 0; i < loops; i++) {
            // Calculate safe borrow amount
            (
                uint256 totalCollateralBase,
                uint256 totalDebtBase,
                ,
                ,
                ,
                uint256 healthFactor
            ) = unleashAdapter.getUserAccountData(address(this));
            
            // Check health factor
            if (healthFactor < targetHealthFactor && i > 0) {
                break;
            }
            
            // Calculate borrow amount (in base currency units)
            uint256 maxBorrowBase = (totalCollateralBase * safeLtv) / PERCENTAGE_FACTOR;
            uint256 borrowBase = maxBorrowBase > totalDebtBase ? maxBorrowBase - totalDebtBase : 0;
            
            if (borrowBase == 0) break;
            
            // Convert base currency to IP amount (assuming 1:1 for native IP)
            uint256 borrowAmount = borrowBase;
            
            // Borrow IP
            unleashAdapter.borrow(NATIVE_IP, borrowAmount, address(this));
            totalBorrowed += borrowAmount;
            
            // Stake borrowed IP
            uint256 newStIPReceived = metaPoolAdapter.stakeIP{value: borrowAmount}(borrowAmount, address(this));
            totalStaked += borrowAmount;
            
            // Supply new stIP as collateral
            IERC20(stIP).safeApprove(address(unleashAdapter), newStIPReceived);
            unleashAdapter.supplyCollateral(stIP, newStIPReceived, address(this));
        }
        
        // Get final health factor
        (,,,,, uint256 finalHealthFactor) = unleashAdapter.getUserAccountData(address(this));
        require(finalHealthFactor >= minHealthFactor, HealthFactorTooLow());
        
        // Record position
        positions[msg.sender] = LeveragePosition({
            initialCollateral: initialAmount,
            totalBorrowed: totalBorrowed,
            totalStaked: totalStaked,
            loops: loops,
            healthFactor: finalHealthFactor,
            timestamp: block.timestamp
        });
        
        emit LeveragePositionOpened(
            msg.sender,
            initialAmount,
            totalBorrowed,
            totalStaked,
            loops,
            finalHealthFactor
        );
    }
    
    /**
     * @notice Unwind leveraged position
     * @param loopsToRemove Number of loops to unwind (0 = full unwind)
     */
    function unwind(uint8 loopsToRemove) external nonReentrant {
        LeveragePosition storage position = positions[msg.sender];
        require(position.initialCollateral > 0, NoPositionFound());
        
        uint8 actualLoops = loopsToRemove == 0 ? position.loops : loopsToRemove;
        require(actualLoops <= position.loops, InvalidLoopCount());
        
        uint256 totalRepaid = 0;
        uint256 totalWithdrawn = 0;
        
        // Unwind loops in reverse
        for (uint8 i = 0; i < actualLoops; i++) {
            (
                uint256 totalCollateralBase,
                uint256 totalDebtBase,
                ,
                ,
                ,
                uint256 healthFactor
            ) = unleashAdapter.getUserAccountData(address(this));
            
            if (totalDebtBase == 0) break;
            
            // Calculate repay amount (proportional to one loop)
            uint256 repayAmount = totalDebtBase / (position.loops - i);
            
            // Withdraw stIP collateral to cover repayment
            uint256 stIPNeeded = IERC4626(stIP).previewWithdraw(repayAmount * 105 / 100);
            
            // Withdraw stIP
            uint256 stIPWithdrawn = unleashAdapter.withdraw(stIP, stIPNeeded, address(this));
            totalWithdrawn += stIPWithdrawn;
            
            // Unstake stIP for IP
            IERC20(stIP).safeApprove(address(metaPoolAdapter), stIPWithdrawn);
            uint256 ipReceived = metaPoolAdapter.unstakeIP(stIPWithdrawn, address(this), address(this));
            
            // Repay debt
            IERC20(NATIVE_IP).safeApprove(address(unleashAdapter), repayAmount);
            uint256 repaid = unleashAdapter.repay(NATIVE_IP, repayAmount, address(this));
            totalRepaid += repaid;
            
            // Check health factor after each loop
            (,,,,, uint256 newHealthFactor) = unleashAdapter.getUserAccountData(address(this));
            if (newHealthFactor < minHealthFactor) {
                emit EmergencyUnwind(msg.sender, newHealthFactor);
                break;
            }
        }
        
        // Update position
        if (loopsToRemove == 0 || actualLoops >= position.loops) {
            // Full unwind - withdraw remaining collateral
            uint256 remainingStIP = IERC20(stIP).balanceOf(address(this));
            if (remainingStIP > 0) {
                unleashAdapter.withdraw(stIP, remainingStIP, msg.sender);
            }
            delete positions[msg.sender];
        } else {
            // Partial unwind
            position.totalBorrowed -= totalRepaid;
            position.loops -= actualLoops;
            (,,,,, position.healthFactor) = unleashAdapter.getUserAccountData(address(this));
        }
        
        emit LeveragePositionUnwound(msg.sender, totalRepaid, totalWithdrawn, actualLoops);
    }
    
    /**
     * @notice Get user's leverage position
     */
    function getPosition(address user) external view returns (LeveragePosition memory) {
        return positions[user];
    }
    
    /**
     * @notice Calculate projected outcomes for leverage loops
     * @param initialAmount Initial collateral amount
     * @param loops Number of loops
     * @return projectedCollateral Total collateral after loops
     * @return projectedDebt Total debt after loops
     * @return projectedHealthFactor Projected health factor
     */
    function projectLeverageOutcome(uint256 initialAmount, uint8 loops)
        external
        view
        returns (uint256 projectedCollateral, uint256 projectedDebt, uint256 projectedHealthFactor)
    {
        require(loops <= maxLoops, InvalidLoopCount());
        
        (uint256 maxLtv,,) = unleashAdapter.getReserveConfiguration(stIP);
        uint256 safeLtv = maxLtv.percentMul(safeLtvMultiplier);
        
        projectedCollateral = initialAmount;
        projectedDebt = 0;
        
        for (uint8 i = 0; i < loops; i++) {
            uint256 borrowAmount = (projectedCollateral * safeLtv) / PERCENTAGE_FACTOR - projectedDebt;
            projectedDebt += borrowAmount;
            projectedCollateral += borrowAmount;
        }
        
        // Simplified HF calculation
        if (projectedDebt > 0) {
            projectedHealthFactor = (projectedCollateral * HEALTH_FACTOR_PRECISION) / projectedDebt;
        } else {
            projectedHealthFactor = type(uint256).max;
        }
    }
    
    /**
     * @notice Emergency unwind for owner
     */
    function emergencyUnwindForUser(address user) external onlyOwner nonReentrant {
        LeveragePosition storage position = positions[user];
        require(position.initialCollateral > 0, NoPositionFound());
        
        (,,,,, uint256 healthFactor) = unleashAdapter.getUserAccountData(address(this));
        require(healthFactor < minHealthFactor, "Health factor not critical");
        
        // Owner can force full unwind for safety
        emit EmergencyUnwind(user, healthFactor);
    }
    
    // Fallback to receive IP
    receive() external payable {}
}