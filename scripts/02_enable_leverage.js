const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Enable Leverage Feature ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    const LeverageController = await hre.ethers.getContractAt("LeverageController", deployment.contracts.LeverageController);

    // Check current status
    const currentlyEnabled = await LeverageController.leverageEnabled();
    console.log("Current Leverage Status:", currentlyEnabled ? "ENABLED" : "DISABLED\n");

    if (currentlyEnabled) {
        console.log("✓ Leverage is already enabled");
        console.log("✓ No action needed\n");
        return;
    }

    // Enable leverage
    console.log("Enabling leverage...");
    const enableTx = await LeverageController.setLeverageEnabled(true);
    await enableTx.wait();
    console.log("  ✓ Leverage enabled\n");

    // Verify
    const nowEnabled = await LeverageController.leverageEnabled();
    console.log("New Leverage Status:", nowEnabled ? "ENABLED" : "DISABLED");

    // Show configuration
    const maxLoops = await LeverageController.maxLoops();
    const targetHF = await LeverageController.targetHealthFactor();
    const minHF = await LeverageController.minHealthFactor();
    const safeLtvMultiplier = await LeverageController.safeLtvMultiplier();

    console.log("\nLeverage Configuration:");
    console.log("  Max Loops:", maxLoops.toString());
    console.log("  Target Health Factor:", hre.ethers.formatEther(targetHF));
    console.log("  Min Health Factor:", hre.ethers.formatEther(minHF));
    console.log("  Safe LTV Multiplier:", Number(safeLtvMultiplier) / 100, "%\n");

    console.log("=== Leverage Enabled ===");
    console.log("✓ System ready for leveraged staking");
    console.log("✓ Can now test BALANCED, MODERATE, and AGGRESSIVE presets\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });