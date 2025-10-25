const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Test 4: Aggressive Stake (3x Leverage) ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    const VaultRouter = await hre.ethers.getContractAt("VaultRouter", deployment.contracts.VaultRouter);
    const LeverageController = await hre.ethers.getContractAt("LeverageController", deployment.contracts.LeverageController);

    const leverageEnabled = await LeverageController.leverageEnabled();
    if (!leverageEnabled) {
        console.log("❌ Leverage is not enabled!");
        return;
    }

    // Test amount - use 0.35 IP for 3 loops
    const testAmount = hre.ethers.parseEther("0.35");
    
    console.log("Test Parameters:");
    console.log("  Amount:", hre.ethers.formatEther(testAmount), "IP");
    console.log("  Preset: AGGRESSIVE (3x leverage, 3 loops)");
    console.log("  Note: Each loop needs min 0.1 IP");
    console.log("  ⚠ WARNING: Highest risk, lowest health factor\n");

    console.log("Step 1: Configuring route with AGGRESSIVE preset...");
    const configureTx = await VaultRouter.configureRoute(3, deployer.address, false);
    await configureTx.wait();
    console.log("  ✓ Route configured\n");

    console.log("Step 2: Projecting leverage outcome...");
    try {
        const [projectedCollateral, projectedDebt, projectedHF] = await LeverageController.projectLeverageOutcome(testAmount, 3);
        console.log("  Projected Results (3 loops):");
        console.log("    Total Collateral:", hre.ethers.formatEther(projectedCollateral), "IP");
        console.log("    Total Debt:", hre.ethers.formatEther(projectedDebt), "IP");
        console.log("    Health Factor:", hre.ethers.formatEther(projectedHF));
        console.log("    Leverage Multiplier:", (Number(projectedCollateral) / Number(testAmount)).toFixed(2), "x\n");
    } catch (error) {
        console.log("  Projection error:", error.message, "\n");
    }

    console.log("Step 3: Executing leveraged stake...");
    try {
        const stakeTx = await LeverageController.loopStake(3, testAmount, { 
            value: testAmount,
            gasLimit: 7000000
        });
        const stakeReceipt = await stakeTx.wait();
        console.log("  ✓ Stake transaction confirmed");
        console.log("  Gas used:", stakeReceipt.gasUsed.toString(), "\n");

        const position = await LeverageController.getPosition(deployer.address);
        console.log("Leverage Position Details:");
        console.log("  Initial Collateral:", hre.ethers.formatEther(position.initialCollateral), "IP");
        console.log("  Total Borrowed:", hre.ethers.formatEther(position.totalBorrowed), "IP");
        console.log("  Total Staked:", hre.ethers.formatEther(position.totalStaked), "IP");
        console.log("  Loops:", position.loops.toString());
        console.log("  Health Factor:", hre.ethers.formatEther(position.healthFactor), "\n");

        const multiplier = Number(position.totalStaked) / Number(position.initialCollateral);
        console.log("Results:");
        console.log("  Effective Leverage:", multiplier.toFixed(2), "x");
        
        if (position.healthFactor >= hre.ethers.parseEther("1.7")) {
            console.log("  Status: ✓ EXCELLENT (HF ≥ 1.7)");
        } else if (position.healthFactor >= hre.ethers.parseEther("1.5")) {
            console.log("  Status: ⚠ ACCEPTABLE (HF ≥ 1.5)");
        } else {
            console.log("  Status: ❌ AT RISK (HF < 1.5)");
        }

        console.log("\n=== Test 4 Complete ===");
        console.log("✓ Aggressive leverage stake successful");
        console.log("✓ 3 loops executed");
        console.log("⚠ Monitor health factor closely\n");
    } catch (error) {
        console.error("❌ Stake failed:", error.message);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });