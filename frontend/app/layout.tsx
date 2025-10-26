import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Web3Provider } from "../providers/Web3Provider"
import { headers } from "next/headers"
import { cookieToInitialState } from "wagmi"
import { wagmiConfig } from "@/lib/web3"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "IP Autostaker",
  description: "Automated IP Staking with Leverage",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const initialState = cookieToInitialState(wagmiConfig, (await headers()).get("cookie"))

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Web3Provider initialState={initialState}>
            {children}
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  )
}