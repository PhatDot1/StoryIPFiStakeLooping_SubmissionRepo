const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Check All Positions ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    const VaultRouter = await hre.ethers.getContractAt("VaultRouter", deployment.contracts.VaultRouter);
    const LeverageController = await hre.ethers.getContractAt("LeverageController", deployment.contracts.LeverageController);
    const UnleashAdapter = await hre.ethers.getContractAt("UnleashAdapter", deployment.contracts.UnleashAdapter);
    const StIP = await hre.ethers.getContractAt("IERC20", deployment.configuration.stIP);

    console.log("User:", deployer.address, "\n");

    // Check user configuration
    const userConfig = await VaultRouter.getUserConfig(deployer.address);
    console.log("=== VaultRouter Configuration ===");
    console.log("  Preset:", ["CONSERVATIVE", "BALANCED", "MODERATE", "AGGRESSIVE"][userConfig.preset]);
    console.log("  Royalty Source:", userConfig.royaltySource);
    console.log("  Auto-Compound:", userConfig.autoCompound);
    console.log("  Last Compound:", new Date(Number(userConfig.lastCompound) * 1000).toISOString(), "\n");

    // Check balances
    const ipBalance = await deployer.provider.getBalance(deployer.address);
    const stIPBalance = await StIP.balanceOf(deployer.address);
    
    console.log("=== Token Balances ===");
    console.log("  IP:", hre.ethers.formatEther(ipBalance));
    console.log("  stIP:", hre.ethers.formatEther(stIPBalance), "\n");

    // Check leverage position
    const position = await LeverageController.getPosition(deployer.address);
    
    if (position.initialCollateral > 0n) {
        console.log("=== Leverage Position ===");
        console.log("  Initial Collateral:", hre.ethers.formatEther(position.initialCollateral), "IP");
        console.log("  Total Borrowed:", hre.ethers.formatEther(position.totalBorrowed), "IP");
        console.log("  Total Staked:", hre.ethers.formatEther(position.totalStaked), "IP");
        console.log("  Loops:", position.loops.toString());
        console.log("  Health Factor:", hre.ethers.formatEther(position.healthFactor));
        console.log("  Timestamp:", new Date(Number(position.timestamp) * 1000).toISOString());
        
        const multiplier = Number(position.totalStaked) / Number(position.initialCollateral);
        console.log("  Effective Leverage:", multiplier.toFixed(2), "x\n");

        // Health status
        if (position.healthFactor >= hre.ethers.parseEther("1.7")) {
            console.log("  Status: ✓ EXCELLENT (HF ≥ 1.7)\n");
        } else if (position.healthFactor >= hre.ethers.parseEther("1.5")) {
            console.log("  Status: ⚠ ACCEPTABLE (HF ≥ 1.5)\n");
        } else {
            console.log("  Status: ❌ AT RISK (HF < 1.5) - Consider unwinding!\n");
        }
    } else {
        console.log("=== Leverage Position ===");
        console.log("  No active leverage position\n");
    }

    // Check Unleash account data
    try {
        const leverageControllerAddr = await LeverageController.getAddress();
        const [collateral, debt, availableBorrows, , ltv, healthFactor] = await UnleashAdapter.getUserAccountData(leverageControllerAddr);
        
        console.log("=== Unleash Protocol Data (LeverageController) ===");
        console.log("  Total Collateral:", hre.ethers.formatEther(collateral));
        console.log("  Total Debt:", hre.ethers.formatEther(debt));
        console.log("  Available Borrows:", hre.ethers.formatEther(availableBorrows));
        console.log("  LTV:", ltv.toString(), "bps");
        console.log("  Health Factor:", healthFactor === 0n ? "N/A (no debt)" : hre.ethers.formatEther(healthFactor), "\n");
    } catch (error) {
        console.log("  Error fetching Unleash data:", error.message, "\n");
    }

    console.log("=== Summary ===");
    console.log("✓ All positions checked");
    console.log("✓ Current configuration displayed\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });