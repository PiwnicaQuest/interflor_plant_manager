import { query } from './database';
import * as crypto from 'crypto';

// Generate UUID v4
const uuidv4 = (): string => {
  return crypto.randomUUID();
};

// Document types that can be printed
export type DocumentType =
  | 'barcode_labels'
  | 'orders'
  | 'invoices'
  | 'receipts'
  | 'inventory_reports'
  | 'delivery_notes';

export type PrintJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ContentType = 'html' | 'pdf' | 'raw';
export type Orientation = 'portrait' | 'landscape';
export type ColorMode = 'color' | 'grayscale';

export interface PrintAgent {
  id: number;
  agentId: string;
  name: string;
  lastSeen: Date;
  isOnline: boolean;
  availablePrinters: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PrinterConfig {
  id: number;
  documentType: DocumentType;
  agentId: string | null;
  printerName: string | null;
  paperSize: string;
  copies: number;
  orientation: Orientation;
  colorMode: ColorMode;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrintJob {
  id: number;
  jobId: string;
  documentType: DocumentType;
  status: PrintJobStatus;
  priority: number;
  contentType: ContentType;
  content: string | null;
  contentUrl: string | null;
  agentId: string | null;
  printerName: string | null;
  paperSize: string | null;
  copies: number;
  orientation: Orientation | null;
  colorMode: ColorMode | null;
  title: string | null;
  sourceType: string | null;
  sourceId: number | null;
  createdBy: number | null;
  createdAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
}

export interface CreatePrintJobRequest {
  documentType: DocumentType;
  contentType: ContentType;
  content?: string;
  contentUrl?: string;
  title?: string;
  sourceType?: string;
  sourceId?: number;
  priority?: number;
  copies?: number;
  // Override config settings
  agentId?: string;
  printerName?: string;
  paperSize?: string;
  orientation?: Orientation;
  colorMode?: ColorMode;
}

// ============ Print Agents ============

export async function registerAgent(agentId: string, name: string, printers: string[]): Promise<PrintAgent> {
  const result = await query<PrintAgent>(
    `INSERT INTO print_agents (agent_id, name, available_printers, is_online, last_seen)
     VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
     ON CONFLICT (agent_id) DO UPDATE SET
       name = EXCLUDED.name,
       available_printers = EXCLUDED.available_printers,
       is_online = true,
       last_seen = CURRENT_TIMESTAMP
     RETURNING *`,
    [agentId, name, JSON.stringify(printers)]
  );
  return result.rows[0];
}

export async function agentHeartbeat(agentId: string, printers?: string[]): Promise<PrintAgent | null> {
  const updatePrinters = printers ? `, available_printers = $2` : '';
  const params = printers ? [agentId, JSON.stringify(printers)] : [agentId];

  const result = await query<PrintAgent>(
    `UPDATE print_agents
     SET is_online = true, last_seen = CURRENT_TIMESTAMP${updatePrinters}
     WHERE agent_id = $1
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function markAgentOffline(agentId: string): Promise<void> {
  await query(
    `UPDATE print_agents SET is_online = false WHERE agent_id = $1`,
    [agentId]
  );
}

export async function markStaleAgentsOffline(timeoutSeconds: number = 60): Promise<number> {
  const result = await query(
    `UPDATE print_agents
     SET is_online = false
     WHERE is_online = true
       AND last_seen < NOW() - INTERVAL '${timeoutSeconds} seconds'`
  );
  return result.rowCount || 0;
}

export async function getOnlineAgents(): Promise<PrintAgent[]> {
  const result = await query<PrintAgent>(
    `SELECT * FROM print_agents WHERE is_online = true ORDER BY name`
  );
  return result.rows;
}

export async function getAllAgents(): Promise<PrintAgent[]> {
  const result = await query<PrintAgent>(
    `SELECT * FROM print_agents ORDER BY is_online DESC, name`
  );
  return result.rows;
}

export async function deleteAgent(agentId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM print_agents WHERE agent_id = $1`,
    [agentId]
  );
  return (result.rowCount || 0) > 0;
}

// ============ Printer Configs ============

export async function getPrinterConfigs(): Promise<PrinterConfig[]> {
  const result = await query<PrinterConfig>(
    `SELECT pc.*, pa.name as agent_name, pa.is_online as agent_online
     FROM printer_configs pc
     LEFT JOIN print_agents pa ON pc.agent_id = pa.agent_id
     ORDER BY pc.document_type`
  );
  return result.rows;
}

export async function getPrinterConfig(documentType: DocumentType): Promise<PrinterConfig | null> {
  const result = await query<PrinterConfig>(
    `SELECT * FROM printer_configs WHERE document_type = $1`,
    [documentType]
  );
  return result.rows[0] || null;
}

export async function updatePrinterConfig(
  documentType: DocumentType,
  config: Partial<PrinterConfig>
): Promise<PrinterConfig> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (config.agentId !== undefined) {
    fields.push(`agent_id = $${paramIndex++}`);
    values.push(config.agentId);
  }
  if (config.printerName !== undefined) {
    fields.push(`printer_name = $${paramIndex++}`);
    values.push(config.printerName);
  }
  if (config.paperSize !== undefined) {
    fields.push(`paper_size = $${paramIndex++}`);
    values.push(config.paperSize);
  }
  if (config.copies !== undefined) {
    fields.push(`copies = $${paramIndex++}`);
    values.push(config.copies);
  }
  if (config.orientation !== undefined) {
    fields.push(`orientation = $${paramIndex++}`);
    values.push(config.orientation);
  }
  if (config.colorMode !== undefined) {
    fields.push(`color_mode = $${paramIndex++}`);
    values.push(config.colorMode);
  }
  if (config.isActive !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(config.isActive);
  }

  values.push(documentType);

  const result = await query<PrinterConfig>(
    `UPDATE printer_configs SET ${fields.join(', ')} WHERE document_type = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0];
}

// ============ Print Jobs ============

export async function createPrintJob(
  request: CreatePrintJobRequest,
  userId?: number
): Promise<PrintJob> {
  // Get config for this document type to fill in defaults
  const config = await getPrinterConfig(request.documentType);

  const jobId = uuidv4();
  const result = await query<PrintJob>(
    `INSERT INTO print_jobs (
      job_id, document_type, content_type, content, content_url,
      title, source_type, source_id, priority, copies,
      agent_id, printer_name, paper_size, orientation, color_mode,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *`,
    [
      jobId,
      request.documentType,
      request.contentType,
      request.content || null,
      request.contentUrl || null,
      request.title || null,
      request.sourceType || null,
      request.sourceId || null,
      request.priority || 5,
      request.copies || config?.copies || 1,
      request.agentId || config?.agentId || null,
      request.printerName || config?.printerName || null,
      request.paperSize || config?.paperSize || 'A4',
      request.orientation || config?.orientation || 'portrait',
      request.colorMode || config?.colorMode || 'color',
      userId || null
    ]
  );
  return result.rows[0];
}

export async function getPendingJobs(agentId?: string, limit: number = 10): Promise<PrintJob[]> {
  let whereClause = `status = 'pending'`;
  const params: any[] = [limit];

  if (agentId) {
    whereClause += ` AND (agent_id = $2 OR agent_id IS NULL)`;
    params.push(agentId);
  }

  const result = await query<PrintJob>(
    `SELECT * FROM print_jobs
     WHERE ${whereClause}
     ORDER BY priority ASC, created_at ASC
     LIMIT $1`,
    params
  );
  return result.rows;
}

export async function claimJob(jobId: string, agentId: string): Promise<PrintJob | null> {
  const result = await query<PrintJob>(
    `UPDATE print_jobs
     SET status = 'processing', agent_id = $2, processed_at = CURRENT_TIMESTAMP
     WHERE job_id = $1 AND status = 'pending'
     RETURNING *`,
    [jobId, agentId]
  );
  return result.rows[0] || null;
}

export async function completeJob(jobId: string): Promise<PrintJob | null> {
  const result = await query<PrintJob>(
    `UPDATE print_jobs
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP
     WHERE job_id = $1
     RETURNING *`,
    [jobId]
  );
  return result.rows[0] || null;
}

export async function failJob(jobId: string, errorMessage: string): Promise<PrintJob | null> {
  // Check if we should retry
  const job = await query<PrintJob>(
    `SELECT * FROM print_jobs WHERE job_id = $1`,
    [jobId]
  );

  if (!job.rows[0]) return null;

  const currentJob = job.rows[0];
  const newRetryCount = currentJob.retryCount + 1;

  if (newRetryCount < currentJob.maxRetries) {
    // Reset to pending for retry
    const result = await query<PrintJob>(
      `UPDATE print_jobs
       SET status = 'pending', retry_count = $2, error_message = $3, processed_at = NULL
       WHERE job_id = $1
       RETURNING *`,
      [jobId, newRetryCount, errorMessage]
    );
    return result.rows[0];
  } else {
    // Max retries reached, mark as failed
    const result = await query<PrintJob>(
      `UPDATE print_jobs
       SET status = 'failed', retry_count = $2, error_message = $3, completed_at = CURRENT_TIMESTAMP
       WHERE job_id = $1
       RETURNING *`,
      [jobId, newRetryCount, errorMessage]
    );
    return result.rows[0];
  }
}

export async function cancelJob(jobId: string): Promise<PrintJob | null> {
  const result = await query<PrintJob>(
    `UPDATE print_jobs
     SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
     WHERE job_id = $1 AND status IN ('pending', 'processing')
     RETURNING *`,
    [jobId]
  );
  return result.rows[0] || null;
}

export async function getJob(jobId: string): Promise<PrintJob | null> {
  const result = await query<PrintJob>(
    `SELECT * FROM print_jobs WHERE job_id = $1`,
    [jobId]
  );
  return result.rows[0] || null;
}

export async function getJobs(options: {
  status?: PrintJobStatus;
  documentType?: DocumentType;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: PrintJob[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (options.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(options.status);
  }
  if (options.documentType) {
    conditions.push(`document_type = $${paramIndex++}`);
    params.push(options.documentType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM print_jobs ${whereClause}`,
    params
  );

  const limit = options.limit || 50;
  const offset = options.offset || 0;
  params.push(limit, offset);

  const result = await query<PrintJob>(
    `SELECT * FROM print_jobs ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return {
    jobs: result.rows,
    total: parseInt(countResult.rows[0].count)
  };
}

export async function cleanupOldJobs(daysOld: number = 30): Promise<number> {
  const result = await query(
    `DELETE FROM print_jobs
     WHERE status IN ('completed', 'failed', 'cancelled')
       AND created_at < NOW() - INTERVAL '${daysOld} days'`
  );
  return result.rowCount || 0;
}

// ============ Statistics ============

export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  todayCompleted: number;
}> {
  const result = await query<any>(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'processing') as processing,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) as today_completed
    FROM print_jobs
  `);

  const row = result.rows[0];
  return {
    pending: parseInt(row.pending) || 0,
    processing: parseInt(row.processing) || 0,
    completed: parseInt(row.completed) || 0,
    failed: parseInt(row.failed) || 0,
    todayCompleted: parseInt(row.todayCompleted) || 0
  };
}

export default {
  // Agents
  registerAgent,
  agentHeartbeat,
  markAgentOffline,
  markStaleAgentsOffline,
  getOnlineAgents,
  getAllAgents,
  deleteAgent,

  // Configs
  getPrinterConfigs,
  getPrinterConfig,
  updatePrinterConfig,

  // Jobs
  createPrintJob,
  getPendingJobs,
  claimJob,
  completeJob,
  failJob,
  cancelJob,
  getJob,
  getJobs,
  cleanupOldJobs,

  // Stats
  getQueueStats
};
