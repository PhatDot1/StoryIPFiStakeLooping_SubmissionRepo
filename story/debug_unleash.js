const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Debug Unleash Protocol ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    const UnleashAdapter = await hre.ethers.getContractAt("UnleashAdapter", deployment.contracts.UnleashAdapter);
    const MetaPoolAdapter = await hre.ethers.getContractAt("MetaPool4626Adapter", deployment.contracts.MetaPool4626Adapter);
    const STIP_ADDRESS = deployment.configuration.stIP;
    const WIP_ADDRESS = deployment.configuration.WIP;
    const NATIVE_IP = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    
    console.log("Testing Unleash borrowing capabilities...\n");

    // Step 1: Stake 0.15 IP to get stIP
    const stakeAmount = hre.ethers.parseEther("0.15");
    console.log("Step 1: Staking", hre.ethers.formatEther(stakeAmount), "IP for stIP...");
    
    const StIP = await hre.ethers.getContractAt("IERC20", STIP_ADDRESS);
    const initialStIP = await StIP.balanceOf(deployer.address);
    
    const stakeTx = await MetaPoolAdapter.stakeIP(stakeAmount, deployer.address, {
        value: stakeAmount
    });
    await stakeTx.wait();
    
    const finalStIP = await StIP.balanceOf(deployer.address);
    const stIPReceived = finalStIP - initialStIP;
    console.log("  ✓ Received", hre.ethers.formatEther(stIPReceived), "stIP\n");

    // Step 2: Supply stIP as collateral
    console.log("Step 2: Supplying stIP as collateral to Unleash...");
    
    await StIP.approve(deployment.contracts.UnleashAdapter, stIPReceived);
    
    const supplyTx = await UnleashAdapter.supplyCollateral(
        STIP_ADDRESS,
        stIPReceived,
        deployer.address
    );
    await supplyTx.wait();
    console.log("  ✓ Supplied to Unleash\n");

    // Step 3: Set as collateral
    console.log("Step 3: Enabling stIP as collateral...");
    const setCollateralTx = await UnleashAdapter.setCollateral(STIP_ADDRESS, true);
    await setCollateralTx.wait();
    console.log("  ✓ Collateral enabled\n");

    // Step 4: Check account data
    console.log("Step 4: Checking account data...");
    const [totalCollateral, totalDebt, availableBorrows, liqThreshold, ltv, healthFactor] = 
        await UnleashAdapter.getUserAccountData(deployer.address);
    
    console.log("  Total Collateral:", hre.ethers.formatEther(totalCollateral));
    console.log("  Total Debt:", hre.ethers.formatEther(totalDebt));
    console.log("  Available Borrows:", hre.ethers.formatEther(availableBorrows));
    console.log("  LTV:", ltv.toString(), "bps");
    console.log("  Liquidation Threshold:", liqThreshold.toString(), "bps");
    console.log("  Health Factor:", healthFactor === 0n ? "N/A" : hre.ethers.formatEther(healthFactor), "\n");

    if (availableBorrows === 0n) {
        console.log("❌ Available borrows is 0!");
        console.log("This means stIP is not configured as collateral in Unleash\n");
        return;
    }

    // Step 5: Try borrowing native IP
    const borrowAmount = hre.ethers.parseEther("0.05");
    console.log("Step 5: Attempting to borrow", hre.ethers.formatEther(borrowAmount), "native IP...");
    
    try {
        const borrowTx = await UnleashAdapter.borrow(
            NATIVE_IP,
            borrowAmount,
            deployer.address,
            { gasLimit: 500000 }
        );
        await borrowTx.wait();
        console.log("  ✓ Borrow successful!\n");
        
        const balance = await deployer.provider.getBalance(deployer.address);
        console.log("  New IP balance:", hre.ethers.formatEther(balance), "\n");
        
    } catch (error) {
        console.log("  ❌ Native IP borrow failed:", error.message, "\n");
        
        // Step 6: Try borrowing WIP instead
        console.log("Step 6: Attempting to borrow WIP instead...");
        
        try {
            const borrowTx = await UnleashAdapter.borrow(
                WIP_ADDRESS,
                borrowAmount,
                deployer.address,
                { gasLimit: 500000 }
            );
            await borrowTx.wait();
            console.log("  ✓ WIP borrow successful!\n");
            
            const WIP = await hre.ethers.getContractAt("IERC20", WIP_ADDRESS);
            const wipBalance = await WIP.balanceOf(deployer.address);
            console.log("  WIP balance:", hre.ethers.formatEther(wipBalance), "\n");
            
        } catch (error2) {
            console.log("  ❌ WIP borrow also failed:", error2.message, "\n");
            
            console.log("=== Possible Issues ===");
            console.log("1. Unleash doesn't have native IP or WIP borrowing enabled");
            console.log("2. No liquidity in the pool");
            console.log("3. Different asset address needed");
            console.log("4. Interest rate mode issue\n");
        }
    }

    // Cleanup: Repay and withdraw
    console.log("Cleanup: Withdrawing collateral...");
    try {
        const withdrawTx = await UnleashAdapter.withdraw(
            STIP_ADDRESS,
            stIPReceived,
            deployer.address,
            { gasLimit: 500000 }
        );
        await withdrawTx.wait();
        console.log("  ✓ Collateral withdrawn\n");
    } catch (error) {
        console.log("  Note: Withdrawal skipped (may have active borrows)\n");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });