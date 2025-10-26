import os
from enum import Enum
from dataclasses import dataclass

class RiskStrategy(Enum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"

@dataclass
class AgentConfig:
    """Configuration for the autonomous agent"""
    
    # Monitoring settings
    check_interval_seconds: int = 180  # 3 minutes
    correlation_check_interval: int = 600  # 10 minutes
    
    # Risk thresholds
    min_health_factor: float = 1.5
    target_health_factor: float = 1.7
    critical_health_factor: float = 1.3  # Emergency unwind threshold
    
    # Rebalancing triggers
    health_factor_deviation: float = 0.15  # Trigger if HF deviates by 15%
    correlation_threshold: float = 0.85  # Alert if correlation drops below this
    max_debt_utilization: float = 0.75  # Max 75% of available borrows used
    
    # Gas settings
    max_gas_price_gwei: float = 100.0  # Don't execute if gas too high
    
    # Strategy
    risk_strategy: RiskStrategy = RiskStrategy.CONSERVATIVE
    
    # Hardhat settings
    hardhat_dir: str = "/Users/ppwoork/contract-deployment"
    network: str = "story_mainnet"
    
    @classmethod
    def from_env(cls):
        """Load configuration from environment variables"""
        strategy_str = os.getenv("STRATEGY", "conservative").lower()
        strategy = RiskStrategy(strategy_str)
        
        return cls(
            check_interval_seconds=int(os.getenv("CHECK_INTERVAL", "180")),
            correlation_check_interval=int(os.getenv("CORRELATION_CHECK_INTERVAL", "600")),
            min_health_factor=float(os.getenv("MIN_HEALTH_FACTOR", "1.5")),
            target_health_factor=float(os.getenv("TARGET_HEALTH_FACTOR", "1.7")),
            critical_health_factor=float(os.getenv("CRITICAL_HEALTH_FACTOR", "1.3")),
            max_gas_price_gwei=float(os.getenv("MAX_GAS_PRICE_GWEI", "100.0")),
            risk_strategy=strategy,
            hardhat_dir=os.getenv("HARDHAT_DIR", "/Users/ppwoork/contract-deployment"),
            network=os.getenv("NETWORK", "story_mainnet")
        )
    
    def get_strategy_params(self):
        """Get strategy-specific parameters"""
        params = {
            RiskStrategy.CONSERVATIVE: {
                "max_loops": 1,
                "target_hf": 1.9,
                "min_hf": 1.7,
                "rebalance_threshold": 0.1
            },
            RiskStrategy.BALANCED: {
                "max_loops": 1,
                "target_hf": 1.7,
                "min_hf": 1.5,
                "rebalance_threshold": 0.15
            },
            RiskStrategy.MODERATE: {
                "max_loops": 2,
                "target_hf": 1.6,
                "min_hf": 1.4,
                "rebalance_threshold": 0.2
            },
            RiskStrategy.AGGRESSIVE: {
                "max_loops": 3,
                "target_hf": 1.5,
                "min_hf": 1.3,
                "rebalance_threshold": 0.25
            }
        }
        return params[self.risk_strategy]