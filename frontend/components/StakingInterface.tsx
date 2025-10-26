// components/StakingInterface.tsx
"use client"
import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Wallet, TrendingUp } from "lucide-react"
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
  useSwitchChain
} from "wagmi"
import { parseEther } from "viem"
import { CONTRACTS, VAULT_ROUTER_ABI, RISK_PRESETS, CHAIN_ID } from "@/config/contracts"

// --- Define Constants for Validation ---
const MIN_NET_STAKE = 0.1 // The contract's minimum
const PERFORMANCE_FEE_PERCENT = 0.02 // Your 2% fee

// Gross minimum for a simple stake (0.1 / (1 - 0.02))
const MIN_GROSS_STAKE_CONSERVATIVE = MIN_NET_STAKE / (1 - PERFORMANCE_FEE_PERCENT) // ~0.1021 IP

/**
 * Estimated minimums for leverage.
 * This ensures the final loop's borrow amount is still > MIN_GROSS_STAKE_CONSERVATIVE.
 * These are estimates based on an assumed ~70-71% LTV * (1-fee) factor.
 * Min = MIN_GROSS_STAKE_CONSERVATIVE / ( (LTV * (1-FEE)) ^ NumLoops )
 */
const MIN_STAKE_MAP: { [key: number]: number } = {
  0: MIN_GROSS_STAKE_CONSERVATIVE, // Conservative (0 loops)
  1: 0.145, // Balanced (1 loop)
  2: 0.205, // Moderate (2 loops)
  3: 0.290, // Aggressive (3 loops)
}
// --- End Constants ---

export default function StakingInterface() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [amount, setAmount] = useState("")
  const [lastAmount, setLastAmount] = useState<string | null>(null)
  
  // Default to Conservative (0) if config is slow to load
  const { data: userConfigRaw } = useReadContract({
    address: CONTRACTS.VaultRouter,
    abi: VAULT_ROUTER_ABI,
    functionName: "getUserConfig",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  })
  
  // Get the preset from the config, fallback to 0
  const currentPresetId = useMemo(() => {
    if (!userConfigRaw) return 0 // Default to Conservative
    const u = userConfigRaw as unknown as { preset: number }
    return u?.preset ?? 0
  }, [userConfigRaw])
  
  // Local UI selection for the *next* stake
  const [selectedPreset, setSelectedPreset] = useState(currentPresetId)
  
  // Update local preset if the on-chain config changes (e.g., in Risk tab)
  useEffect(() => {
    setSelectedPreset(currentPresetId)
  }, [currentPresetId])

  const {
    data: nativeBal,
    isLoading: isBalanceLoading,
    isError: isBalanceError
  } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5000 },
  })
  const nativeBalance = nativeBal ? Number(nativeBal.formatted) : 0

  const { data: stIPBalRaw, refetch: refetchStIP } = useReadContract({
    address: CONTRACTS.VaultRouter,
    abi: VAULT_ROUTER_ABI,
    functionName: "getStIPBalance",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  })

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError
  } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isTxError,
    error: txError
  } = useWaitForTransactionReceipt({
    hash,
    chainId: CHAIN_ID,
    confirmations: 1,
    timeout: 60_000
  })

  // --- Updated Validation Logic ---
  const isWrongChain = isConnected && chainId !== CHAIN_ID
  const amountNumber = Number(amount || "0")
  
  // Get the dynamic minimum stake based on the selected preset
  const minStakeAmount = MIN_STAKE_MAP[selectedPreset]
  const minStakeString = minStakeAmount.toFixed(4)

  const isBalanceSufficient = amountNumber <= Math.max(0, nativeBalance - 0.01)
  const isAboveMin = amountNumber >= minStakeAmount
  
  const isValidAmount = amountNumber > 0 && isBalanceSufficient && isAboveMin
  
  const selectedPresetData = useMemo(
    () => Object.values(RISK_PRESETS).find((p) => p.id === selectedPreset),
    [selectedPreset]
  )
  // --- End Updated Validation ---

  const handleStake = () => {
    // Check if config is out of sync. If so, force user to update config first.
    if (selectedPreset !== currentPresetId) {
      alert("Your selected preset is different from your saved strategy. Please go to the 'Risk Settings' tab and click 'Update' first.")
      return
    }
    
    if (!isConnected || !isValidAmount) return
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    setLastAmount(amount)
    writeContract({
      address: CONTRACTS.VaultRouter,
      abi: VAULT_ROUTER_ABI,
      functionName: "stakeIP",
      value: parseEther(amount),
      chainId: CHAIN_ID
    })
  }

  useEffect(() => {
    if (isSuccess) {
      setAmount("")
      refetchStIP?.()
    }
  }, [isSuccess, refetchStIP])

  if (!isConnected) {
    return (
      <Card className="glass-card">
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground mb-4">Connect your wallet to stake IP tokens</div>
          <div className="text-sm text-muted-foreground">Start earning automated rewards with leverage strategies</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
            <Wallet className="w-3 h-3 text-primary-foreground" />
          </div>
          Stake IP Tokens
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          Stake native IP. Your stake will use your **currently saved** risk strategy.
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isWrongChain && (
          <div className="text-sm text-red-500 -mt-2">
            You’re on the wrong network.{" "}
            <button className="underline" onClick={() => switchChain({ chainId: CHAIN_ID })}>
              Switch to Story (1514)
            </button>
          </div>
        )}
        {/* Amount */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Amount to Stake (IP)</label>
          <div className="relative">
            <Input
              type="number"
              placeholder={`${minStakeString} IP minimum`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="glass-card border-border pr-16"
              step="any"
              min={minStakeAmount.toFixed(6)} // Use high precision for min
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80"
              onClick={() => setAmount(Math.max(0, nativeBalance - 0.01).toFixed(6))}
            >
              MAX
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Available: {
              isBalanceLoading ? "Loading..." :
              isBalanceError ? "Error loading balance" :
              `${nativeBalance.toFixed(4)} IP`
            } (reserve ~0.01 for gas)
          </div>
          {/* Updated Error Message */}
          {amount && !isValidAmount && (
            <div className="text-xs text-red-500">
              {!isAboveMin
                ? `Minimum for ${selectedPresetData?.name} is ${minStakeString} IP`
                : !isBalanceSufficient
                ? "Insufficient balance"
                : "Invalid amount"}
            </div>
          )}
        </div>
        {/* Presets */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">
            Stake using which preset?
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.values(RISK_PRESETS).map((preset) => {
              const isCurrentOnChain = preset.id === currentPresetId
              return (
                <Card
                  key={preset.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    selectedPreset === preset.id ? "ring-2 ring-primary glass-card" : "glass-card hover:ring-1 hover:ring-border"
                  } ${isCurrentOnChain ? "border-primary/50" : ""}`}
                  onClick={() => setSelectedPreset(preset.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm flex items-center gap-2">
                        {preset.name}
                        {isCurrentOnChain && (
                          <Badge variant="outline" className="text-xs border-primary/50 text-primary">Saved</Badge>
                        )}
                      </span>
                      <Badge variant="outline" className="text-xs">{preset.leverage}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1">{preset.description}</div>
                    <div className="text-sm font-medium text-primary">{preset.apy}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          {selectedPreset !== currentPresetId && (
            <div className="text-xs text-amber-500 text-center">
              You must update your strategy in the 'Risk Settings' tab before staking with {selectedPresetData?.name}.
            </div>
          )}
        </div>
        
        {/* Summary */}
        {amount && isValidAmount && (
          <Card className="glass-card border-primary/20">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Staking Amount</span>
                  <span className="font-medium">{amount} IP</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fee (2%)</span>
                  <span className="font-medium">
                    -{(amountNumber * PERFORMANCE_FEE_PERCENT).toFixed(5)} IP
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Net Stake Amount</span>
                  <span className="font-medium">
                    {(amountNumber * (1 - PERFORMANCE_FEE_PERCENT)).toFixed(5)} IP
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Using Strategy</span>
                  <Badge className="bg-primary text-primary-foreground">{selectedPresetData?.name}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Stake */}
        <Button
          onClick={handleStake}
          disabled={!amount || !isValidAmount || isPending || isConfirming || isWrongChain || selectedPreset !== currentPresetId}
          className="w-full bg-primary hover:bg-primary/80 text-primary-foreground font-medium py-6"
        >
          {isPending ? "Waiting for signature..." :
           isConfirming ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Confirming transaction...
            </div>
          ) : (
            <>
              <TrendingUp className="w-4 h-4 mr-2" />
              Stake IP Tokens
            </>
          )}
        </Button>
        {/* Transaction Status Messages */}
        {isSuccess && lastAmount && (
          <Card className="glass-card border-green-500/20 bg-green-500/5">
            <CardContent className="p-4">
              <div className="text-sm text-green-600 text-center">
                Successfully staked {lastAmount} IP! Your position is now active.
              </div>
            </CardContent>
          </Card>
        )}
        {isTxError && (
          <Card className="glass-card border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="text-sm text-red-600 text-center">
                Transaction failed or timed out. Please try again.
                <p className="text-xs text-muted-foreground truncate">{txError?.message}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {writeError && (
          <Card className="glass-card border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="text-sm text-red-600 text-center">
                Transaction rejected or failed to send.
                <p className="text-xs text-muted-foreground truncate">{writeError?.message}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}