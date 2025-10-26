"use client"
import { useState } from "react"
import Header from "@/components/Header"
import StakingInterface from "@/components/StakingInterface"
import RiskManagement from "@/components/RiskManagement"
import PortfolioDashboard from "@/components/PortfolioDashboard"
import Particles from "@/components/Particles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAccount } from "wagmi"
import { useWeb3Modal } from "@web3modal/wagmi/react"

export default function IPAutostaker() {
  const [activeTab, setActiveTab] = useState("dashboard")
  const { isConnected } = useAccount()
  const { open } = useWeb3Modal()

  return (
    <main className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0">
        <Particles />
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Header />

        {/* Main Content */}
        <div className="container mx-auto px-4 pt-24 pb-12">
          <div className="mb-8 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
              Automated IP Staking with Leverage
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
              Stake your IP tokens with customizable risk levels. Choose your leverage strategy and let the system
              automatically compound your rewards.
            </p>
          </div>

          {/* Welcome Screen - Only show when not connected */}
          {!isConnected ? (
            <Card className="glass-card max-w-md mx-auto">
              <CardContent className="p-8 text-center space-y-4">
                <div className="text-2xl font-bold text-foreground">Welcome to IP Autostaker</div>
                <div className="text-muted-foreground">
                  Connect your wallet to start staking IP tokens with automated leverage strategies
                </div>
                <Button
                  onClick={() => open()}
                  className="w-full py-6 bg-primary hover:bg-primary/80 text-primary-foreground"
                  size="lg"
                >
                  Connect Wallet
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="custom-tabs-list grid w-full grid-cols-3">
                <TabsTrigger value="dashboard" className="custom-tab-trigger">
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="stake" className="custom-tab-trigger">
                  Stake
                </TabsTrigger>
                <TabsTrigger value="risk" className="custom-tab-trigger">
                  Risk Settings
                </TabsTrigger>
              </TabsList>
              <div className="mt-8">
                <TabsContent value="dashboard" className="space-y-6">
                  <PortfolioDashboard setActiveTab={setActiveTab} />
                </TabsContent>
                <TabsContent value="stake" className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <StakingInterface />
                    <RiskManagement />
                  </div>
                </TabsContent>
                <TabsContent value="risk" className="space-y-6">
                  <RiskManagement />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </div>
    </main>
  )
}