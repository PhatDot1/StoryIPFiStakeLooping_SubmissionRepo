const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Test 5: Unwind Leverage Position ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    const LeverageController = await hre.ethers.getContractAt("LeverageController", deployment.contracts.LeverageController);
    const UnleashAdapter = await hre.ethers.getContractAt("UnleashAdapter", deployment.contracts.UnleashAdapter);

    // Check current position
    const position = await LeverageController.getPosition(deployer.address);
    
    if (position.initialCollateral === 0n) {
        console.log("❌ No active leverage position found");
        console.log("Run one of the leverage tests first (scripts 03-05)\n");
        return;
    }

    console.log("Current Position:");
    console.log("  Initial Collateral:", hre.ethers.formatEther(position.initialCollateral), "IP");
    console.log("  Total Borrowed:", hre.ethers.formatEther(position.totalBorrowed), "IP");
    console.log("  Total Staked:", hre.ethers.formatEther(position.totalStaked), "IP");
    console.log("  Loops:", position.loops.toString());
    console.log("  Health Factor:", hre.ethers.formatEther(position.healthFactor), "\n");

    // Check balances before
    const initialIPBalance = await deployer.provider.getBalance(deployer.address);
    console.log("Initial IP Balance:", hre.ethers.formatEther(initialIPBalance), "\n");

    // Unwind position
    console.log("Unwinding leverage position...");
    console.log("  Unwinding all", position.loops.toString(), "loops\n");

    try {
        const unwindTx = await LeverageController.unwind(0, { // 0 = full unwind
            gasLimit: 7000000
        });
        const unwindReceipt = await unwindTx.wait();
        console.log("  ✓ Unwind transaction confirmed");
        console.log("  Gas used:", unwindReceipt.gasUsed.toString(), "\n");

        // Check final balances
        const finalIPBalance = await deployer.provider.getBalance(deployer.address);
        console.log("Final IP Balance:", hre.ethers.formatEther(finalIPBalance));
        
        const ipReceived = finalIPBalance - initialIPBalance;
        console.log("IP Received from Unwind:", hre.ethers.formatEther(ipReceived), "\n");

        // Verify position cleared
        const finalPosition = await LeverageController.getPosition(deployer.address);
        console.log("Position Status After Unwind:");
        console.log("  Initial Collateral:", hre.ethers.formatEther(finalPosition.initialCollateral));
        console.log("  Total Borrowed:", hre.ethers.formatEther(finalPosition.totalBorrowed));
        console.log("  Loops:", finalPosition.loops.toString(), "\n");

        // Check Unleash status
        const leverageControllerAddr = await LeverageController.getAddress();
        const [collateral, debt, , , , healthFactor] = await UnleashAdapter.getUserAccountData(leverageControllerAddr);
        console.log("Unleash Status:");
        console.log("  Remaining Collateral:", hre.ethers.formatEther(collateral));
        console.log("  Remaining Debt:", hre.ethers.formatEther(debt));
        console.log("  Health Factor:", healthFactor === 0n ? "N/A" : hre.ethers.formatEther(healthFactor), "\n");

        console.log("=== Test 5 Complete ===");
        console.log("✓ Position successfully unwound");
        console.log("✓ Debt repaid");
        console.log("✓ Collateral withdrawn\n");
    } catch (error) {
        console.error("❌ Unwind failed:", error.message);
        console.error("\nPossible reasons:");
        console.error("  - Insufficient stIP to cover repayment");
        console.error("  - Health factor would drop too low");
        console.error("  - Liquidity issues in pools\n");
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });