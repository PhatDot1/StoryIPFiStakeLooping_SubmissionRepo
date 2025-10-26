// components/StakingDashboard.tsx
"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { OpenfortButton } from "@openfort/react"
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt
} from "wagmi"
import { parseEther, formatEther } from "viem"
import {
  CONTRACTS,
  RISK_PRESETS,
  CHAIN_ID,
  VAULT_ROUTER_ABI,
  type UserConfig
} from "@/config/contracts"

// --- Define Constants for Validation ---
const MIN_NET_STAKE = 0.1 // The contract's minimum
const PERFORMANCE_FEE_PERCENT = 0.02 // Your 2% fee

// Gross minimum for a simple stake (0.1 / (1 - 0.02))
const MIN_GROSS_STAKE_CONSERVATIVE = MIN_NET_STAKE / (1 - PERFORMANCE_FEE_PERCENT) // ~0.1021 IP

/**
 * Estimated minimums for leverage.
 */
const MIN_STAKE_MAP: { [key: number]: number } = {
  0: MIN_GROSS_STAKE_CONSERVATIVE, // Conservative
  1: 0.145, // Balanced (Loop 1)
  2: 0.205, // Moderate (Loop 2)
  3: 0.290, // Aggressive (Loop 3)
}
// --- End Constants ---


export function StakingDashboard() {
  const { address, isConnected, chainId } = useAccount()
  const [selectedRisk, setSelectedRisk] = useState<number>(0)
  const [stakeAmount, setStakeAmount] = useState("")
  const [isConfiguring, setIsConfiguring] = useState(false)

  // Read user configuration (typed object, not tuple!)
  const {
    data: userConfigRaw,
    refetch: refetchConfig
  } = useReadContract({
    address: CONTRACTS.VaultRouter,
    abi: VAULT_ROUTER_ABI,
    functionName: "getUserConfig",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  })

  const userConfig: UserConfig | null = useMemo(() => {
    if (!userConfigRaw) return null
    const u = userConfigRaw as unknown as UserConfig
    return (typeof u?.preset !== "undefined" ? u : null)
  }, [userConfigRaw])

  // Read stIP balance
  const {
    data: stIPBalance,
    refetch: refetchBalance
  } = useReadContract({
    address: CONTRACTS.VaultRouter,
    abi: VAULT_ROUTER_ABI,
    functionName: "getStIPBalance",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  })

  // Configure route
  const { writeContract: configure, data: configHash } = useWriteContract()
  const { isLoading: isConfiguringTx } = useWaitForTransactionReceipt({
    hash: configHash,
    chainId: CHAIN_ID,
    confirmations: 1
  })

  // Stake IP
  const { writeContract: stake, data: stakeHash } = useWriteContract()
  const { isLoading: isStaking, isSuccess: isStakeSuccess } = useWaitForTransactionReceipt({
    hash: stakeHash,
    chainId: CHAIN_ID,
    confirmations: 1
  })

  // Update selected risk when config loads
  useEffect(() => {
    if (userConfig) {
      setSelectedRisk(Number(userConfig.preset))
    }
  }, [userConfig])

  // Refetch after successful stake
  useEffect(() => {
    if (isStakeSuccess) {
      refetchBalance()
      refetchConfig()
      setStakeAmount("")
    }
  }, [isStakeSuccess, refetchBalance, refetchConfig])

  const handleConfigure = async () => {
    if (!address) return
    setIsConfiguring(true)
    try {
      configure({
        address: CONTRACTS.VaultRouter,
        abi: VAULT_ROUTER_ABI,
        functionName: "configureRoute",
        args: [selectedRisk, address as `0x${string}`, false],
        chainId: CHAIN_ID
      })
    } finally {
      setIsConfiguring(false)
    }
  }

  const handleStake = async () => {
    // Check if config is out of sync
    if (userConfig && selectedRisk !== Number(userConfig.preset)) {
      alert("Your selected risk does not match your saved setting. Please click 'Update Risk Level' first.")
      return
    }
    if (!stakeAmount || !address || !isValidAmount) return
    
    stake({
      address: CONTRACTS.VaultRouter,
      abi: VAULT_ROUTER_ABI,
      functionName: "stakeIP",
      value: parseEther(stakeAmount),
      chainId: CHAIN_ID
    })
  }

  const isWrongChain = isConnected && chainId !== CHAIN_ID
  const currentRisk = Object.values(RISK_PRESETS)[selectedRisk]

  // --- Updated Validation ---
  const minStakeAmount = MIN_STAKE_MAP[selectedRisk]
  const minStakeString = minStakeAmount.toFixed(4)
  const amountNumber = Number(stakeAmount || "0")
  const isAboveMin = amountNumber >= minStakeAmount
  const isValidAmount = amountNumber > 0 && isAboveMin
  // ---

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">IP Rewards Autostaker</h1>
            <div className="flex gap-4 mt-2">
              <Link href="/" className="text-white/80 hover:text-white text-sm">Dashboard</Link>
              <Link href="/analytics" className="text-white/80 hover:text-white text-sm">Analytics</Link>
            </div>
          </div>
          <OpenfortButton />
        </div>

        {isWrongChain && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-6">
            ⚠️ Please switch to Story mainnet (Chain ID: {CHAIN_ID})
          </div>
        )}

        {isConnected && !isWrongChain && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Portfolio Card */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-white">
              <h2 className="text-xl font-semibold mb-4">Your Portfolio</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-gray-300 text-sm">stIP Balance</p>
                  <p className="text-3xl font-bold">
                    {stIPBalance ? formatEther(stIPBalance as bigint) : "0.00"}
                  </p>
                  <p className="text-gray-400 text-sm">
                    ≈ ${stIPBalance ? (Number(formatEther(stIPBalance as bigint)) * 5.4).toFixed(2) : "0.00"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-300 text-sm">Current Risk Level</p>
                  <p className="text-xl font-semibold">{currentRisk.name}</p>
                  <p className="text-gray-400 text-sm">Expected APY: {currentRisk.apy}</p>
                </div>
                <div>
                  <p className="text-gray-300 text-sm">Leverage</p>
                  <p className="text-xl font-semibold">{currentRisk.leverage}</p>
                </div>
              </div>
            </div>

            {/* Risk Selection Card */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-white">
              <h2 className="text-xl font-semibold mb-4">Select Risk Level</h2>
              <div className="space-y-3">
                {Object.values(RISK_PRESETS).map((risk) => (
                  <button
                    key={risk.id}
                    onClick={() => setSelectedRisk(risk.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      selectedRisk === risk.id ? "bg-indigo-600 ring-2 ring-indigo-400" : "bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{risk.name}</p>
                        <p className="text-sm text-gray-300">Leverage: {risk.leverage}</p>
                      </div>
                      <p className="text-sm font-semibold text-green-400">{risk.apy}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleConfigure}
                disabled={isConfiguring || isConfiguringTx}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {isConfiguringTx ? "Configuring..." : "Update Risk Level"}
              </button>
            </div>

            {/* Stake Card */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-white">
              <h2 className="text-xl font-semibold mb-4">Stake IP</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Amount (IP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={minStakeAmount.toFixed(6)}
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder={`${minStakeString} minimum`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    ≈ ${stakeAmount ? (Number(stakeAmount) * 5.4).toFixed(2) : "0.00"}
                  </p>
                  {/* Updated Error Message */}
                  {stakeAmount && !isValidAmount && (
                    <p className="text-xs text-red-400 mt-1">
                      Minimum stake for {currentRisk.name} is {minStakeString} IP
                    </p>
                  )}
                </div>

                <div className="bg-white/5 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Performance Fee (2%)</span>
                    <span>
                      {stakeAmount ? (amountNumber * PERFORMANCE_FEE_PERCENT).toFixed(4) : "0"} IP
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">You will stake</span>
                    <span className="font-semibold">
                      {stakeAmount ? (amountNumber * (1 - PERFORMANCE_FEE_PERCENT)).toFixed(4) : "0"} IP
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Est. stIP received</span>
                    {/* This 0.9447 is an estimate, that's fine */}
                    <span>{stakeAmount ? (amountNumber * (1 - PERFORMANCE_FEE_PERCENT) * 0.9447).toFixed(4) : "0"}</span>
                  </div>
                </div>

                <button
                  onClick={handleStake}
                  disabled={!stakeAmount || !isValidAmount || isStaking}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg"
                >
                  {isStaking ? "Staking..." : "Stake IP"}
                </button>

                {isStakeSuccess && (
                  <div className="bg-green-500/20 border border-green-500 rounded-lg p-3 text-sm text-green-300">
                    ✓ Successfully staked! Your stIP is now earning rewards.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isConnected && (
          <div className="text-center py-20">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 max-w-md mx-auto">
              <h2 className="text-3xl font-bold text-white mb-4">Welcome to IP Autostaker</h2>
              <p className="text-gray-300 mb-8">
                Automatically stake your IP tokens and earn rewards with customizable risk levels.
              </p>
              <OpenfortButton />
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-white">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6">
            <h3 className="font-semibold mb-2">🔒 Secure</h3>
            <p className="text-sm text-gray-300">Non-custodial wallets powered by Openfort. You always control your keys.</p>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6">
            <h3 className="font-semibold mb-2">⚡ Automated</h3>
            <p className="text-sm text-gray-300">Set your risk level once, earn rewards automatically. No manual management needed.</p>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6">
            <h3 className="font-semibold mb-2">📈 Flexible</h3>
            <p className="text-sm text-gray-300">Choose from 4 risk levels: Conservative to Aggressive. Adjust anytime.</p>
          </div>
        </div>
      </div>
    </div>
  )
}