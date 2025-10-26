import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    SAFE = "safe"
    WARNING = "warning"
    DANGER = "danger"
    CRITICAL = "critical"

class RebalanceAction(Enum):
    NONE = "none"
    MONITOR = "monitor"
    ADD_LOOP = "add_loop"  # NEW: Profitable to add leverage
    REDUCE_LOOP = "reduce_loop"
    EMERGENCY_UNWIND = "emergency_unwind"

@dataclass
class RiskAssessment:
    risk_level: RiskLevel
    recommended_action: RebalanceAction
    health_factor: float
    distance_to_liquidation: float
    correlation: float
    price_decoupling_risk: float  # NEW
    net_apy: float  # NEW: Net profitability
    gas_acceptable: bool
    is_profitable: bool  # NEW
    reasons: list[str]
    metrics: Dict[str, Any]

class RiskAnalyzer:
    """Analyzes position risk and determines rebalancing needs"""
    
    def __init__(self, config):
        self.config = config
        
        # APY assumptions (should be fetched from protocol in production)
        self.staking_apy = 0.08  # 8% stIP staking rewards
        self.supply_apy = 0.02   # 2% Unleash supply APY for stIP
        self.borrow_apy = 0.05   # 5% Unleash borrow APY for IP
        
    def assess_position(
        self,
        position_data: Dict[str, Any],
        correlation_data: Optional[Dict[str, Any]] = None,
        gas_data: Optional[Dict[str, Any]] = None
    ) -> RiskAssessment:
        """
        Comprehensive risk assessment of a position
        
        Includes:
        - Health factor analysis
        - Price decoupling risk
        - APY profitability
        - Correlation monitoring
        
        Returns RiskAssessment with recommended action
        """
        
        if not position_data.get("success"):
            logger.error("Invalid position data")
            return self._critical_assessment("Invalid position data")
        
        position = position_data["position"]
        unleash = position_data["unleash"]
        risk = position_data["risk"]
        
        # Extract key metrics
        health_factor = float(position["healthFactor"])
        has_position = position["hasPosition"]
        loops = int(position["loops"])
        
        if not has_position:
            # Check if it's profitable to enter a position
            net_apy = self._calculate_net_apy(0)  # 0 loops = direct staking
            is_profitable = net_apy > 0
            
            return RiskAssessment(
                risk_level=RiskLevel.SAFE,
                recommended_action=RebalanceAction.ADD_LOOP if is_profitable else RebalanceAction.NONE,
                health_factor=0.0,
                distance_to_liquidation=999.0,
                correlation=1.0,
                price_decoupling_risk=0.0,
                net_apy=net_apy,
                gas_acceptable=True,
                is_profitable=is_profitable,
                reasons=["No active position"] if not is_profitable else ["Profitable to enter position"],
                metrics={"net_apy": net_apy}
            )
        
        reasons = []
        risk_level = RiskLevel.SAFE
        action = RebalanceAction.NONE
        
        # 1. Health Factor Analysis
        strategy_params = self.config.get_strategy_params()
        target_hf = strategy_params["target_hf"]
        min_hf = strategy_params["min_hf"]
        
        if health_factor < self.config.critical_health_factor:
            risk_level = RiskLevel.CRITICAL
            action = RebalanceAction.EMERGENCY_UNWIND
            reasons.append(f"CRITICAL: Health factor {health_factor:.3f} below {self.config.critical_health_factor}")
        
        elif health_factor < min_hf:
            risk_level = RiskLevel.DANGER
            action = RebalanceAction.REDUCE_LOOP
            reasons.append(f"DANGER: Health factor {health_factor:.3f} below minimum {min_hf}")
        
        elif health_factor < target_hf:
            if risk_level == RiskLevel.SAFE:
                risk_level = RiskLevel.WARNING
            action = RebalanceAction.MONITOR
            reasons.append(f"WARNING: Health factor {health_factor:.3f} below target {target_hf}")
        
        else:
            reasons.append(f"Health factor {health_factor:.3f} is healthy")
        
        # 2. Price Decoupling Risk Analysis
        price_decoupling_risk = 0.0
        if correlation_data and correlation_data.get("success"):
            prices = correlation_data["prices"]
            stip_price = float(prices["stIP"])
            ip_price = float(prices["wip"])  # WIP = wrapped IP
            
            # Calculate price ratio deviation from 1.0 (perfect peg)
            price_ratio = stip_price / ip_price if ip_price > 0 else 1.0
            price_deviation = abs(1.0 - price_ratio)
            price_decoupling_risk = price_deviation
            
            # Critical: >5% deviation
            if price_deviation > 0.05:
                if risk_level != RiskLevel.CRITICAL:
                    risk_level = RiskLevel.DANGER
                if action == RebalanceAction.NONE or action == RebalanceAction.MONITOR:
                    action = RebalanceAction.REDUCE_LOOP
                reasons.append(f"DANGER: Price decoupling {price_deviation:.2%} (stIP/IP ratio: {price_ratio:.4f})")
            
            # Warning: >2% deviation
            elif price_deviation > 0.02:
                if risk_level == RiskLevel.SAFE:
                    risk_level = RiskLevel.WARNING
                reasons.append(f"WARNING: Price deviation {price_deviation:.2%}")
            
            # Explain liquidation risk from decoupling
            if price_deviation > 0.02:
                # If stIP depegs down, collateral value drops → liquidation risk
                if price_ratio < 1.0:
                    reasons.append(f"⚠ stIP trading below IP by {(1-price_ratio)*100:.1f}% - collateral losing value!")
                # If stIP depegs up, less concerning but still risky
                else:
                    reasons.append(f"⚠ stIP trading above IP by {(price_ratio-1)*100:.1f}% - monitoring for reversal")
        
        # 3. Correlation Analysis
        correlation = 0.95  # Default
        if correlation_data and correlation_data.get("success"):
            correlation = float(correlation_data["correlation"]["estimate"])
            
            # Low correlation increases liquidation risk
            if correlation < 0.85:
                if risk_level in [RiskLevel.SAFE, RiskLevel.WARNING]:
                    risk_level = RiskLevel.DANGER
                if action in [RebalanceAction.NONE, RebalanceAction.MONITOR]:
                    action = RebalanceAction.REDUCE_LOOP
                reasons.append(f"DANGER: Low correlation {correlation:.3f} - assets moving independently!")
            
            elif correlation < self.config.correlation_threshold:
                if risk_level == RiskLevel.SAFE:
                    risk_level = RiskLevel.WARNING
                reasons.append(f"WARNING: Correlation {correlation:.3f} below threshold")
        
        # 4. Debt Utilization Analysis
        utilization = float(risk["utilizationRate"]) / 100.0
        if utilization > self.config.max_debt_utilization:
            if risk_level in [RiskLevel.SAFE, RiskLevel.WARNING]:
                risk_level = RiskLevel.WARNING
            reasons.append(f"High debt utilization: {utilization:.1%}")
        
        # 5. Distance to Liquidation
        distance = float(risk["distanceToLiquidation"])
        if distance < 0.1:  # Very close to liquidation
            risk_level = RiskLevel.CRITICAL
            action = RebalanceAction.EMERGENCY_UNWIND
            reasons.append(f"CRITICAL: Only {distance:.2%} from liquidation")
        elif distance < 0.3:
            if risk_level == RiskLevel.SAFE:
                risk_level = RiskLevel.DANGER
            if action == RebalanceAction.NONE:
                action = RebalanceAction.REDUCE_LOOP
            reasons.append(f"DANGER: {distance:.2%} from liquidation")
        
        # 6. APY Profitability Analysis
        current_net_apy = self._calculate_net_apy(loops)
        next_loop_apy = self._calculate_net_apy(loops + 1)
        is_profitable = current_net_apy > 0
        
        # Check if adding a loop would be profitable
        strategy_max_loops = strategy_params["max_loops"]
        if (risk_level == RiskLevel.SAFE and 
            loops < strategy_max_loops and 
            next_loop_apy > current_net_apy and
            next_loop_apy > 0.01 and  # At least 1% net APY
            health_factor > target_hf + 0.3):  # Good safety margin
            
            action = RebalanceAction.ADD_LOOP
            reasons.append(f"Profitable to add loop: {next_loop_apy:.2%} net APY (current: {current_net_apy:.2%})")
        
        # Warn if position is unprofitable
        if not is_profitable and has_position:
            if risk_level == RiskLevel.SAFE:
                risk_level = RiskLevel.WARNING
            reasons.append(f"⚠ Position unprofitable: {current_net_apy:.2%} net APY")
        
        # 7. Gas Price Check
        gas_acceptable = True
        if gas_data and gas_data.get("success"):
            gas_gwei = float(gas_data["gasPrice"]["gwei"])
            gas_acceptable = gas_gwei < self.config.max_gas_price_gwei
            
            if not gas_acceptable:
                reasons.append(f"Gas too high: {gas_gwei:.1f} Gwei")
                # Don't execute rebalancing if gas is too high (unless critical)
                if action in [RebalanceAction.REDUCE_LOOP, RebalanceAction.ADD_LOOP]:
                    reasons.append("Delaying rebalance due to high gas")
                    action = RebalanceAction.MONITOR
        
        # Compile metrics
        metrics = {
            "health_factor": health_factor,
            "target_hf": target_hf,
            "min_hf": min_hf,
            "loops": loops,
            "max_loops": strategy_max_loops,
            "utilization": utilization,
            "distance_to_liquidation": distance,
            "correlation": correlation,
            "price_decoupling_risk": price_decoupling_risk,
            "current_net_apy": current_net_apy,
            "next_loop_apy": next_loop_apy,
            "total_collateral": unleash["totalCollateral"],
            "total_debt": unleash["totalDebt"],
            "available_borrows": unleash["availableBorrows"],
            "staking_apy": self.staking_apy,
            "supply_apy": self.supply_apy,
            "borrow_apy": self.borrow_apy
        }
        
        return RiskAssessment(
            risk_level=risk_level,
            recommended_action=action,
            health_factor=health_factor,
            distance_to_liquidation=distance,
            correlation=correlation,
            price_decoupling_risk=price_decoupling_risk,
            net_apy=current_net_apy,
            gas_acceptable=gas_acceptable,
            is_profitable=is_profitable,
            reasons=reasons,
            metrics=metrics
        )
    
    def _calculate_net_apy(self, loops: int) -> float:
        """
        Calculate net APY for a given number of loops
        
        Formula:
        - Staking APY applies to all staked stIP
        - Supply APY applies to stIP supplied as collateral
        - Borrow APY applies to borrowed IP
        
        With loops:
        - Initial capital: 1.0
        - After 1 loop with ~44% LTV: total staked ≈ 1.44
        - After 2 loops: ≈ 1.63
        - After 3 loops: ≈ 1.72
        
        Net APY = (Staking APY + Supply APY) * Leverage - Borrow APY * Debt Ratio
        """
        
        if loops == 0:
            # No leverage, just staking
            return self.staking_apy
        
        # Estimate leverage multiplier based on loops
        # Using conservative 44% LTV per loop
        ltv = 0.44
        leverage_multiplier = 1.0
        debt_ratio = 0.0
        
        for i in range(loops):
            borrowed = leverage_multiplier * ltv
            leverage_multiplier += borrowed
            debt_ratio += borrowed
        
        # Calculate earnings
        staking_earnings = self.staking_apy * leverage_multiplier
        supply_earnings = self.supply_apy * leverage_multiplier
        borrow_costs = self.borrow_apy * debt_ratio
        
        net_apy = staking_earnings + supply_earnings - borrow_costs
        
        return net_apy
    
    def _critical_assessment(self, reason: str) -> RiskAssessment:
        """Return a critical assessment when data is unavailable"""
        return RiskAssessment(
            risk_level=RiskLevel.CRITICAL,
            recommended_action=RebalanceAction.MONITOR,
            health_factor=0.0,
            distance_to_liquidation=0.0,
            correlation=0.0,
            price_decoupling_risk=0.0,
            net_apy=0.0,
            gas_acceptable=False,
            is_profitable=False,
            reasons=[reason],
            metrics={}
        )