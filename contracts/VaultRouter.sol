// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IERC4626.sol";
import "./interfaces/IWIP.sol";
import "./interfaces/ISwapRouter.sol";
import "./adapters/MetaPool4626Adapter.sol";
import "./LeverageController.sol";

/**
 * @title VaultRouter
 * @notice Main router for IP Rewards Autostaker Vault
 * @dev Coordinates sweeping, swapping, staking, and optional leverage
 */
contract VaultRouter is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Risk Presets ============
    
    enum RiskPreset {
        CONSERVATIVE, // 100% stIP, no leverage
        BALANCED,     // 100% stIP, 1x leverage
        MODERATE,     // 100% stIP, 2x leverage
        AGGRESSIVE    // 100% stIP, 3x leverage
    }

    // ============ State Variables ============
    
    MetaPool4626Adapter public immutable metaPoolAdapter;
    LeverageController public leverageController;
    ISwapRouter public swapRouter;
    
    address public immutable stIP;
    address public immutable WIP;
    address public treasury;
    
    // User configurations
    struct UserConfig {
        RiskPreset preset;
        address royaltySource;
        uint256 lastCompound;
        bool autoCompound;
    }
    
    mapping(address => UserConfig) public userConfigs;
    
    // Whitelisted revenue tokens
    mapping(address => bool) public whitelistedTokens;
    
    // Fee configuration
    uint256 public performanceFee; // Basis points
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MAX_PERFORMANCE_FEE = 1000; // 10% max
    
    // ============ Events ============
    
    event PresetConfigured(address indexed user, RiskPreset preset);
    event RoyaltySourceSet(address indexed user, address indexed source);
    event Swept(address indexed user, address indexed token, uint256 amount);
    event Staked(address indexed user, uint256 amount, RiskPreset preset);
    event Compounded(address indexed user, uint256 rewards);
    event Unstaked(address indexed user, uint256 shares, uint256 assets);
    event TokenWhitelisted(address indexed token, bool status);
    event SwapRouterUpdated(address indexed newRouter);
    event TreasuryUpdated(address indexed newTreasury);
    event PerformanceFeeUpdated(uint256 newFee);
    
    // ============ Errors ============
    
    error TokenNotWhitelisted();
    error InvalidPreset();
    error NoRoyaltySource();
    error InsufficientBalance();
    error ZeroAmount();
    error InvalidFee();
    error SwapFailed();
    
// ============ Constructor ============
    
    constructor(
        address payable _metaPoolAdapter,
        address _stIP,
        address _WIP,
        address _treasury
    ) {
        require(
            _metaPoolAdapter != address(0) &&
            _stIP != address(0) &&
            _WIP != address(0) &&
            _treasury != address(0),
            "Zero address"
        );
        
        metaPoolAdapter = MetaPool4626Adapter(_metaPoolAdapter);
        stIP = _stIP;
        WIP = _WIP;
        treasury = _treasury;
        performanceFee = 200; // 2% default
        
        // Whitelist WIP by default
        whitelistedTokens[WIP] = true;
    }
    
    // ============ Configuration Functions ============
    
    function setLeverageController(address _leverageController) external onlyOwner {
        leverageController = LeverageController(payable(_leverageController));
    }
    
    function setSwapRouter(address _swapRouter) external onlyOwner {
        require(_swapRouter != address(0), "Zero address");
        swapRouter = ISwapRouter(_swapRouter);
        emit SwapRouterUpdated(_swapRouter);
    }
    
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
    
    function setPerformanceFee(uint256 _fee) external onlyOwner {
        require(_fee <= MAX_PERFORMANCE_FEE, InvalidFee());
        performanceFee = _fee;
        emit PerformanceFeeUpdated(_fee);
    }
    
    function setTokenWhitelist(address token, bool status) external onlyOwner {
        whitelistedTokens[token] = status;
        emit TokenWhitelisted(token, status);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ User Configuration ============
    
    function configureRoute(
        RiskPreset preset,
        address royaltySource,
        bool autoCompound
    ) external {
        require(uint8(preset) <= uint8(RiskPreset.AGGRESSIVE), InvalidPreset());
        
        userConfigs[msg.sender] = UserConfig({
            preset: preset,
            royaltySource: royaltySource,
            lastCompound: block.timestamp,
            autoCompound: autoCompound
        });
        
        emit PresetConfigured(msg.sender, preset);
        emit RoyaltySourceSet(msg.sender, royaltySource);
    }
    
    // ============ Core Staking Functions ============
    
    function sweepAndStake(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(whitelistedTokens[token], TokenNotWhitelisted());
        
        UserConfig memory config = userConfigs[msg.sender];
        address source = config.royaltySource;
        if (source == address(0)) {
            source = msg.sender;
        }
        
        uint256 sweepAmount = amount;
        if (amount == 0) {
            sweepAmount = IERC20(token).allowance(source, address(this));
            require(sweepAmount > 0, InsufficientBalance());
        }
        
        IERC20(token).safeTransferFrom(source, address(this), sweepAmount);
        emit Swept(msg.sender, token, sweepAmount);
        
        uint256 ipAmount = sweepAmount;
        if (token == WIP) {
            IWIP(WIP).withdraw(sweepAmount);
            ipAmount = sweepAmount;
        } else if (token != address(0)) {
            if (address(swapRouter) != address(0)) {
                ipAmount = _swapToIP(token, sweepAmount);
            } else {
                revert("Swap router not configured");
            }
        }
        
        uint256 fee = (ipAmount * performanceFee) / FEE_DENOMINATOR;
        if (fee > 0) {
            payable(treasury).transfer(fee);
            ipAmount -= fee;
        }
        
        _stakeWithPreset(msg.sender, ipAmount, config.preset);
        
        emit Staked(msg.sender, ipAmount, config.preset);
    }
    
    function stakeIP() external payable nonReentrant whenNotPaused {
        require(msg.value > 0, ZeroAmount());
        
        UserConfig memory config = userConfigs[msg.sender];
        
        uint256 fee = (msg.value * performanceFee) / FEE_DENOMINATOR;
        uint256 stakeAmount = msg.value - fee;
        
        if (fee > 0) {
            payable(treasury).transfer(fee);
        }
        
        _stakeWithPreset(msg.sender, stakeAmount, config.preset);
        
        emit Staked(msg.sender, stakeAmount, config.preset);
    }
    
    function _stakeWithPreset(address user, uint256 amount, RiskPreset preset) private {
        if (preset == RiskPreset.CONSERVATIVE) {
            metaPoolAdapter.stakeIP{value: amount}(amount, user);
        } else {
            require(address(leverageController) != address(0), "Leverage not configured");
            
            uint8 loops;
            if (preset == RiskPreset.BALANCED) {
                loops = 1;
            } else if (preset == RiskPreset.MODERATE) {
                loops = 2;
            } else {
                loops = 3;
            }
            
            leverageController.loopStake{value: amount}(loops, amount);
        }
    }
    
    function harvestAndCompound() external nonReentrant whenNotPaused {
        UserConfig storage config = userConfigs[msg.sender];
        
        uint256 stIPBalance = IERC20(stIP).balanceOf(msg.sender);
        require(stIPBalance > 0, InsufficientBalance());
        
        config.lastCompound = block.timestamp;
        
        emit Compounded(msg.sender, 0);
    }
    
    function unstake(uint256 shares) external nonReentrant {
        require(shares > 0, ZeroAmount());
        
        UserConfig memory config = userConfigs[msg.sender];
        
        uint256 assets;
        if (config.preset == RiskPreset.CONSERVATIVE) {
            IERC20(stIP).safeTransferFrom(msg.sender, address(this), shares);
            IERC20(stIP).safeApprove(address(metaPoolAdapter), shares);
            assets = metaPoolAdapter.unstakeIP(shares, msg.sender, address(this));
        } else {
            require(address(leverageController) != address(0), "Leverage not configured");
            leverageController.unwind(0);
            
            assets = address(this).balance;
            if (assets > 0) {
                payable(msg.sender).transfer(assets);
            }
        }
        
        emit Unstaked(msg.sender, shares, assets);
    }
    
    // ============ View Functions ============
    
    function getUserConfig(address user) external view returns (UserConfig memory) {
        return userConfigs[user];
    }
    
    function getStIPBalance(address user) external view returns (uint256) {
        return IERC20(stIP).balanceOf(user);
    }
    
    function previewStake(uint256 assets) external view returns (uint256) {
        return metaPoolAdapter.previewStake(assets);
    }
    
    function previewUnstake(uint256 shares) external view returns (uint256) {
        return metaPoolAdapter.previewUnstake(shares);
    }
    
    // ============ Internal Functions ============
    
    function _swapToIP(address tokenIn, uint256 amountIn) private returns (uint256 amountOut) {
        require(address(swapRouter) != address(0), "Swap router not configured");
        
        IERC20(tokenIn).safeApprove(address(swapRouter), amountIn);
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: WIP,
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        
        amountOut = swapRouter.exactInputSingle(params);
        
        IWIP(WIP).withdraw(amountOut);
        
        return amountOut;
    }
    
    receive() external payable {}
}