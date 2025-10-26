"use client"
import { createWeb3Modal } from "@web3modal/wagmi/react"
import { defaultWagmiConfig } from "@web3modal/wagmi/react/config"
import { cookieStorage, createStorage } from "wagmi"
import { defineChain } from "viem"

// Define Story chain
export const storyMainnet = defineChain({
  id: 1514,
  name: "Story",
  nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.ankr.com/story_mainnet"] },
  },
  blockExplorers: {
    default: { name: "Story Explorer", url: "https://explorer.story.foundation" },
  },
})

// Get projectId from environment variables
const envProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

if (!envProjectId) {
  throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set")
}

export const projectId: string = envProjectId

// Metadata for your app
const metadata = {
  name: "IP Autostaker",
  description: "Automated IP Staking with Leverage",
  url: "https://ipautostaker.com", // Update with your actual URL
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
}

// Create wagmiConfig
export const wagmiConfig = defaultWagmiConfig({
  chains: [storyMainnet],
  projectId,
  metadata,
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
})

// Create modal - only on client side
let modalCreated = false

export function initWeb3Modal() {
  if (typeof window !== "undefined" && !modalCreated) {
    modalCreated = true
    createWeb3Modal({
      wagmiConfig,
      projectId,
      enableAnalytics: true,
      themeMode: "dark",
      themeVariables: {
        "--w3m-accent": "#00ef8b",
        "--w3m-border-radius-master": "12px",
      },
    })
  }
}