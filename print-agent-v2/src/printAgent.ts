/**
 * PlantManager Print Agent v2
 *
 * Main agent class that coordinates printing operations
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import dotenv from 'dotenv';

import { PrinterManager } from './printerManager';
import { createPrinter } from './documentPrinters';
import {
  PrintJob,
  PrinterInfo,
  PrinterCategory,
  DocumentType,
  DOCUMENT_PRINTER_CATEGORY,
} from './types';

dotenv.config();

// Configuration
interface AgentConfig {
  serverUrl: string;
  agentId: string;
  agentName: string;
  pollInterval: number;
  heartbeatInterval: number;
  tempDir: string;
}

// Persisted config file
const CONFIG_FILE = path.join(__dirname, '..', 'agent-config.json');

export class PrintAgent {
  private config: AgentConfig;
  private api: AxiosInstance;
  private printerManager: PrinterManager;
  private isRunning: boolean = false;
  private printerAssignments: Map<DocumentType, string> = new Map();

  constructor() {
    this.config = this.loadConfig();
    
    this.api = axios.create({
      baseURL: this.config.serverUrl + '/print',
      timeout: 30000,
    });

    this.printerManager = new PrinterManager();
    this.printBanner();
  }

  private loadConfig(): AgentConfig {
    const config: AgentConfig = {
      serverUrl: process.env.SERVER_URL || 'http://localhost:4000',
      agentId: process.env.AGENT_ID || '',
      agentName: process.env.AGENT_NAME || os.hostname(),
      pollInterval: parseInt(process.env.POLL_INTERVAL || '5000'),
      heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'),
      tempDir: process.env.TEMP_DIR || path.join(os.tmpdir(), 'print-agent-v2'),
    };

    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        if (saved.agentId) config.agentId = saved.agentId;
      } catch (e) {
        console.error('Error loading saved config:', e);
      }
    }

    if (!config.agentId) {
      config.agentId = 'agent-' + uuidv4().substring(0, 8);
    }

    if (!fs.existsSync(config.tempDir)) {
      fs.mkdirSync(config.tempDir, { recursive: true });
    }

    return config;
  }

  private saveConfig(): void {
    const configData = {
      agentId: this.config.agentId,
      printerAssignments: Object.fromEntries(this.printerAssignments),
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
  }

  private printBanner(): void {
    console.log('\n' + '='.repeat(60));
    console.log('  PlantManager Print Agent v2.0');
    console.log('  Intelligent Multi-Printer Support');
    console.log('='.repeat(60));
    console.log('  Agent ID:      ' + this.config.agentId);
    console.log('  Agent Name:    ' + this.config.agentName);
    console.log('  Server URL:    ' + this.config.serverUrl);
    console.log('  Poll Interval: ' + this.config.pollInterval + 'ms');
    console.log('='.repeat(60) + '\n');
  }

  async start(): Promise<void> {
    this.isRunning = true;
    await this.printerManager.detectPrinters();
    this.autoAssignPrinters();
    this.saveConfig();
    await this.register();
    this.startHeartbeat();
    this.startPolling();
    console.log('\n[PrintAgent] Agent started. Press Ctrl+C to stop.\n');
  }

  stop(): void {
    this.isRunning = false;
    console.log('\n[PrintAgent] Stopping...');
  }

  private autoAssignPrinters(): void {
    console.log('\n[PrintAgent] Auto-assigning printers to document types:\n');

    const documentTypes: DocumentType[] = [
      'barcode_labels', 'receipts', 'orders', 'invoices', 
      'inventory_reports', 'delivery_notes',
    ];

    for (const docType of documentTypes) {
      const requiredCategory = DOCUMENT_PRINTER_CATEGORY[docType];
      const printer = this.printerManager.getDefaultPrinterForCategory(requiredCategory);

      if (printer) {
        this.printerAssignments.set(docType, printer.name);
        console.log('  ' + docType.padEnd(20) + ' -> ' + printer.name + ' (' + printer.category + ')');
      } else {
        const defaultPrinter = this.printerManager.getDefaultPrinter();
        if (defaultPrinter) {
          this.printerAssignments.set(docType, defaultPrinter.name);
          console.log('  ' + docType.padEnd(20) + ' -> ' + defaultPrinter.name + ' (fallback)');
        } else {
          console.log('  ' + docType.padEnd(20) + ' -> [NO PRINTER]');
        }
      }
    }
    console.log('');
  }

  setPrinterForDocumentType(documentType: DocumentType, printerName: string): void {
    this.printerAssignments.set(documentType, printerName);
    this.saveConfig();
    console.log('[PrintAgent] Set ' + documentType + ' -> ' + printerName);
  }

  private async register(): Promise<void> {
    try {
      const printers = this.printerManager.getPrinters();
      const response = await this.api.post('/agents/register', {
        agentId: this.config.agentId,
        name: this.config.agentName,
        printers: printers.map(p => p.name),
        printerDetails: printers.map(p => ({
          name: p.name, category: p.category, isDefault: p.isDefault,
        })),
      });
      console.log('[PrintAgent] Registered with server:', response.data.message);
    } catch (error: any) {
      console.error('[PrintAgent] Registration error:', error.message);
      console.log('[PrintAgent] Will retry on next heartbeat...');
    }
  }

  private startHeartbeat(): void {
    const heartbeat = async () => {
      if (!this.isRunning) return;
      try {
        const printers = this.printerManager.getPrinters();
        const response = await this.api.post('/agents/' + this.config.agentId + '/heartbeat', {
          printers: printers.map(p => p.name),
        });
        const pendingCount = response.data.pendingJobs?.length || 0;
        if (pendingCount > 0) {
          console.log('[Heartbeat] ' + pendingCount + ' pending job(s)');
        }
      } catch (error: any) {
        console.error('[Heartbeat] Error:', error.message);
        await this.register();
      }
      setTimeout(heartbeat, this.config.heartbeatInterval);
    };
    heartbeat();
  }

  private startPolling(): void {
    const poll = async () => {
      if (!this.isRunning) return;
      try {
        const printers = this.printerManager.getPrinters();
        const response = await this.api.post('/agents/' + this.config.agentId + '/heartbeat', {
          printers: printers.map(p => p.name),
        });
        const pendingJobs: PrintJob[] = response.data.pendingJobs || [];
        for (const job of pendingJobs) {
          await this.processJob(job);
        }
      } catch (error: any) {
        // Suppress connection errors
      }
      setTimeout(poll, this.config.pollInterval);
    };
    poll();
  }

  private async processJob(job: PrintJob): Promise<void> {
    console.log('\n' + '-'.repeat(50));
    console.log('[Job] Processing: ' + job.jobId);
    console.log('  Document Type: ' + job.documentType);
    console.log('  Title: ' + (job.title || 'Untitled'));
    console.log('  Paper Size: ' + (job.paperSize || 'Default'));
    console.log('  Copies: ' + (job.copies || 1));

    try {
      const claimResponse = await this.api.post('/jobs/' + job.jobId + '/claim', {
        agentId: this.config.agentId,
      });

      if (!claimResponse.data.job) {
        console.log('  Status: Already claimed by another agent');
        return;
      }

      const printerName = this.getPrinterForJob(job);
      const printer = this.printerManager.getPrinter(printerName);
      
      if (!printer) {
        throw new Error('No printer found: ' + printerName);
      }

      console.log('  Printer: ' + printer.name + ' (' + printer.category + ')');

      let content = job.content;
      if (!content && job.contentUrl) {
        const contentResponse = await axios.get(job.contentUrl);
        content = contentResponse.data;
      }

      if (!content) {
        throw new Error('No content to print');
      }

      job.content = content;
      const documentPrinter = createPrinter(printer.category, printer.name);
      await documentPrinter.print(job);

      await this.api.post('/jobs/' + job.jobId + '/complete');
      console.log('  Status: COMPLETED');

    } catch (error: any) {
      console.error('  Status: FAILED - ' + error.message);
      try {
        await this.api.post('/jobs/' + job.jobId + '/fail', {
          errorMessage: error.message,
        });
      } catch (e) {}
    }
    console.log('-'.repeat(50));
  }

  private getPrinterForJob(job: PrintJob): string {
    if (job.printerName) return job.printerName;
    const assigned = this.printerAssignments.get(job.documentType);
    if (assigned) return assigned;
    const category = DOCUMENT_PRINTER_CATEGORY[job.documentType] || 'standard';
    const printer = this.printerManager.getDefaultPrinterForCategory(category);
    if (printer) return printer.name;
    const defaultPrinter = this.printerManager.getDefaultPrinter();
    return defaultPrinter?.name || '';
  }
}
