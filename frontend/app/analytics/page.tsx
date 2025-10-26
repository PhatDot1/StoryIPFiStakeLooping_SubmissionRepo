"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Activity, TrendingUp, Wallet, AlertCircle } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface DashboardData {
  user: {
    id: string
    totalStIP: string
    totalCollateralBase: string
    totalDebtBase: string
    healthFactor: string
  } | null
  supplyEvents: Array<{
    id: string
    amount: string
    asset: string
    blockTime: number
    txHash: string
  }>
  borrowEvents: Array<{
    id: string
    amount: string
    asset: string
    blockTime: number
    txHash: string
  }>
  repayEvents: Array<{
    id: string
    amount: string
    asset: string
    blockTime: number
    txHash: string
  }>
}

function useDashboardData(userAddress: string) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!userAddress) {
      setData(null)
      return
    }

    const fetchData = async () => {
      setLoading(true)
      setError(null)

      const query = `
        query Dashboard($user: ID!) {
          user(id: $user) {
            id
            totalStIP
            totalCollateralBase
            totalDebtBase
            healthFactor
          }
          supplyEvents(first: 20, orderBy: blockTime, orderDirection: desc, where: { user: $user }) {
            id
            amount
            asset
            blockTime
            txHash
          }
          borrowEvents(first: 20, orderBy: blockTime, orderDirection: desc, where: { user: $user }) {
            id
            amount
            asset
            blockTime
            txHash
          }
          repayEvents(first: 20, orderBy: blockTime, orderDirection: desc, where: { user: $user }) {
            id
            amount
            asset
            blockTime
            txHash
          }
        }
      `

      try {
        const response = await fetch(
          process.env.NEXT_PUBLIC_HYPERINDEX_GRAPHQL || "https://your-hyperindex-endpoint.com/graphql",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              variables: { user: userAddress.toLowerCase() },
            }),
          },
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()

        if (result.errors) {
          throw new Error(result.errors[0]?.message || "GraphQL error")
        }

        setData(result.data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [userAddress])

  return { data, loading, error }
}

function DashboardContent() {
  const [userAddress, setUserAddress] = useState("")
  const [searchAddress, setSearchAddress] = useState("")

  const { data, loading, error } = useDashboardData(searchAddress)

  const handleSearch = () => {
    if (userAddress.trim()) {
      setSearchAddress(userAddress.trim())
    }
  }

  // Transform supply events for chart
  const supplyChartData = data?.supplyEvents
    ? [...data.supplyEvents].reverse().map((e) => ({
        time: new Date(e.blockTime * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        amount: Number(e.amount),
        timestamp: e.blockTime,
      }))
    : []

  // Transform borrow events for chart
  const borrowChartData = data?.borrowEvents
    ? [...data.borrowEvents].reverse().map((e) => ({
        time: new Date(e.blockTime * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        amount: Number(e.amount),
        timestamp: e.blockTime,
      }))
    : []

  // Calculate utilization
  const utilization = data?.user
    ? data.user.totalCollateralBase > "0"
      ? ((Number(data.user.totalDebtBase) / Number(data.user.totalCollateralBase)) * 100).toFixed(2)
      : "0.00"
    : "0.00"

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Story IP Analytics</h1>
            <p className="text-muted-foreground">Real-time on-chain data powered by Envio HyperIndex</p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Search Bar */}
        <Card>
          <CardHeader>
            <CardTitle>Search User Position</CardTitle>
            <CardDescription>Enter a wallet address to view their lending position and activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="0x..."
                value={userAddress}
                onChange={(e) => setUserAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={!userAddress.trim()}>
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-5 w-5 animate-spin" />
                <span>Loading position data...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-2 py-6 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Error loading data: {error.message}</span>
            </CardContent>
          </Card>
        )}

        {/* Dashboard Content */}
        {data && data.user && (
          <>
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">stIP Balance</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{Number(data.user.totalStIP).toFixed(4)}</div>
                  <p className="text-xs text-muted-foreground">Staked IP tokens</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Collateral</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${Number(data.user.totalCollateralBase).toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">USD value</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${Number(data.user.totalDebtBase).toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">Borrowed amount</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Health Factor</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-bold ${Number(data.user.healthFactor) < 1.5 ? "text-destructive" : ""}`}
                  >
                    {Number(data.user.healthFactor).toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground">{utilization}% utilization</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <Tabs defaultValue="supply" className="space-y-4">
              <TabsList>
                <TabsTrigger value="supply">Supply Activity</TabsTrigger>
                <TabsTrigger value="borrow">Borrow Activity</TabsTrigger>
                <TabsTrigger value="events">Recent Events</TabsTrigger>
              </TabsList>

              <TabsContent value="supply" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Supply History</CardTitle>
                    <CardDescription>Track supply events over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {supplyChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={supplyChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="time" className="text-xs" />
                          <YAxis className="text-xs" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Line type="monotone" dataKey="amount" stroke="hsl(var(--chart-1))" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        No supply events found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="borrow" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Borrow History</CardTitle>
                    <CardDescription>Track borrow events over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {borrowChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={borrowChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="time" className="text-xs" />
                          <YAxis className="text-xs" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Bar dataKey="amount" fill="hsl(var(--chart-2))" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        No borrow events found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="events" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest supply, borrow, and repay events</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {data.supplyEvents.slice(0, 5).map((event) => (
                        <div key={event.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Supply</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(event.blockTime * 1000).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">+{Number(event.amount).toFixed(4)}</p>
                            <a
                              href={`https://explorer.story.foundation/tx/${event.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              View tx
                            </a>
                          </div>
                        </div>
                      ))}
                      {data.borrowEvents.slice(0, 5).map((event) => (
                        <div key={event.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Borrow</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(event.blockTime * 1000).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-destructive">-{Number(event.amount).toFixed(4)}</p>
                            <a
                              href={`https://explorer.story.foundation/tx/${event.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              View tx
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Empty State */}
        {!loading && !error && !searchAddress && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No Address Selected</h3>
              <p className="text-sm text-muted-foreground">
                Enter a wallet address above to view their lending position
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  return <DashboardContent />
}
