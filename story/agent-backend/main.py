import os
import sys
import logging
from config import AgentConfig
from monitoring_agent import MonitoringAgent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('agent.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

def main():
    """Main entry point for the autonomous agent"""
    
    logger.info("=" * 60)
    logger.info("IP Rewards Autostaker - Autonomous Monitoring Agent")
    logger.info("=" * 60)
    
    # Load configuration
    config = AgentConfig.from_env()
    
    logger.info(f"\nConfiguration:")
    logger.info(f"  Strategy: {config.risk_strategy.value}")
    logger.info(f"  Check Interval: {config.check_interval_seconds}s")
    logger.info(f"  Target Health Factor: {config.target_health_factor}")
    logger.info(f"  Min Health Factor: {config.min_health_factor}")
    logger.info(f"  Network: {config.network}")
    
    # Get monitored users from environment
    monitored_users_str = os.getenv("MONITORED_USERS", "")
    if not monitored_users_str:
        logger.error("No users to monitor! Set MONITORED_USERS environment variable")
        logger.error("Example: export MONITORED_USERS=0xAddress1,0xAddress2")
        sys.exit(1)
    
    monitored_users = [addr.strip() for addr in monitored_users_str.split(",")]
    logger.info(f"\nMonitoring {len(monitored_users)} users:")
    for user in monitored_users:
        logger.info(f"  - {user}")
    
    # Create and run agent
    agent = MonitoringAgent(config, monitored_users)
    
    logger.info("\n" + "=" * 60)
    logger.info("Starting monitoring loop...")
    logger.info("Press Ctrl+C to stop")
    logger.info("=" * 60 + "\n")
    
    agent.run()

if __name__ == "__main__":
    main()