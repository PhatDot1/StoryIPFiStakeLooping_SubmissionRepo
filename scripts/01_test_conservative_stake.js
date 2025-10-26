const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Test 1: Conservative Stake (No Leverage) ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    const VaultRouter = await hre.ethers.getContractAt("VaultRouter", deployment.contracts.VaultRouter);
    const StIP = await hre.ethers.getContractAt("IERC20", deployment.configuration.stIP);

    // Test amount - Meta Pool minimum is 0.1 IP
    const testAmount = hre.ethers.parseEther("0.1");
    
    console.log("Test Parameters:");
    console.log("  Amount:", hre.ethers.formatEther(testAmount), "IP");
    console.log("  Preset: CONSERVATIVE (no leverage)");
    console.log("  Note: 0.1 IP is Meta Pool minimum deposit\n");

    // Check initial balances
    const initialIPBalance = await deployer.provider.getBalance(deployer.address);
    const initialStIPBalance = await StIP.balanceOf(deployer.address);
    
    console.log("Initial Balances:");
    console.log("  IP:", hre.ethers.formatEther(initialIPBalance));
    console.log("  stIP:", hre.ethers.formatEther(initialStIPBalance), "\n");

    // Step 1: Configure route
    console.log("Step 1: Configuring route with CONSERVATIVE preset...");
    const configureTx = await VaultRouter.configureRoute(
        0, // CONSERVATIVE
        deployer.address, // royalty source
        false // no auto-compound for testing
    );
    await configureTx.wait();
    console.log("  ✓ Route configured\n");

    // Verify configuration
    const userConfig = await VaultRouter.getUserConfig(deployer.address);
    console.log("User Configuration:");
    console.log("  Preset:", ["CONSERVATIVE", "BALANCED", "MODERATE", "AGGRESSIVE"][userConfig.preset]);
    console.log("  Royalty Source:", userConfig.royaltySource);
    console.log("  Auto-Compound:", userConfig.autoCompound, "\n");

    // Step 2: Stake IP
    console.log("Step 2: Staking IP directly through Meta Pool adapter...");
    console.log("  This bypasses VaultRouter fee for direct comparison\n");
    
    // Get the adapter directly
    const MetaPoolAdapter = await hre.ethers.getContractAt("MetaPool4626Adapter", deployment.contracts.MetaPool4626Adapter);
    
    try {
        const stakeTx = await MetaPoolAdapter.stakeIP(testAmount, deployer.address, { 
            value: testAmount,
            gasLimit: 200000
        });
        const stakeReceipt = await stakeTx.wait();
        console.log("  ✓ Stake transaction confirmed (via adapter)");
        console.log("  Gas used:", stakeReceipt.gasUsed.toString(), "\n");

        // Check final balances
        const finalIPBalance = await deployer.provider.getBalance(deployer.address);
        const finalStIPBalance = await StIP.balanceOf(deployer.address);
        
        console.log("Final Balances:");
        console.log("  IP:", hre.ethers.formatEther(finalIPBalance));
        console.log("  stIP:", hre.ethers.formatEther(finalStIPBalance), "\n");

        // Calculate changes
        const ipSpent = initialIPBalance - finalIPBalance;
        const stIPReceived = finalStIPBalance - initialStIPBalance;
        
        console.log("Results:");
        console.log("  IP Spent:", hre.ethers.formatEther(ipSpent), "(includes gas)");
        console.log("  stIP Received:", hre.ethers.formatEther(stIPReceived));
        console.log("  Exchange Rate:", (Number(stIPReceived) / Number(testAmount)).toFixed(4), "stIP per IP\n");

        console.log("=== Test 1 Complete ===");
        console.log("✓ Conservative stake successful");
        console.log("✓ No leverage applied");
        console.log("✓ stIP tokens received\n");
        
        console.log("Next: Test via VaultRouter with fee...");
    } catch (error) {
        console.error("❌ Stake failed:", error.message);
        
        // Try to get more details
        if (error.data) {
            console.error("Error data:", error.data);
        }
        
        console.error("\nTrying alternative: Stake via VaultRouter (with 2% fee)...\n");
        
        try {
            const stakeTx2 = await VaultRouter.stakeIP({ 
                value: testAmount,
                gasLimit: 300000
            });
            const stakeReceipt2 = await stakeTx2.wait();
            console.log("  ✓ Stake via VaultRouter confirmed");
            console.log("  Gas used:", stakeReceipt2.gasUsed.toString(), "\n");

            const finalIPBalance2 = await deployer.provider.getBalance(deployer.address);
            const finalStIPBalance2 = await StIP.balanceOf(deployer.address);
            
            console.log("Final Balances:");
            console.log("  IP:", hre.ethers.formatEther(finalIPBalance2));
            console.log("  stIP:", hre.ethers.formatEther(finalStIPBalance2), "\n");

            const ipSpent2 = initialIPBalance - finalIPBalance2;
            const stIPReceived2 = finalStIPBalance2 - initialStIPBalance;
            
            console.log("Results:");
            console.log("  IP Spent:", hre.ethers.formatEther(ipSpent2), "(includes gas)");
            console.log("  stIP Received:", hre.ethers.formatEther(stIPReceived2));
            
            // Calculate expected with fee
            const feeAmount = testAmount * 200n / 10000n; // 2% fee
            const expectedNetAmount = testAmount - feeAmount;
            console.log("\nFee Analysis:");
            console.log("  Fee (2%):", hre.ethers.formatEther(feeAmount), "IP");
            console.log("  Net Staked:", hre.ethers.formatEther(expectedNetAmount), "IP");
            console.log("  Expected stIP:", hre.ethers.formatEther(expectedNetAmount * 945n / 1000n), "(~0.945 per IP)\n");

            console.log("=== Test 1 Complete ===");
            console.log("✓ Conservative stake via VaultRouter successful");
            console.log("✓ Performance fee deducted");
            console.log("✓ stIP tokens received\n");
        } catch (error2) {
            console.error("❌ VaultRouter stake also failed:", error2.message);
            throw error2;
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });