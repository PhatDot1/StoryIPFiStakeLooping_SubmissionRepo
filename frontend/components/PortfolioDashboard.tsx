"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Wallet, Settings, BarChart3 } from "lucide-react"
import { useAccount, useReadContract } from "wagmi"
import { formatEther } from "viem"
import {
  CONTRACTS,
  VAULT_ROUTER_ABI,
  RISK_PRESETS,
  type UserConfig
} from "@/config/contracts"
import Link from "next/link"

interface PortfolioDashboardProps {
  setActiveTab: (tab: string) => void
}

export default function PortfolioDashboard({ setActiveTab }: PortfolioDashboardProps) {
  const { address, isConnected } = useAccount()

  const { data: stIPBalanceRaw } = useReadContract({
    address: CONTRACTS.VaultRouter,
    abi: VAULT_ROUTER_ABI,
    functionName: "getStIPBalance",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  })

  const { data: userConfigRaw } = useReadContract({
    address: CONTRACTS.VaultRouter,
    abi: VAULT_ROUTER_ABI,
    functionName: "getUserConfig",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  })

  const stIPBalanceFormatted = useMemo(() => {
    if (!stIPBalanceRaw) return "0"
    try {
      return formatEther(stIPBalanceRaw as bigint)
    } catch {
      return "0"
    }
  }, [stIPBalanceRaw])

  const userConfig: UserConfig | null = useMemo(() => {
    if (!userConfigRaw) return null
    const u = userConfigRaw as unknown as UserConfig
    if (
      typeof u?.autoCompound === "boolean" &&
      typeof u?.royaltySource === "string" &&
      typeof u?.preset !== "undefined"
    ) return u
    return null
  }, [userConfigRaw])

  if (!isConnected) return null

  const currentPreset = userConfig ? Number(userConfig.preset) : 1
  const currentPresetData = Object.values(RISK_PRESETS).find((p) => p.id === currentPreset)
  const hasStaked = Number.parseFloat(stIPBalanceFormatted) > 0

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Portfolio Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold text-primary">
                {Number.parseFloat(stIPBalanceFormatted).toFixed(4)}
              </div>
              <div className="text-sm text-muted-foreground">stIP Balance</div>
              <div className="text-xs text-muted-foreground">Total Staked Value</div>
            </div>

            <div className="text-center space-y-2">
              <Badge className="bg-primary text-primary-foreground text-lg px-4 py-2">
                {currentPresetData?.name}
              </Badge>
              <div className="text-sm text-muted-foreground">Current Strategy</div>
              <div className="text-xs text-muted-foreground">{currentPresetData?.leverage} Leverage</div>
            </div>

            <div className="text-center space-y-2">
              <div className="text-3xl font-bold text-secondary">{currentPresetData?.apy}</div>
              <div className="text-sm text-muted-foreground">Expected APY</div>
              <div className="text-xs text-muted-foreground">With Auto-Compound</div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => setActiveTab("stake")}
              className="flex-1 bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              <Wallet className="w-4 h-4 mr-2" />
              Stake More
            </Button>
            <Button onClick={() => setActiveTab("risk")} variant="outline" className="flex-1 glass-card border-border">
              <Settings className="w-4 h-4 mr-2" />
              Adjust Strategy
            </Button>
            <Link href="/analytics" className="flex-1">
              <Button variant="outline" className="w-full glass-card border-border bg-transparent">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {!hasStaked && (
        <Card className="glass-card border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-foreground mb-2">Ready to Start Earning?</div>
                <div className="text-sm text-muted-foreground mb-4">
                  Stake your IP tokens and choose a leverage strategy to start earning automated rewards.
                </div>
                <Button onClick={() => setActiveTab("stake")} className="bg-primary hover:bg-primary/80">
                  Stake IP Tokens
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-foreground">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(RISK_PRESETS).map((preset) => (
              <Card key={preset.id} className="glass-card border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">{preset.name}</span>
                    <Badge variant="outline">{preset.leverage}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">{preset.description}</div>
                  <div className="text-lg font-bold text-primary">{preset.apy}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
