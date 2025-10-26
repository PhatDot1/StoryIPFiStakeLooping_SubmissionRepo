const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Testing Correct Pool Address ===\n");

    const [deployer] = await hre.ethers.getSigners();
    
    // CORRECT addresses per Rick
    const POOL_PROXY = "0xC62Af8aa9E2358884B6e522900F91d3c924e1b38";
    const STIP_ADDRESS = "0xd07Faed671decf3C5A6cc038dAD97c8EFDb507c0";
    
    console.log("Using Pool Proxy:", POOL_PROXY);
    console.log("Old Pool address was:", "0x3c3a20F5c268DB6df5c01082Dc41D926e56D7E49");
    console.log("Testing with stIP:", STIP_ADDRESS, "\n");

    // Get contracts
    const Pool = await hre.ethers.getContractAt(
        [
            "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
            "function getUserAccountData(address user) external view returns (uint256, uint256, uint256, uint256, uint256, uint256)",
            "function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external",
            "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external"
        ],
        POOL_PROXY
    );
    
    const StIP = await hre.ethers.getContractAt("IERC20", STIP_ADDRESS);
    
    // Check balance
    const stIPBalance = await StIP.balanceOf(deployer.address);
    console.log("Current stIP balance:", hre.ethers.formatEther(stIPBalance));
    
    if (stIPBalance === 0n) {
        console.log("❌ No stIP balance. Run: npx hardhat run scripts/story/01_test_conservative_stake.js --network story_mainnet");
        return;
    }
    
    // Use small amount for testing
    const supplyAmount = hre.ethers.parseEther("0.01");
    
    if (stIPBalance < supplyAmount) {
        console.log("❌ Insufficient stIP. Need at least 0.01 stIP");
        return;
    }
    
    console.log("Test amount:", hre.ethers.formatEther(supplyAmount), "stIP\n");
    
    // Step 1: Approve
    console.log("Step 1: Approving Pool proxy...");
    const approveTx = await StIP.approve(POOL_PROXY, supplyAmount);
    await approveTx.wait();
    console.log("  ✓ Approved\n");
    
    // Step 2: Supply directly
    console.log("Step 2: Calling Pool.supply()...");
    try {
        const supplyTx = await Pool.supply(
            STIP_ADDRESS,
            supplyAmount,
            deployer.address,
            0,  // referralCode
            { gasLimit: 800000 }
        );
        
        console.log("  Transaction sent:", supplyTx.hash);
        const receipt = await supplyTx.wait();
        console.log("  ✓ Supply successful!");
        console.log("  Gas used:", receipt.gasUsed.toString(), "\n");
        
        // Check account data
        console.log("Step 3: Checking account data...");
        const [totalCollateral, totalDebt, availableBorrows, , ltv, healthFactor] = 
            await Pool.getUserAccountData(deployer.address);
        
        console.log("  Total Collateral:", hre.ethers.formatEther(totalCollateral));
        console.log("  Total Debt:", hre.ethers.formatEther(totalDebt));
        console.log("  Available Borrows:", hre.ethers.formatEther(availableBorrows));
        console.log("  LTV:", ltv.toString(), "bps");
        console.log("  Health Factor:", healthFactor === 0n ? "N/A" : hre.ethers.formatEther(healthFactor), "\n");
        
        // Step 4: Enable as collateral
        console.log("Step 4: Enabling stIP as collateral...");
        const collateralTx = await Pool.setUserUseReserveAsCollateral(STIP_ADDRESS, true);
        await collateralTx.wait();
        console.log("  ✓ Collateral enabled\n");
        
        // Check updated account data
        console.log("Step 5: Checking updated account data...");
        const [collateral2, debt2, availableBorrows2, , ltv2, healthFactor2] = 
            await Pool.getUserAccountData(deployer.address);
        
        console.log("  Total Collateral:", hre.ethers.formatEther(collateral2));
        console.log("  Available Borrows:", hre.ethers.formatEther(availableBorrows2));
        console.log("  LTV:", ltv2.toString(), "bps");
        console.log("  Health Factor:", healthFactor2 === 0n ? "N/A" : hre.ethers.formatEther(healthFactor2), "\n");
        
        if (availableBorrows2 > 0n) {
            console.log("=== Success! ===");
            console.log("✓ Direct Pool call works with correct address");
            console.log("✓ No Pyth updates needed in contract calls");
            console.log("✓ Can now implement leverage properly");
            console.log("\nNext: Update UnleashAdapter and LeverageController with correct Pool address\n");
        } else {
            console.log("⚠ Collateral supplied but no borrows available");
            console.log("This might be a reserve configuration issue\n");
        }
        
        // Optional: Try borrowing
        if (availableBorrows2 > 0n) {
            const borrowAmount = availableBorrows2 / 10n; // Borrow 10% of available
            console.log("Step 6: Testing borrow...");
            console.log("  Attempting to borrow", hre.ethers.formatEther(borrowAmount), "IP\n");
            
            try {
                const WIP_ADDRESS = "0x1514000000000000000000000000000000000000";
                const borrowTx = await Pool.borrow(
                    WIP_ADDRESS,
                    borrowAmount,
                    2, // Variable rate
                    0, // referralCode
                    deployer.address,
                    { gasLimit: 800000 }
                );
                
                const borrowReceipt = await borrowTx.wait();
                console.log("  ✓ Borrow successful!");
                console.log("  Gas used:", borrowReceipt.gasUsed.toString(), "\n");
                
                console.log("=== Full Flow Successful ===");
                console.log("✓ Supply works");
                console.log("✓ Collateral works");
                console.log("✓ Borrow works");
                console.log("✓ Ready to implement full leverage strategy!\n");
                
            } catch (borrowError) {
                console.log("  ❌ Borrow failed:", borrowError.message);
                console.log("  This is okay - we confirmed supply/collateral works\n");
            }
        }
        
    } catch (error) {
        console.log("  ❌ Supply failed:", error.message, "\n");
        
        if (error.message.includes("revert")) {
            console.log("Still reverting with correct Pool address.");
            console.log("\nPossible issues:");
            console.log("  1. stIP not enabled as reserve in Unleash");
            console.log("  2. Pool is paused");
            console.log("  3. Still need Pyth price updates");
            console.log("\nNext steps:");
            console.log("  - Contact Unleash team for reserve configuration");
            console.log("  - Check if stIP is listed as supported asset");
            console.log("  - Verify pool is not paused\n");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });