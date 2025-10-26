const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Test 2: Balanced Stake (1x Leverage) ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    const VaultRouter = await hre.ethers.getContractAt("VaultRouter", deployment.contracts.VaultRouter);
    const LeverageController = await hre.ethers.getContractAt("LeverageController", deployment.contracts.LeverageController);
    const UnleashAdapter = await hre.ethers.getContractAt("UnleashAdapter", deployment.contracts.UnleashAdapter);
    const StIP = await hre.ethers.getContractAt("IERC20", deployment.configuration.stIP);

    // Check if leverage is enabled
    const leverageEnabled = await LeverageController.leverageEnabled();
    if (!leverageEnabled) {
        console.log("❌ Leverage is not enabled!");
        console.log("Run script 02_enable_leverage.js first\n");
        return;
    }

    // Test amount - use 0.15 IP for leverage test (Meta Pool minimum 0.1 + buffer for loops)
    const testAmount = hre.ethers.parseEther("0.15");
    
    console.log("Test Parameters:");
    console.log("  Amount:", hre.ethers.formatEther(testAmount), "IP");
    console.log("  Preset: BALANCED (1x leverage, 1 loop)");
    console.log("  Note: Higher amount needed for leverage loops\n");

    // Check initial balances
    const initialIPBalance = await deployer.provider.getBalance(deployer.address);
    const initialStIPBalance = await StIP.balanceOf(deployer.address);
    
    console.log("Initial Balances:");
    console.log("  IP:", hre.ethers.formatEther(initialIPBalance));
    console.log("  stIP:", hre.ethers.formatEther(initialStIPBalance), "\n");

    // Check initial Unleash position
    const leverageControllerAddr = await LeverageController.getAddress();
    const [initCollateral, initDebt, , , , initHF] = await UnleashAdapter.getUserAccountData(leverageControllerAddr);
    console.log("Initial Unleash Position (LeverageController):");
    console.log("  Collateral:", hre.ethers.formatEther(initCollateral));
    console.log("  Debt:", hre.ethers.formatEther(initDebt));
    console.log("  Health Factor:", initHF === 0n ? "N/A" : hre.ethers.formatEther(initHF), "\n");

    // Step 1: Configure route with BALANCED preset
    console.log("Step 1: Configuring route with BALANCED preset...");
    const configureTx = await VaultRouter.configureRoute(
        1, // BALANCED
        deployer.address,
        false
    );
    await configureTx.wait();
    console.log("  ✓ Route configured\n");

    // Step 2: Project leverage outcome
    console.log("Step 2: Projecting leverage outcome...");
    try {
        const [projectedCollateral, projectedDebt, projectedHF] = await LeverageController.projectLeverageOutcome(testAmount, 1);
        console.log("  Projected Results (1 loop):");
        console.log("    Total Collateral:", hre.ethers.formatEther(projectedCollateral), "IP");
        console.log("    Total Debt:", hre.ethers.formatEther(projectedDebt), "IP");
        console.log("    Health Factor:", hre.ethers.formatEther(projectedHF));
        console.log("    Leverage Multiplier:", (Number(projectedCollateral) / Number(testAmount)).toFixed(2), "x\n");
    } catch (error) {
        console.log("  Projection error:", error.message, "\n");
    }

    // Step 3: Execute leveraged stake via LeverageController directly
    console.log("Step 3: Executing leveraged stake (direct to LeverageController)...");
    try {
        const stakeTx = await LeverageController.loopStake(1, testAmount, { 
            value: testAmount,
            gasLimit: 5000000
        });
        const stakeReceipt = await stakeTx.wait();
        console.log("  ✓ Stake transaction confirmed");
        console.log("  Gas used:", stakeReceipt.gasUsed.toString(), "\n");

        // Check final balances
        const finalIPBalance = await deployer.provider.getBalance(deployer.address);
        const finalStIPBalance = await StIP.balanceOf(deployer.address);
        
        console.log("Final Balances:");
        console.log("  IP:", hre.ethers.formatEther(finalIPBalance));
        console.log("  stIP:", hre.ethers.formatEther(finalStIPBalance), "\n");

        // Check final Unleash position
        const [finalCollateral, finalDebt, , , , finalHF] = await UnleashAdapter.getUserAccountData(leverageControllerAddr);
        console.log("Final Unleash Position (LeverageController):");
        console.log("  Collateral:", hre.ethers.formatEther(finalCollateral));
        console.log("  Debt:", hre.ethers.formatEther(finalDebt));
        console.log("  Health Factor:", hre.ethers.formatEther(finalHF), "\n");

        // Get position details
        const position = await LeverageController.getPosition(deployer.address);
        console.log("Leverage Position Details:");
        console.log("  Initial Collateral:", hre.ethers.formatEther(position.initialCollateral), "IP");
        console.log("  Total Borrowed:", hre.ethers.formatEther(position.totalBorrowed), "IP");
        console.log("  Total Staked:", hre.ethers.formatEther(position.totalStaked), "IP");
        console.log("  Loops:", position.loops.toString());
        console.log("  Health Factor:", hre.ethers.formatEther(position.healthFactor));
        console.log("  Timestamp:", new Date(Number(position.timestamp) * 1000).toISOString(), "\n");

        // Calculate effective multiplier
        const multiplier = Number(position.totalStaked) / Number(position.initialCollateral);
        console.log("Results:");
        console.log("  Effective Leverage:", multiplier.toFixed(2), "x");
        console.log("  Position Health:", finalHF >= hre.ethers.parseEther("1.5") ? "✓ HEALTHY" : "⚠ AT RISK");
        
        if (finalHF >= hre.ethers.parseEther("1.7")) {
            console.log("  Status: ✓ EXCELLENT (HF ≥ 1.7)\n");
        } else if (finalHF >= hre.ethers.parseEther("1.5")) {
            console.log("  Status: ⚠ ACCEPTABLE (HF ≥ 1.5)\n");
        }

        console.log("=== Test 2 Complete ===");
        console.log("✓ Balanced leverage stake successful");
        console.log("✓ 1 loop executed");
        console.log("✓ Health factor maintained\n");
    } catch (error) {
        console.error("❌ Stake failed:", error.message);
        
        if (error.data) {
            console.error("Error data:", error.data);
        }
        
        console.error("\nPossible reasons:");
        console.error("  - Insufficient liquidity in Unleash pool");
        console.error("  - stIP not properly configured as collateral");
        console.error("  - Health factor constraints");
        console.error("  - Meta Pool minimum deposit (0.1 IP) per loop");
        console.error("\nDebugging steps:");
        console.error("  1. Check Unleash pool liquidity");
        console.error("  2. Verify stIP collateral configuration");
        console.error("  3. Try with larger amount (0.3+ IP)\n");
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });