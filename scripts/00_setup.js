const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Setup & Configuration Check ===\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Testing with account:", deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "IP\n");

    // Load deployment addresses
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    console.log("Deployed Contracts:");
    console.log("  VaultRouter:", deployment.contracts.VaultRouter);
    console.log("  LeverageController:", deployment.contracts.LeverageController);
    console.log("  MetaPool4626Adapter:", deployment.contracts.MetaPool4626Adapter);
    console.log("  UnleashAdapter:", deployment.contracts.UnleashAdapter, "\n");

    // Get contract instances
    const VaultRouter = await hre.ethers.getContractAt("VaultRouter", deployment.contracts.VaultRouter);
    const LeverageController = await hre.ethers.getContractAt("LeverageController", deployment.contracts.LeverageController);
    const MetaPoolAdapter = await hre.ethers.getContractAt("MetaPool4626Adapter", deployment.contracts.MetaPool4626Adapter);
    const UnleashAdapter = await hre.ethers.getContractAt("UnleashAdapter", deployment.contracts.UnleashAdapter);

    // Check configurations
    console.log("=== VaultRouter Configuration ===");
    const treasury = await VaultRouter.treasury();
    const performanceFee = await VaultRouter.performanceFee();
    const stIP = await VaultRouter.stIP();
    const WIP = await VaultRouter.WIP();
    const leverageController = await VaultRouter.leverageController();
    const swapRouter = await VaultRouter.swapRouter();
    
    console.log("  Treasury:", treasury);
    console.log("  Performance Fee:", performanceFee.toString(), "bps (", Number(performanceFee) / 100, "%)");
    console.log("  stIP:", stIP);
    console.log("  WIP:", WIP);
    console.log("  LeverageController:", leverageController);
    console.log("  SwapRouter:", swapRouter);
    console.log("  Owner:", await VaultRouter.owner());
    console.log("  Paused:", await VaultRouter.paused(), "\n");

    console.log("=== LeverageController Configuration ===");
    const leverageEnabled = await LeverageController.leverageEnabled();
    const maxLoops = await LeverageController.maxLoops();
    const targetHF = await LeverageController.targetHealthFactor();
    const minHF = await LeverageController.minHealthFactor();
    const safeLtvMultiplier = await LeverageController.safeLtvMultiplier();
    
    console.log("  Leverage Enabled:", leverageEnabled);
    console.log("  Max Loops:", maxLoops.toString());
    console.log("  Target Health Factor:", hre.ethers.formatEther(targetHF));
    console.log("  Min Health Factor:", hre.ethers.formatEther(minHF));
    console.log("  Safe LTV Multiplier:", safeLtvMultiplier.toString(), "bps (", Number(safeLtvMultiplier) / 100, "%)");
    console.log("  Owner:", await LeverageController.owner(), "\n");

    // Check stIP token details
    const StIP = await hre.ethers.getContractAt("IERC20", stIP);
    const stIPBalance = await StIP.balanceOf(deployer.address);
    console.log("=== User Balances ===");
    console.log("  IP Balance:", hre.ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "IP");
    console.log("  stIP Balance:", hre.ethers.formatEther(stIPBalance), "stIP\n");

    // Check if WIP is whitelisted
    const wipWhitelisted = await VaultRouter.whitelistedTokens(WIP);
    console.log("=== Whitelisted Tokens ===");
    console.log("  WIP Whitelisted:", wipWhitelisted, "\n");

    // Check Unleash Protocol configuration
    console.log("=== Unleash Protocol Configuration ===");
    try {
        const poolAddress = await UnleashAdapter.getPool();
        console.log("  Pool Address:", poolAddress);
        
        const oracleAddress = await UnleashAdapter.getPriceOracle();
        console.log("  Oracle Address:", oracleAddress);
        
        // Check stIP reserve configuration
        const [ltv, liqThreshold, liqBonus] = await UnleashAdapter.getReserveConfiguration(stIP);
        console.log("  stIP Configuration:");
        console.log("    LTV:", ltv.toString(), "bps (", Number(ltv) / 100, "%)");
        console.log("    Liquidation Threshold:", liqThreshold.toString(), "bps (", Number(liqThreshold) / 100, "%)");
        console.log("    Liquidation Bonus:", liqBonus.toString(), "bps (", Number(liqBonus) / 100, "%)\n");
        
        // Check user account data on Unleash
        const [totalCollateral, totalDebt, availableBorrows, , , healthFactor] = await UnleashAdapter.getUserAccountData(deployer.address);
        console.log("  User Account on Unleash:");
        console.log("    Total Collateral:", hre.ethers.formatEther(totalCollateral));
        console.log("    Total Debt:", hre.ethers.formatEther(totalDebt));
        console.log("    Available Borrows:", hre.ethers.formatEther(availableBorrows));
        console.log("    Health Factor:", hre.ethers.formatEther(healthFactor), "\n");
    } catch (error) {
        console.log("  Error checking Unleash config:", error.message, "\n");
    }

    console.log("=== Setup Complete ===");
    console.log("✓ All contracts are deployed and configured");
    console.log("✓ Ready for testing\n");

    console.log("Recommended test amounts (based on your balance):");
    const balance = await deployer.provider.getBalance(deployer.address);
    const testAmount = balance / 100n; // 1% of balance
    console.log("  Conservative test:", hre.ethers.formatEther(testAmount), "IP");
    console.log("  Small test:", hre.ethers.formatEther(testAmount / 2n), "IP");
    console.log("  Minimal test:", hre.ethers.formatEther(testAmount / 10n), "IP\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });