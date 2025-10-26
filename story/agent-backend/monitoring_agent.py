import time
import logging
from typing import List, Dict, Any
from datetime import datetime
from config import AgentConfig
from hardhat_interface.executor import HardhatExecutor
from risk_analyzer import RiskAnalyzer, RiskLevel, RebalanceAction
from rebalancer import Rebalancer
from openai import OpenAI

logger = logging.getLogger(__name__)

class MonitoringAgent:
    """Autonomous agent that monitors positions and triggers rebalancing"""
    
    def __init__(self, config: AgentConfig, monitored_users: List[str]):
        self.config = config
        self.monitored_users = monitored_users
        
        # Initialize components
        self.executor = HardhatExecutor(config.hardhat_dir, config.network)
        self.analyzer = RiskAnalyzer(config)
        self.rebalancer = Rebalancer(config, self.executor)
        
        # Initialize OpenAI for summaries
        self.openai_client = OpenAI()
        
        # State tracking
        self.last_correlation_check = 0
        self.system_status = None
        self.alert_history = []
        
        logger.info(f"Monitoring Agent initialized")
        logger.info(f"Strategy: {config.risk_strategy.value}")
        logger.info(f"Monitoring {len(monitored_users)} users")
    
    def run(self):
        """Main monitoring loop"""
        
        logger.info("Starting monitoring loop...")
        
        # Initial system check
        self._check_system_status()
        
        iteration = 0
        while True:
            try:
                iteration += 1
                logger.info(f"\n{'='*60}")
                logger.info(f"Monitoring Iteration #{iteration} - {datetime.now()}")
                logger.info(f"{'='*60}\n")
                
                # Check correlation periodically
                correlation_data = None
                if time.time() - self.last_correlation_check > self.config.correlation_check_interval:
                    correlation_data = self._check_correlation()
                    self.last_correlation_check = time.time()
                
                # Get gas price
                gas_data = self.executor.get_gas_price()
                
                # Monitor each user
                for user_address in self.monitored_users:
                    self._monitor_user(user_address, correlation_data, gas_data)
                
                # Generate AI summary every 5 iterations
                if iteration % 5 == 0:
                    self._generate_ai_summary()
                
                # Wait before next check
                logger.info(f"\nSleeping for {self.config.check_interval_seconds} seconds...")
                time.sleep(self.config.check_interval_seconds)
                
            except KeyboardInterrupt:
                logger.info("\nShutting down monitoring agent...")
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}", exc_info=True)
                time.sleep(60)  # Wait 1 minute before retrying
    
    def _monitor_user(
        self,
        user_address: str,
        correlation_data: Dict[str, Any],
        gas_data: Dict[str, Any]
    ):
        """Monitor a single user's position"""
        
        logger.info(f"Checking position for {user_address}...")
        
        # Get position data
        position_data = self.executor.query_position(user_address)
        
        if not position_data.get("success"):
            logger.error(f"Failed to query position: {position_data.get('error')}")
            return
        
        # Assess risk
        assessment = self.analyzer.assess_position(
            position_data,
            correlation_data,
            gas_data
        )
        
        # Log assessment
        self._log_assessment(user_address, assessment)
        
        # Execute rebalancing if needed
        if assessment.recommended_action != RebalanceAction.NONE:
            result = self.rebalancer.execute_rebalance(user_address, assessment)
            self._log_rebalance_result(user_address, result)
            
            # Store alert
            self.alert_history.append({
                "timestamp": datetime.now().isoformat(),
                "user": user_address,
                "risk_level": assessment.risk_level.value,
                "action": assessment.recommended_action.value,
                "result": result,
                "reasons": assessment.reasons
            })
    
    def _check_system_status(self):
        """Check overall system status"""
        
        logger.info("Checking system status...")
        
        status = self.executor.check_system_status()
        
        if status.get("success"):
            self.system_status = status
            
            system = status["systemStatus"]
            logger.info(f"System operational: {system['operational']}")
            
            if system["warnings"]:
                for warning in system["warnings"]:
                    logger.warning(f"System warning: {warning}")
        else:
            logger.error("Failed to check system status")
    
    def _check_correlation(self) -> Dict[str, Any]:
        """Check stIP/IP correlation"""
        
        logger.info("Checking asset correlation...")
        
        correlation_data = self.executor.calculate_correlation()
        
        if correlation_data.get("success"):
            corr = float(correlation_data["correlation"]["estimate"])
            risk_level = correlation_data["risk"]["overallRiskLevel"]
            
            logger.info(f"Correlation: {corr:.4f} ({risk_level})")
            
            if corr < self.config.correlation_threshold:
                logger.warning(f"LOW CORRELATION ALERT: {corr:.4f}")
        
        return correlation_data
    
    def _log_assessment(self, user_address: str, assessment: RiskAssessment):
        """Log risk assessment details"""
        
        logger.info(f"\n--- Risk Assessment for {user_address} ---")
        logger.info(f"Risk Level: {assessment.risk_level.value.upper()}")
        logger.info(f"Recommended Action: {assessment.recommended_action.value}")
        logger.info(f"Health Factor: {assessment.health_factor:.3f}")
        logger.info(f"Distance to Liquidation: {assessment.distance_to_liquidation:.2%}")
        logger.info(f"Correlation: {assessment.correlation:.4f}")
        logger.info(f"Gas Acceptable: {assessment.gas_acceptable}")
        
        if assessment.reasons:
            logger.info("Reasons:")
            for reason in assessment.reasons:
                logger.info(f"  - {reason}")
        
        logger.info("---\n")
    
    def _log_rebalance_result(self, user_address: str, result: Dict[str, Any]):
        """Log rebalancing execution result"""
        
        action = result.get("action", "unknown")
        success = result.get("success", False)
        message = result.get("message", "No message")
        
        if success:
            logger.info(f"✓ Rebalance successful for {user_address}")
            logger.info(f"  Action: {action}")
            logger.info(f"  Message: {message}")
            
            if "tx_hash" in result:
                logger.info(f"  TX: {result['tx_hash']}")
            if "gas_used" in result:
                logger.info(f"  Gas: {result['gas_used']}")
        else:
            logger.error(f"✗ Rebalance failed for {user_address}")
            logger.error(f"  Action: {action}")
            logger.error(f"  Message: {message}")
    
    def _generate_ai_summary(self):
        """Generate AI summary of recent activity"""
        
        if not self.alert_history:
            return
        
        logger.info("\n=== Generating AI Summary ===\n")
        
        # Get recent alerts (last 10)
        recent_alerts = self.alert_history[-10:]
        
        # Prepare context
        context = f"""
You are monitoring a DeFi leverage protocol. Here are the recent alerts and actions:

Configuration:
- Strategy: {self.config.risk_strategy.value}
- Target Health Factor: {self.config.target_health_factor}
- Min Health Factor: {self.config.min_health_factor}

Recent Activity:
"""
        
        for alert in recent_alerts:
            context += f"\n[{alert['timestamp']}] User: {alert['user'][:8]}..."
            context += f"\n  Risk: {alert['risk_level']}, Action: {alert['action']}"
            context += f"\n  Reasons: {', '.join(alert['reasons'])}"
            context += f"\n  Result: {alert['result'].get('message', 'N/A')}\n"
        
        # Get AI summary
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are a DeFi risk analyst. Provide concise summaries of position health and actions taken."},
                    {"role": "user", "content": f"{context}\n\nProvide a brief summary of the current situation and any recommendations."}
                ],
                max_tokens=300
            )
            
            summary = response.choices[0].message.content
            logger.info(f"AI Summary:\n{summary}\n")
            
        except Exception as e:
            logger.error(f"Failed to generate AI summary: {e}")