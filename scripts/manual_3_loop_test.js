const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("=== Manual 3-Loop Leverage Test ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const deployment = JSON.parse(fs.readFileSync('deployment-output.json', 'utf8'));
    
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
    const IWIP = await hre.ethers.getContractAt(
        ["function withdraw(uint256) external"],
        WIP_ADDRESS
    );
    const WIP = await hre.ethers.getContractAt("IERC20", WIP_ADDRESS);
    
    const UnleashAdapter = await hre.ethers.getContractAt(
        "UnleashAdapter",
        deployment.contracts.UnleashAdapter
    );
    
    const initialAmount = hre.ethers.parseEther("0.4");
    const minStake = hre.ethers.parseEther("0.1");
    
    console.log("Initial capital:", hre.ethers.formatEther(initialAmount), "IP");
    console.log("Target: 3 loops");
    console.log("⚠ WARNING: Highest risk tier\n");
    
    // Get prices
    const stIPPrice = await UnleashAdapter.getAssetPrice(STIP_ADDRESS);
    const wipPrice = await UnleashAdapter.getAssetPrice(WIP_ADDRESS);
    
    const initialStIP = await StIP.balanceOf(deployer.address);
    let totalStIPSupplied = 0n;
    
    // LOOP 0
    console.log("=== LOOP 0: Initial Stake ===\n");
    let tx = await MetaPoolAdapter.stakeIP(initialAmount, deployer.address, {
        value: initialAmount,
        gasLimit: 200000
    });
    await tx.wait();
    
    let stIPBalance = await StIP.balanceOf(deployer.address);
    let stIPReceived = stIPBalance - initialStIP;
    totalStIPSupplied += stIPReceived;
    console.log("Staked:", hre.ethers.formatEther(initialAmount), "IP →", hre.ethers.formatEther(stIPReceived), "stIP\n");
    
    tx = await StIP.approve(POOL_ADDRESS, stIPReceived);
    await tx.wait();
    tx = await Pool.supply(STIP_ADDRESS, stIPReceived, deployer.address, 0, { gasLimit: 500000 });
    await tx.wait();
    
    tx = await Pool.setUserUseReserveAsCollateral(STIP_ADDRESS, true);
    await tx.wait();
    console.log("Supplied to Unleash ✓\n");
    
    // Execute 3 loops
    for (let loop = 1; loop <= 3; loop++) {
        console.log(`=== LOOP ${loop} ===\n`);
        
        let [, , availableBorrowsBase, , , hf] = await Pool.getUserAccountData(deployer.address);
        
        const availableBorrows = (availableBorrowsBase * hre.ethers.parseEther("1")) / (wipPrice / 10000000000n);
        
        console.log("Available borrows:", hre.ethers.formatEther(availableBorrows), "IP");
        console.log("Health Factor:", hre.ethers.formatEther(hf), "\n");
        
        if (availableBorrows < minStake) {
            console.log(`Cannot execute loop ${loop} - insufficient borrows (need min 0.1 IP)\n`);
            break;
        }
        
        const borrowAmount = (availableBorrows * 44n) / 100n;
        console.log(`Borrowing`, hre.ethers.formatEther(borrowAmount), "WIP...");
        
        tx = await Pool.borrow(WIP_ADDRESS, borrowAmount, 2, 0, deployer.address, { gasLimit: 800000 });
        await tx.wait();
        
        const wipBal = await WIP.balanceOf(deployer.address);
        tx = await IWIP.withdraw(wipBal, { gasLimit: 100000 });
        await tx.wait();
        console.log("Unwrapped to IP ✓\n");
        
        const beforeStIP = await StIP.balanceOf(deployer.address);
        tx = await MetaPoolAdapter.stakeIP(borrowAmount, deployer.address, {
            value: borrowAmount,
            gasLimit: 200000
        });
        await tx.wait();
        
        const afterStIP = await StIP.balanceOf(deployer.address);
        const newStIP = afterStIP - beforeStIP;
        totalStIPSupplied += newStIP;
        console.log("Staked:", hre.ethers.formatEther(borrowAmount), "IP →", hre.ethers.formatEther(newStIP), "stIP\n");
        
        tx = await StIP.approve(POOL_ADDRESS, newStIP);
        await tx.wait();
        tx = await Pool.supply(STIP_ADDRESS, newStIP, deployer.address, 0, { gasLimit: 500000 });
        await tx.wait();
        console.log("Supplied to Unleash ✓\n");
    }
    
    // Final stats
    const [totalCollateralBase, totalDebtBase, , , , finalHF] = await Pool.getUserAccountData(deployer.address);
    const totalCollateral = (totalCollateralBase * hre.ethers.parseEther("1")) / (stIPPrice / 10000000000n);
    const totalDebt = (totalDebtBase * hre.ethers.parseEther("1")) / (wipPrice / 10000000000n);
    
    console.log("=== Final Position (After 3 Loops) ===");
    console.log("Total Collateral:", hre.ethers.formatEther(totalCollateral), "stIP");
    console.log("Total Debt:", hre.ethers.formatEther(totalDebt), "IP");
    console.log("Health Factor:", hre.ethers.formatEther(finalHF));
    console.log("Total stIP Supplied:", hre.ethers.formatEther(totalStIPSupplied));
    console.log("Leverage:", (Number(totalStIPSupplied) / Number(stIPReceived)).toFixed(2), "x\n");
    
    if (finalHF >= hre.ethers.parseEther("1.5")) {
        console.log("Status: ✓ Position is safe");
    } else {
        console.log("Status: ⚠ WARNING - Health factor below minimum!");
    }
    
    console.log("\n=== 3-Loop Test Complete ===\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });