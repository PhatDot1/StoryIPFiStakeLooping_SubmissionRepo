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
    REDUCE_LOOP = "reduce_loop"
    EMERGENCY_UNWIND = "emergency_unwind"

@dataclass
class RiskAssessment:
    risk_level: RiskLevel
    recommended_action: RebalanceAction
    health_factor: float
    distance_to_liquidation: float
    correlation: float
    gas_acceptable: bool
    reasons: list[str]
    metrics: Dict[str, Any]

class RiskAnalyzer:
    """Analyzes position risk and determines rebalancing needs"""
    
    def __init__(self, config):
        self.config = config
        
    def assess_position(
        self,
        position_data: Dict[str, Any],
        correlation_data: Optional[Dict[str, Any]] = None,
        gas_data: Optional[Dict[str, Any]] = None
    ) -> RiskAssessment:
        """
        Comprehensive risk assessment of a position
        
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
            return RiskAssessment(
                risk_level=RiskLevel.SAFE,
                recommended_action=RebalanceAction.NONE,
                health_factor=0.0,
                distance_to_liquidation=999.0,
                correlation=1.0,
                gas_acceptable=True,
                reasons=["No active position"],
                metrics={}
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
        
        # 2. Debt Utilization Analysis
        utilization = float(risk["utilizationRate"]) / 100.0
        if utilization > self.config.max_debt_utilization:
            if risk_level in [RiskLevel.SAFE, RiskLevel.WARNING]:
                risk_level = RiskLevel.WARNING
            reasons.append(f"High debt utilization: {utilization:.1%}")
        
        # 3. Distance to Liquidation
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
        
        # 4. Correlation Analysis
        correlation = 0.95  # Default
        if correlation_data and correlation_data.get("success"):
            correlation = float(correlation_data["correlation"]["estimate"])
            
            if correlation < self.config.correlation_threshold:
                if risk_level == RiskLevel.SAFE:
                    risk_level = RiskLevel.WARNING
                reasons.append(f"Low correlation: {correlation:.3f}")
        
        # 5. Gas Price Check
        gas_acceptable = True
        if gas_data and gas_data.get("success"):
            gas_gwei = float(gas_data["gasPrice"]["gwei"])
            gas_acceptable = gas_gwei < self.config.max_gas_price_gwei
            
            if not gas_acceptable:
                reasons.append(f"Gas too high: {gas_gwei:.1f} Gwei")
                # Don't execute rebalancing if gas is too high
                if action in [RebalanceAction.REDUCE_LOOP, RebalanceAction.EMERGENCY_UNWIND]:
                    reasons.append("Delaying rebalance due to high gas")
                    action = RebalanceAction.MONITOR
        
        # Compile metrics
        metrics = {
            "health_factor": health_factor,
            "target_hf": target_hf,
            "min_hf": min_hf,
            "loops": loops,
            "utilization": utilization,
            "distance_to_liquidation": distance,
            "correlation": correlation,
            "total_collateral": unleash["totalCollateral"],
            "total_debt": unleash["totalDebt"],
            "available_borrows": unleash["availableBorrows"]
        }
        
        return RiskAssessment(
            risk_level=risk_level,
            recommended_action=action,
            health_factor=health_factor,
            distance_to_liquidation=distance,
            correlation=correlation,
            gas_acceptable=gas_acceptable,
            reasons=reasons,
            metrics=metrics
        )
    
    def _critical_assessment(self, reason: str) -> RiskAssessment:
        """Return a critical assessment when data is unavailable"""
        return RiskAssessment(
            risk_level=RiskLevel.CRITICAL,
            recommended_action=RebalanceAction.MONITOR,
            health_factor=0.0,
            distance_to_liquidation=0.0,
            correlation=0.0,
            gas_acceptable=False,
            reasons=[reason],
            metrics={}
        )