const hre = require("hardhat");

async function main() {
    console.log("=== Test Direct Pool Call (No Adapter) ===\n");

    const [deployer] = await hre.ethers.getSigners();
    
    const POOL_ADDRESS = "0x3c3a20F5c268DB6df5c01082Dc41D926e56D7E49";
    const STIP_ADDRESS = "0xd07Faed671decf3C5A6cc038dAD97c8EFDb507c0";
    
    console.log("Testing direct Pool.supply() call...\n");

    // Get contracts
    const Pool = await hre.ethers.getContractAt(
        ["function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external"],
        POOL_ADDRESS
    );
    
    const StIP = await hre.ethers.getContractAt("IERC20", STIP_ADDRESS);
    
    // Use existing stIP balance
    const stIPBalance = await StIP.balanceOf(deployer.address);
    console.log("Current stIP balance:", hre.ethers.formatEther(stIPBalance));
    
    if (stIPBalance === 0n) {
        console.log("❌ No stIP balance. Run conservative stake test first.");
        return;
    }
    
    // Use small amount
    const supplyAmount = hre.ethers.parseEther("0.01");
    
    if (stIPBalance < supplyAmount) {
        console.log("❌ Insufficient stIP. Need at least 0.01 stIP");
        return;
    }
    
    console.log("Supplying", hre.ethers.formatEther(supplyAmount), "stIP to Pool...\n");
    
    // Step 1: Approve
    console.log("Step 1: Approving Pool...");
    const approveTx = await StIP.approve(POOL_ADDRESS, supplyAmount);
    await approveTx.wait();
    console.log("  ✓ Approved\n");
    
    // Step 2: Supply directly
    console.log("Step 2: Calling Pool.supply()...");
    try {
        const supplyTx = await Pool.supply(
            STIP_ADDRESS,
            supplyAmount,
            deployer.address,
            0,
            { gasLimit: 800000 }
        );
        
        console.log("  Transaction sent:", supplyTx.hash);
        const receipt = await supplyTx.wait();
        console.log("  ✓ Supply successful!");
        console.log("  Gas used:", receipt.gasUsed.toString(), "\n");
        
        console.log("=== Success! ===");
        console.log("✓ Direct Pool call works");
        console.log("✓ No Pyth updates needed");
        console.log("✓ We can simplify the contracts\n");
        
    } catch (error) {
        console.log("  ❌ Supply failed:", error.message, "\n");
        
        console.log("This means Unleash DOES require Pyth price updates.");
        console.log("We have two options:");
        console.log("  1. Implement full Pyth integration (complex, expensive)");
        console.log("  2. Use Unleash UI for leverage (simpler)");
        console.log("  3. Find alternative lending protocol without Pyth\n");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });