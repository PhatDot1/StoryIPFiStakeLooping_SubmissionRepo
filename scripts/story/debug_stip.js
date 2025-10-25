const hre = require("hardhat");

async function main() {
    console.log("=== Debug stIP Direct Call ===\n");

    const [deployer] = await hre.ethers.getSigners();
    
    const STIP_ADDRESS = "0xd07Faed671decf3C5A6cc038dAD97c8EFDb507c0";
    const testAmount = hre.ethers.parseEther("0.1");
    
    console.log("Account:", deployer.address);
    console.log("Balance:", hre.ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "IP");
    console.log("Test Amount:", hre.ethers.formatEther(testAmount), "IP\n");

    // Try calling stIP directly with the exact same method as MetaPool UI
    console.log("Attempting direct call to stIP.deposit(address)...");
    
    try {
        // Get stIP contract
        const stIP = await hre.ethers.getContractAt(
            ["function deposit(address) payable returns (uint256)"],
            STIP_ADDRESS
        );
        
        // Check initial balance
        const StIPToken = await hre.ethers.getContractAt("IERC20", STIP_ADDRESS);
        const initialBalance = await StIPToken.balanceOf(deployer.address);
        console.log("Initial stIP balance:", hre.ethers.formatEther(initialBalance), "\n");
        
        // Call deposit directly
        console.log("Calling deposit...");
        const tx = await stIP.deposit(deployer.address, {
            value: testAmount,
            gasLimit: 200000
        });
        
        console.log("Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("✓ Transaction confirmed!");
        console.log("Gas used:", receipt.gasUsed.toString(), "\n");
        
        // Check final balance
        const finalBalance = await StIPToken.balanceOf(deployer.address);
        console.log("Final stIP balance:", hre.ethers.formatEther(finalBalance));
        console.log("Shares received:", hre.ethers.formatEther(finalBalance - initialBalance), "\n");
        
        console.log("=== Direct Call Successful! ===");
        console.log("✓ stIP deposit works directly");
        console.log("Now we can debug the adapter...\n");
        
    } catch (error) {
        console.error("❌ Direct call failed:", error.message);
        
        if (error.data) {
            console.error("Error data:", error.data);
        }
        
        console.log("\nLet's try with estimate gas first...");
        
        try {
            const stIP = await hre.ethers.getContractAt(
                ["function deposit(address) payable returns (uint256)"],
                STIP_ADDRESS
            );
            
            const gasEstimate = await stIP.deposit.estimateGas(deployer.address, {
                value: testAmount
            });
            
            console.log("Gas estimate:", gasEstimate.toString());
            console.log("This means the call should work...\n");
            
        } catch (estimateError) {
            console.error("❌ Gas estimation also failed:", estimateError.message);
            
            // Try to decode the revert reason
            if (estimateError.data) {
                console.error("\nRevert data:", estimateError.data);
                
                // Try to decode as string
                try {
                    const decoded = hre.ethers.toUtf8String(estimateError.data);
                    console.error("Decoded revert reason:", decoded);
                } catch (e) {
                    console.error("Could not decode revert reason");
                }
            }
            
            console.log("\n=== Possible Issues ===");
            console.log("1. stIP contract may be paused");
            console.log("2. Minimum deposit requirement not met");
            console.log("3. Contract needs approval or setup");
            console.log("4. Proxy implementation issue\n");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });