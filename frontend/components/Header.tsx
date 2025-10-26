"use client"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useWeb3Modal } from "@web3modal/wagmi/react"
import { useAccount } from "wagmi"

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { open } = useWeb3Modal()
  const { address, isConnected } = useAccount()

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 header-glass border-b border-border/50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground">IP</span>
            </div>
            <span className="text-xl font-bold text-foreground">IP Autostaker</span>
          </Link>
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-foreground/80 hover:text-foreground transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/analytics" className="text-foreground/80 hover:text-foreground transition-colors font-medium">
              Analytics
            </Link>
          </nav>
          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => open()}
              className="font-medium bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              {isConnected && address ? formatAddress(address) : "Connect Wallet"}
            </Button>
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden text-foreground hover:text-foreground/80"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden mt-4 pt-4 border-t border-border/50">
            <div className="flex flex-col space-y-4">
              <Link href="/" className="text-foreground/80 hover:text-foreground transition-colors font-medium">
                Dashboard
              </Link>
              <Link
                href="/analytics"
                className="text-foreground/80 hover:text-foreground transition-colors font-medium"
              >
                Analytics
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}