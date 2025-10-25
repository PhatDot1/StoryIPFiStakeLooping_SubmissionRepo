const hre = require("hardhat");

async function main() {
    console.log("=== Investigating stIP Contract ===\n");

    const [deployer] = await hre.ethers.getSigners();
    
    const STIP_ADDRESS = "0xd07Faed671decf3C5A6cc038dAD97c8EFDb507c0";
    
    // Get stIP with the implementation ABI you provided
    const stIPABI = [
        "function owner() view returns (address)",
        "function operator() view returns (address)",
        "function totalAssets() view returns (uint256)",
        "function asset() view returns (address)",
        "function deposit(uint256 assets, address receiver) returns (uint256)",
        "function deposit(address receiver) payable returns (uint256)",
        "function paused() view returns (bool)",
        "function maxDeposit(address) view returns (uint256)",
        "function previewDeposit(uint256) view returns (uint256)"
    ];
    
    const stIP = await hre.ethers.getContractAt(stIPABI, STIP_ADDRESS);
    
    console.log("=== Contract State ===");
    
    try {
        const owner = await stIP.owner();
        console.log("Owner:", owner);
    } catch (e) {
        console.log("Owner: N/A (function doesn't exist)");
    }
    
    try {
        const operator = await stIP.operator();
        console.log("Operator:", operator);
    } catch (e) {
        console.log("Operator: N/A (function doesn't exist)");
    }
    
    try {
        const paused = await stIP.paused();
        console.log("Paused:", paused);
    } catch (e) {
        console.log("Paused: N/A (function doesn't exist)");
    }
    
    try {
        const totalAssets = await stIP.totalAssets();
        console.log("Total Assets:", hre.ethers.formatEther(totalAssets), "IP");
    } catch (e) {
        console.log("Total Assets: Error -", e.message);
    }
    
    try {
        const asset = await stIP.asset();
        console.log("Underlying Asset:", asset);
    } catch (e) {
        console.log("Underlying Asset: Error -", e.message);
    }
    
    try {
        const maxDeposit = await stIP.maxDeposit(deployer.address);
        console.log("Max Deposit for user:", hre.ethers.formatEther(maxDeposit), "IP");
    } catch (e) {
        console.log("Max Deposit: Error -", e.message);
    }
    
    try {
        const preview = await stIP.previewDeposit(hre.ethers.parseEther("0.1"));
        console.log("Preview 0.1 IP deposit:", hre.ethers.formatEther(preview), "stIP");
    } catch (e) {
        console.log("Preview Deposit: Error -", e.message);
    }
    
    console.log("\n=== Checking if it's an ERC4626 Vault ===");
    
    // Try to read the implementation address (if it's a proxy)
    const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    try {
        const implAddress = await hre.ethers.provider.getStorage(STIP_ADDRESS, implementationSlot);
        console.log("Implementation (if proxy):", "0x" + implAddress.slice(-40));
    } catch (e) {
        console.log("Not a proxy or can't read implementation");
    }
    
    console.log("\n=== Testing Different Deposit Methods ===\n");
    
    const testAmount = hre.ethers.parseEther("0.1");
    
    // Method 1: deposit(uint256, address)
    console.log("1. Trying deposit(uint256 assets, address receiver)...");
    try {
        const gasEstimate1 = await stIP.deposit.estimateGas(testAmount, deployer.address, {
            from: deployer.address
        });
        console.log("   ✓ Gas estimate:", gasEstimate1.toString());
        console.log("   This method should work!\n");
    } catch (e) {
        console.log("   ❌ Failed:", e.message.split('\n')[0], "\n");
    }
    
    // Method 2: deposit(address) payable
    console.log("2. Trying deposit(address receiver) with msg.value...");
    try {
        const gasEstimate2 = await stIP.deposit.estimateGas(deployer.address, {
            value: testAmount,
            from: deployer.address
        });
        console.log("   ✓ Gas estimate:", gasEstimate2.toString());
        console.log("   This method should work!\n");
    } catch (e) {
        console.log("   ❌ Failed:", e.message.split('\n')[0], "\n");
    }
    
    // Method 3: Check if we need to use WIP instead
    console.log("3. Checking if deposit requires WIP token...");
    const WIP_ADDRESS = "0x1514000000000000000000000000000000000000";
    const WIP = await hre.ethers.getContractAt("IERC20", WIP_ADDRESS);
    
    try {
        const wipBalance = await WIP.balanceOf(deployer.address);
        console.log("   User WIP balance:", hre.ethers.formatEther(wipBalance));
        
        if (wipBalance > 0n) {
            console.log("   Trying deposit with WIP approval...");
            // This would require WIP approval first
        } else {
            console.log("   User has no WIP tokens\n");
        }
    } catch (e) {
        console.log("   Error checking WIP:", e.message, "\n");
    }
    
    console.log("=== Investigation Complete ===\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });