// components/RiskManagement.tsx
"use client"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Settings, TrendingUp } from "lucide-react"
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt
} from "wagmi"
import {
  CONTRACTS,
  VAULT_ROUTER_ABI,
  RISK_PRESETS,
  CHAIN_ID,
  type UserConfig
} from "@/config/contracts"

export default function RiskManagement() {
  const { address, isConnected } = useAccount()
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const { data: userConfigRaw, refetch } = useReadContract({
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

  // --- Robust Transaction Handling ---
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
    timeout: 60_000 // 60-second timeout to prevent "infinite" loading
  })
  // ---

  useEffect(() => {
    if (userConfig) setSelectedPreset(Number(userConfig.preset))
  }, [userConfig])

  useEffect(() => {
    if (isSuccess) refetch()
  }, [isSuccess, refetch])

  const handleRiskUpdate = () => {
    if (selectedPreset == null || !address) return
    writeContract({
      address: CONTRACTS.VaultRouter,
      abi: VAULT_ROUTER_ABI,
      functionName: "configureRoute",
      args: [selectedPreset, address as `0x${string}`, true],
      chainId: CHAIN_ID
    })
  }

  if (!isConnected) return null

  const currentPreset = userConfig ? Number(userConfig.preset) : 1
  const currentPresetData = Object.values(RISK_PRESETS).find((p) => p.id === currentPreset)

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
          <div className="w-5 h-5 bg-secondary rounded-full flex items-center justify-center">
            <Settings className="w-3 h-3 text-secondary-foreground" />
          </div>
          Risk Management
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          Adjust your leverage strategy to change risk and reward potential
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
          <div>
            <div className="font-medium text-foreground">Current Strategy</div>
            <div className="text-sm text-muted-foreground">{currentPresetData?.description}</div>
          </div>
          <Badge className="bg-primary text-primary-foreground">{currentPresetData?.name}</Badge>
        </div>
        <div className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">Select New Strategy</label>
          <div className="grid grid-cols-1 gap-3">
            {Object.values(RISK_PRESETS).map((preset) => {
              const isCurrent = preset.id === currentPreset
              const isSelected = selectedPreset === preset.id
              return (
                <Card
                  key={preset.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "ring-2 ring-primary glass-card"
                      : isCurrent
                      ? "ring-1 ring-secondary glass-card opacity-50"
                      : "glass-card hover:ring-1 hover:ring-border"
                  }`}
                  onClick={() => setSelectedPreset(preset.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full bg-primary" />
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {preset.name}
                            {isCurrent && <Badge variant="outline" className="text-xs">Current</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{preset.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-primary">{preset.apy}</div>
                        <div className="text-xs text-muted-foreground">{preset.leverage} Leverage</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
        {selectedPreset !== null && selectedPreset !== currentPreset && (
          <Button
            onClick={handleRiskUpdate}
            disabled={isPending || isConfirming}
            className="w-full bg-primary hover:bg-primary/80 text-primary-foreground"
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
                Update to {Object.values(RISK_PRESETS).find((p) => p.id === selectedPreset)?.name}
              </>
            )}
          </Button>
        )}
        
        {/* Transaction Status Messages */}
        {isSuccess && (
          <Card className="glass-card border-green-500/20 bg-green-500/5">
            <CardContent className="p-4">
              <div className="text-sm text-green-600 text-center">Strategy updated successfully!</div>
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