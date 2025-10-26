import { Address } from "viem"

export const CONTRACTS = {
  VaultRouter: "0xD48cFE0094Eccde69e588272802a69D170d7439a" as Address,
  LeverageController: "0x2494fcA303d57834A49356Ff1233D17cD6C1EA4b" as Address,
  MetaPoolAdapter: "0xE671d040E87BA0BD21a7f8a294F55A577d4939AA" as Address,
  // WIP kept for later if you add ERC-20 staking path
  WIP: "0x1514000000000000000000000000000000000000" as Address
} as const

export const CHAIN_ID = 1514 as const

export const RISK_PRESETS = {
  CONSERVATIVE: { id: 0, name: "Conservative", leverage: "None", apy: "7.02%",  description: "Pure staking with no leverage. Safest option." },
  BALANCED:     { id: 1, name: "Balanced",     leverage: "1x",   apy: "NA%", description: "1 loop of borrowing. Moderate risk." },
  MODERATE:     { id: 2, name: "Moderate",     leverage: "2x",   apy: "NA%", description: "2 loops of borrowing. Higher returns, higher risk." },
  AGGRESSIVE:   { id: 3, name: "Aggressive",   leverage: "3x",   apy: "NA%", description: "3 loops of borrowing. Maximum returns, maximum risk." }
} as const

export type UserConfig = {
  preset: bigint
  royaltySource: `0x${string}`
  lastCompound: bigint
  autoCompound: boolean
}

export const VAULT_ROUTER_ABI = [
  {
    inputs: [
      { name: "preset", type: "uint8" },
      { name: "royaltySource", type: "address" },
      { name: "autoCompound", type: "bool" }
    ],
    name: "configureRoute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  { inputs: [], name: "stakeIP", outputs: [], stateMutability: "payable", type: "function" },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserConfig",
    outputs: [{
      components: [
        { name: "preset", type: "uint8" },
        { name: "royaltySource", type: "address" },
        { name: "lastCompound", type: "uint256" },
        { name: "autoCompound", type: "bool" }
      ],
      type: "tuple"
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getStIPBalance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const
