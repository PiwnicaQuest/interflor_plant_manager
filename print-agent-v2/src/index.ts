/**
 * PlantManager Print Agent v2 - Entry Point
 */

import { PrintAgent } from './printAgent';

// Create and start agent
const agent = new PrintAgent();

// Handle graceful shutdown
process.on('SIGINT', () => {
  agent.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  agent.stop();
  process.exit(0);
});

// Start the agent
agent.start().catch(error => {
  console.error('Failed to start agent:', error);
  process.exit(1);
});
