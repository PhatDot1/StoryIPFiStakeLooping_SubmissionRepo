const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Manual 1-Loop Leverage Test ===\n");
    console.log("This manually executes each step to prove the looping concept works.\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
    // Get contracts
    const POOL_ADDRESS = "0xC62Af8aa9E2358884B6e522900F91d3c924e1b38";
    const STIP_ADDRESS = "0xd07Faed671decf3C5A6cc038dAD97c8EFDb507c0";
    const WIP_ADDRESS = "0x1514000000000000000000000000000000000000";
    
    const Pool = await hre.ethers.getContractAt(
        [
            "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
            "function getUserAccountData(address user) external view returns (uint256, uint256, uint256, uint256, uint256, uint256)",
            "function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external",
            "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external"
        ],
        POOL_ADDRESS
    );
    
    const MetaPoolAdapter = await hre.ethers.getContractAt(
        "MetaPool4626Adapter",
        deployment.contracts.MetaPool4626Adapter
    );
    
    const StIP = await hre.ethers.getContractAt("IERC20", STIP_ADDRESS);
    const WIP = await hre.ethers.getContractAt("IERC20", WIP_ADDRESS);
    
    const UnleashAdapter = await hre.ethers.getContractAt(
        "UnleashAdapter",
        deployment.contracts.UnleashAdapter
    );
    
    // Test parameters
    const initialAmount = hre.ethers.parseEther("0.15");
    console.log("Initial capital:", hre.ethers.formatEther(initialAmount), "IP\n");
    
    // Initial balances
    const initialStIP = await StIP.balanceOf(deployer.address);
    
    console.log("=== LOOP 0: Initial Stake ===\n");
    
    // Step 1: Stake initial IP to get stIP
    console.log("Step 1: Staking initial", hre.ethers.formatEther(initialAmount), "IP...");
    let tx = await MetaPoolAdapter.stakeIP(initialAmount, deployer.address, {
        value: initialAmount,
        gasLimit: 200000
    });
    await tx.wait();
    
    let stIPBalance = await StIP.balanceOf(deployer.address);
    let stIPFromInitial = stIPBalance - initialStIP;
    console.log("  ✓ Received", hre.ethers.formatEther(stIPFromInitial), "stIP\n");
    
    // Step 2: Supply stIP to Unleash
    console.log("Step 2: Supplying", hre.ethers.formatEther(stIPFromInitial), "stIP to Unleash...");
    tx = await StIP.approve(POOL_ADDRESS, stIPFromInitial);
    await tx.wait();
    
    tx = await Pool.supply(STIP_ADDRESS, stIPFromInitial, deployer.address, 0, { gasLimit: 500000 });
    await tx.wait();
    console.log("  ✓ Supplied\n");
    
    // Step 3: Enable as collateral
    console.log("Step 3: Enabling stIP as collateral...");
    tx = await Pool.setUserUseReserveAsCollateral(STIP_ADDRESS, true);
    await tx.wait();
    console.log("  ✓ Enabled\n");
    
    // Check account data
    let [totalCollateralBase, totalDebtBase, availableBorrowsBase, , , healthFactor] = 
        await Pool.getUserAccountData(deployer.address);
    
    // Get asset prices
    const stIPPrice = await UnleashAdapter.getAssetPrice(STIP_ADDRESS);
    const wipPrice = await UnleashAdapter.getAssetPrice(WIP_ADDRESS);
    
    // Convert from base currency to token amounts
    const totalCollateral = (totalCollateralBase * hre.ethers.parseEther("1")) / stIPPrice;
    const totalDebt = (totalDebtBase * hre.ethers.parseEther("1")) / wipPrice;
    const availableBorrows = (availableBorrowsBase * hre.ethers.parseEther("1")) / wipPrice;
    
    console.log("Position after Loop 0:");
    console.log("  Total Collateral:", hre.ethers.formatEther(totalCollateral), "stIP");
    console.log("  Total Debt:", hre.ethers.formatEther(totalDebt), "IP");
    console.log("  Available Borrows:", hre.ethers.formatEther(availableBorrows), "IP");
    console.log("  Health Factor:", hre.ethers.formatEther(healthFactor), "\n");
    
    if (availableBorrows === 0n) {
        console.log("❌ No borrows available. Cannot proceed with loop.");
        return;
    }
    
    // ===================
    // LOOP 1
    // ===================
    
    console.log("=== LOOP 1: Borrow and Restake ===\n");
    
    // Just use the available borrows amount directly
    // It's already a safe amount calculated by Unleash
    const borrowAmount = availableBorrows;
    
    // Ensure minimum 0.1 IP for Meta Pool
    const minStake = hre.ethers.parseEther("0.1");
    if (borrowAmount < minStake) {
        console.log("⚠ Available borrow", hre.ethers.formatEther(borrowAmount), "IP is below Meta Pool minimum (0.1 IP)");
        console.log("Need to start with more capital. Try 0.25+ IP initial amount.\n");
        return;
    }
    
    console.log("Step 1: Borrowing", hre.ethers.formatEther(borrowAmount), "WIP...");
    
    tx = await Pool.borrow(
        WIP_ADDRESS,
        borrowAmount,
        2, // Variable rate
        0, // referralCode
        deployer.address,
        { gasLimit: 800000 }
    );
    await tx.wait();
    
    const wipBalance = await WIP.balanceOf(deployer.address);
    console.log("  ✓ Borrowed", hre.ethers.formatEther(wipBalance), "WIP\n");
    
    // Step 2: Unwrap WIP to IP
    console.log("Step 2: Unwrapping WIP to IP...");
    const IWIP = await hre.ethers.getContractAt(
        ["function withdraw(uint256) external"],
        WIP_ADDRESS
    );
    tx = await IWIP.withdraw(wipBalance, { gasLimit: 100000 });
    await tx.wait();
    console.log("  ✓ Unwrapped to IP\n");
    
    // Step 3: Stake borrowed IP
    console.log("Step 3: Staking borrowed", hre.ethers.formatEther(borrowAmount), "IP...");
    const beforeLoop1StIP = await StIP.balanceOf(deployer.address);
    
    tx = await MetaPoolAdapter.stakeIP(borrowAmount, deployer.address, {
        value: borrowAmount,
        gasLimit: 200000
    });
    await tx.wait();
    
    const afterLoop1StIP = await StIP.balanceOf(deployer.address);
    const stIPFromLoop1 = afterLoop1StIP - beforeLoop1StIP;
    console.log("  ✓ Received", hre.ethers.formatEther(stIPFromLoop1), "stIP\n");
    
    // Step 4: Supply new stIP to Unleash
    console.log("Step 4: Supplying loop stIP to Unleash...");
    tx = await StIP.approve(POOL_ADDRESS, stIPFromLoop1);
    await tx.wait();
    
    tx = await Pool.supply(STIP_ADDRESS, stIPFromLoop1, deployer.address, 0, { gasLimit: 500000 });
    await tx.wait();
    console.log("  ✓ Supplied\n");
    
    // Check final position
    [totalCollateralBase, totalDebtBase, availableBorrowsBase, , , healthFactor] = 
        await Pool.getUserAccountData(deployer.address);
    
    const finalCollateral = (totalCollateralBase * hre.ethers.parseEther("1")) / stIPPrice;
    const finalDebt = (totalDebtBase * hre.ethers.parseEther("1")) / wipPrice;
    const finalAvailableBorrows = (availableBorrowsBase * hre.ethers.parseEther("1")) / wipPrice;
    
    console.log("=== Final Position (After 1 Loop) ===");
    console.log("  Total Collateral:", hre.ethers.formatEther(finalCollateral), "stIP");
    console.log("  Total Debt:", hre.ethers.formatEther(finalDebt), "IP");
    console.log("  Available Borrows:", hre.ethers.formatEther(finalAvailableBorrows), "IP");
    console.log("  Health Factor:", hre.ethers.formatEther(healthFactor));
    
    const totalStIPSupplied = stIPFromInitial + stIPFromLoop1;
    const leverage = Number(totalStIPSupplied) / Number(stIPFromInitial);
    console.log("\n  Total stIP Supplied:", hre.ethers.formatEther(totalStIPSupplied));
    console.log("  Leverage Multiplier:", leverage.toFixed(2), "x");
    
    if (healthFactor >= hre.ethers.parseEther("1.7")) {
        console.log("  Status: ✓ EXCELLENT (HF ≥ 1.7)");
    } else if (healthFactor >= hre.ethers.parseEther("1.5")) {
        console.log("  Status: ⚠ ACCEPTABLE (HF ≥ 1.5)");
    } else {
        console.log("  Status: ❌ AT RISK (HF < 1.5)");
    }
    
    console.log("\n=== 1-Loop Test Complete ===");
    console.log("✓ Manual looping successful!");
    console.log("✓ Ready to implement in LeverageController\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });