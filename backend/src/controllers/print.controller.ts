import { Router, Request, Response } from 'express';
import * as PrintQueue from '../models/PrintQueue';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

// ============ Print Agents ============

// Register/update a print agent
router.post('/agents/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId, name, printers } = req.body;

    if (!agentId || !name) {
      res.status(400).json({ error: 'agentId and name are required' });
      return;
    }

    const agent = await PrintQueue.registerAgent(agentId, name, printers || []);
    res.json({ agent, message: 'Agent registered successfully' });
  } catch (error: any) {
    console.error('Error registering agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Agent heartbeat - keeps agent online status updated
router.post('/agents/:agentId/heartbeat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const { printers } = req.body;

    const agent = await PrintQueue.agentHeartbeat(agentId, printers);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Get pending jobs for this agent
    const pendingJobs = await PrintQueue.getPendingJobs(agentId, 10);

    res.json({
      agent,
      pendingJobs,
      message: 'Heartbeat received'
    });
  } catch (error: any) {
    console.error('Error processing heartbeat:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all agents (admin only)
router.get('/agents', requireAuth, requireRole([UserRole.ADMIN]), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const agents = await PrintQueue.getAllAgents();
    res.json({ agents });
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get online agents
router.get('/agents/online', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const agents = await PrintQueue.getOnlineAgents();
    res.json({ agents });
  } catch (error: any) {
    console.error('Error fetching online agents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete an agent (admin only)
router.delete('/agents/:agentId', requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const deleted = await PrintQueue.deleteAgent(agentId);

    if (!deleted) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json({ message: 'Agent deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Printer Configs ============

// Get all printer configurations
router.get('/configs', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const configs = await PrintQueue.getPrinterConfigs();
    res.json({ configs });
  } catch (error: any) {
    console.error('Error fetching printer configs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a printer configuration
router.put('/configs/:documentType', requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentType } = req.params;
    const config = await PrintQueue.updatePrinterConfig(
      documentType as PrintQueue.DocumentType,
      req.body
    );

    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    res.json({ config, message: 'Configuration updated successfully' });
  } catch (error: any) {
    console.error('Error updating printer config:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Print Jobs ============

// Create a new print job
router.post('/jobs', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await PrintQueue.createPrintJob(req.body, req.user?.userId);
    res.status(201).json({ job, message: 'Print job created successfully' });
  } catch (error: any) {
    console.error('Error creating print job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get jobs (with filtering)
router.get('/jobs', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, documentType, limit, offset } = req.query;

    const result = await PrintQueue.getJobs({
      status: status as PrintQueue.PrintJobStatus,
      documentType: documentType as PrintQueue.DocumentType,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching print jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific job
router.get('/jobs/:jobId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const job = await PrintQueue.getJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ job });
  } catch (error: any) {
    console.error('Error fetching print job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel a job
router.post('/jobs/:jobId/cancel', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const job = await PrintQueue.cancelJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found or already processed' });
      return;
    }

    res.json({ job, message: 'Job cancelled successfully' });
  } catch (error: any) {
    console.error('Error cancelling print job:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Agent-specific endpoints (no auth required - agent uses agentId) ============

// Claim a job (for print agents)
router.post('/jobs/:jobId/claim', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const { agentId } = req.body;

    if (!agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }

    const job = await PrintQueue.claimJob(jobId, agentId);

    if (!job) {
      res.status(404).json({ error: 'Job not found or already claimed' });
      return;
    }

    res.json({ job });
  } catch (error: any) {
    console.error('Error claiming print job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete a job (for print agents)
router.post('/jobs/:jobId/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const job = await PrintQueue.completeJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ job, message: 'Job completed successfully' });
  } catch (error: any) {
    console.error('Error completing print job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fail a job (for print agents)
router.post('/jobs/:jobId/fail', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const { errorMessage } = req.body;

    const job = await PrintQueue.failJob(jobId, errorMessage || 'Unknown error');

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ job, message: job.status === 'pending' ? 'Job queued for retry' : 'Job failed' });
  } catch (error: any) {
    console.error('Error failing print job:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Statistics ============

// Get queue statistics
router.get('/stats', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await PrintQueue.getQueueStats();
    const agents = await PrintQueue.getOnlineAgents();

    res.json({
      stats,
      onlineAgents: agents.length,
      agents: agents.map(a => ({ name: a.name, agentId: a.agentId }))
    });
  } catch (error: any) {
    console.error('Error fetching print stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Maintenance (admin only) ============

// Cleanup old jobs
router.post('/maintenance/cleanup', requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { daysOld } = req.body;
    const deleted = await PrintQueue.cleanupOldJobs(daysOld || 30);

    res.json({ deletedCount: deleted, message: `Deleted ${deleted} old jobs` });
  } catch (error: any) {
    console.error('Error cleaning up jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark stale agents as offline
router.post('/maintenance/check-agents', requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { timeoutSeconds } = req.body;
    const marked = await PrintQueue.markStaleAgentsOffline(timeoutSeconds || 60);

    res.json({ markedOffline: marked, message: `Marked ${marked} agents as offline` });
  } catch (error: any) {
    console.error('Error checking agents:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
