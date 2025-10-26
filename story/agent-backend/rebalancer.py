import logging
from typing import Dict, Any, Optional
from risk_analyzer import RebalanceAction, RiskAssessment
from hardhat_interface.executor import HardhatExecutor

logger = logging.getLogger(__name__)

class Rebalancer:
    """Executes rebalancing actions based on risk assessments"""
    
    def __init__(self, config, executor: HardhatExecutor):
        self.config = config
        self.executor = executor
        self.last_rebalance_time = {}  # Track last rebalance per user
        
    def execute_rebalance(
        self,
        user_address: str,
        assessment: RiskAssessment
    ) -> Dict[str, Any]:
        """
        Execute rebalancing action if needed
        
        Returns execution result
        """
        
        action = assessment.recommended_action
        
        if action == RebalanceAction.NONE:
            logger.info(f"No rebalancing needed for {user_address}")
            return {"action": "none", "success": True, "message": "Position is healthy"}
        
        if action == RebalanceAction.MONITOR:
            logger.warning(f"Monitoring {user_address}: {', '.join(assessment.reasons)}")
            return {
                "action": "monitor",
                "success": True,
                "message": "Position requires monitoring",
                "reasons": assessment.reasons
            }
        
        # Check if gas is acceptable for execution
        if not assessment.gas_acceptable and action != RebalanceAction.EMERGENCY_UNWIND:
            logger.warning(f"Delaying rebalance for {user_address} due to high gas")
            return {
                "action": "delayed",
                "success": False,
                "message": "Rebalance delayed due to high gas prices"
            }
        
        # Execute appropriate action
        if action == RebalanceAction.REDUCE_LOOP:
            return self._reduce_loop(user_address, assessment)
        
        elif action == RebalanceAction.EMERGENCY_UNWIND:
            return self._emergency_unwind(user_address, assessment)
        
        return {"action": "unknown", "success": False, "message": "Unknown action"}
    
    def _reduce_loop(self, user_address: str, assessment: RiskAssessment) -> Dict[str, Any]:
        """Reduce leverage by unwinding one loop"""
        
        logger.warning(f"Reducing loop for {user_address}")
        logger.warning(f"Reasons: {', '.join(assessment.reasons)}")
        
        loops = assessment.metrics.get("loops", 0)
        if loops == 0:
            logger.error("Cannot reduce loop - no loops active")
            return {"action": "reduce_loop", "success": False, "message": "No loops to reduce"}
        
        # Execute unwind of 1 loop
        logger.info(f"Unwinding 1 loop (of {loops}) for {user_address}")
        
        result = self.executor.execute_rebalance(
            action="remove_loop",
            user_address=user_address,
            loops=1
        )
        
        if result.get("success"):
            logger.info(f"Successfully reduced loop for {user_address}")
            logger.info(f"New health factor: {result['updatedPosition']['healthFactor']}")
            
            return {
                "action": "reduce_loop",
                "success": True,
                "message": f"Reduced 1 loop, {result['updatedPosition']['remainingLoops']} remaining",
                "tx_hash": result.get("txHash"),
                "new_health_factor": result['updatedPosition']['healthFactor'],
                "gas_used": result.get("gasUsed")
            }
        else:
            logger.error(f"Failed to reduce loop: {result.get('error')}")
            return {
                "action": "reduce_loop",
                "success": False,
                "message": f"Failed: {result.get('error')}",
                "error": result.get("error")
            }
    
    def _emergency_unwind(self, user_address: str, assessment: RiskAssessment) -> Dict[str, Any]:
        """Emergency full unwind of position"""
        
        logger.critical(f"EMERGENCY UNWIND for {user_address}")
        logger.critical(f"Reasons: {', '.join(assessment.reasons)}")
        
        # Execute full unwind (loops=0 means unwind all)
        logger.info(f"Executing emergency unwind for {user_address}")
        
        result = self.executor.execute_rebalance(
            action="emergency_unwind",
            user_address=user_address
        )
        
        if result.get("success"):
            logger.info(f"Emergency unwind successful for {user_address}")
            
            return {
                "action": "emergency_unwind",
                "success": True,
                "message": "Position fully unwound",
                "tx_hash": result.get("txHash"),
                "gas_used": result.get("gasUsed"),
                "previous_health_factor": assessment.health_factor
            }
        else:
            logger.error(f"Emergency unwind failed: {result.get('error')}")
            return {
                "action": "emergency_unwind",
                "success": False,
                "message": f"CRITICAL: Unwind failed - {result.get('error')}",
                "error": result.get("error")
            }