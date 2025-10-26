"use client"
import { ReactNode, useEffect, useState } from "react"
import { WagmiProvider, State } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { wagmiConfig, initWeb3Modal } from "@/lib/web3"

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export function Web3Provider({
  children,
  initialState,
}: {
  children: ReactNode
  initialState?: State
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Initialize Web3Modal on mount
    initWeb3Modal()
    setMounted(true)
  }, [])

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {mounted ? children : null}
      </QueryClientProvider>
    </WagmiProvider>
  )
}