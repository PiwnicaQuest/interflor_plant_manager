/**
 * PlantManager Print Agent
 *
 * This application runs on a computer with printers connected.
 * It polls the PlantManager server for print jobs and executes them.
 *
 * Features:
 * - Registers with the server and reports available printers
 * - Polls for pending print jobs
 * - Prints HTML content to configured printers
 * - Supports different paper sizes and orientations
 * - Reports job completion/failure back to the server
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Configuration
const CONFIG = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:4000',
  agentId: process.env.AGENT_ID || `agent-${uuidv4().substring(0, 8)}`,
  agentName: process.env.AGENT_NAME || os.hostname(),
  pollInterval: parseInt(process.env.POLL_INTERVAL || '5000'), // 5 seconds
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'), // 30 seconds
  tempDir: process.env.TEMP_DIR || path.join(os.tmpdir(), 'print-agent'),
};

// Save agent ID for persistence
const configPath = path.join(__dirname, '..', 'agent-config.json');

interface PrintJob {
  id: number;
  jobId: string;
  documentType: string;
  status: string;
  contentType: string;
  content: string | null;
  contentUrl: string | null;
  printerName: string | null;
  paperSize: string | null;
  copies: number;
  orientation: string | null;
  colorMode: string | null;
  title: string | null;
}

interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

class PrintAgent {
  private api: AxiosInstance;
  private isRunning: boolean = false;
  private printers: PrinterInfo[] = [];

  constructor() {
    // Load saved agent ID if exists
    if (fs.existsSync(configPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (saved.agentId) {
          CONFIG.agentId = saved.agentId;
        }
      } catch (e) {
        console.error('Error loading config:', e);
      }
    }

    // Save agent ID
    fs.writeFileSync(configPath, JSON.stringify({ agentId: CONFIG.agentId }));

    // Ensure temp directory exists
    if (!fs.existsSync(CONFIG.tempDir)) {
      fs.mkdirSync(CONFIG.tempDir, { recursive: true });
    }

    // Create API client
    this.api = axios.create({
      baseURL: `${CONFIG.serverUrl}/print`,
      timeout: 30000,
    });

    console.log('='.repeat(50));
    console.log('PlantManager Print Agent');
    console.log('='.repeat(50));
    console.log(`Agent ID: ${CONFIG.agentId}`);
    console.log(`Agent Name: ${CONFIG.agentName}`);
    console.log(`Server URL: ${CONFIG.serverUrl}`);
    console.log(`Poll Interval: ${CONFIG.pollInterval}ms`);
    console.log('='.repeat(50));
  }

  async start(): Promise<void> {
    this.isRunning = true;

    // Detect printers
    await this.detectPrinters();

    // Register with server
    await this.register();

    // Start heartbeat loop
    this.startHeartbeat();

    // Start job polling loop
    this.startPolling();

    console.log('Print Agent started. Press Ctrl+C to stop.');
  }

  stop(): void {
    this.isRunning = false;
    console.log('Print Agent stopping...');
  }

  private async detectPrinters(): Promise<void> {
    console.log('Detecting printers...');

    try {
      if (process.platform === 'win32') {
        // Windows: Use wmic command with CSV format
        // CSV format: Node,Column1,Column2,...
        const { stdout } = await execAsync('wmic printer get name,default /format:csv');

        // Split by line, handling both \r\n and \n
        const lines = stdout.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          console.log('No printers found in wmic output');
          this.printers = [];
          return;
        }

        // Parse header to find column indices dynamically
        const header = lines[0].toLowerCase().split(',');
        const nameIndex = header.findIndex(h => h.trim() === 'name');
        const defaultIndex = header.findIndex(h => h.trim() === 'default');

        console.log(`CSV Header: ${lines[0]}`);
        console.log(`Name index: ${nameIndex}, Default index: ${defaultIndex}`);

        if (nameIndex === -1) {
          console.error('Could not find "name" column in wmic output');
          this.printers = [];
          return;
        }

        this.printers = lines
          .slice(1) // Skip header
          .filter(line => line.trim())
          .map(line => {
            const parts = line.split(',');
            const name = parts[nameIndex]?.trim() || '';
            const isDefault = defaultIndex !== -1
              ? parts[defaultIndex]?.trim().toUpperCase() === 'TRUE'
              : false;
            return { name, isDefault };
          })
          .filter(p => p.name && p.name.length > 0);

      } else if (process.platform === 'darwin') {
        // macOS: Use lpstat command
        const { stdout } = await execAsync('lpstat -p -d');
        const lines = stdout.trim().split('\n');

        let defaultPrinter = '';
        // Handle both English and Polish output
        const defaultMatch = stdout.match(/(?:system default destination|domyslny cel systemowy): (.+)/);
        if (defaultMatch) {
          defaultPrinter = defaultMatch[1].trim();
        }

        this.printers = lines
          // Handle both "printer" (English) and "drukarka" (Polish)
          .filter(line => line.startsWith('printer') || line.startsWith('drukarka'))
          .map(line => {
            const match = line.match(/(?:printer|drukarka) (\S+)/);
            const name = match ? match[1] : '';
            return {
              name,
              isDefault: name === defaultPrinter,
            };
          })
          .filter(p => p.name);

      } else {
        // Linux: Use lpstat command
        const { stdout } = await execAsync('lpstat -p -d 2>/dev/null || echo ""');
        const lines = stdout.trim().split('\n');

        let defaultPrinter = '';
        const defaultMatch = stdout.match(/system default destination: (.+)/);
        if (defaultMatch) {
          defaultPrinter = defaultMatch[1].trim();
        }

        this.printers = lines
          .filter(line => line.startsWith('printer'))
          .map(line => {
            const match = line.match(/printer (\S+)/);
            const name = match ? match[1] : '';
            return {
              name,
              isDefault: name === defaultPrinter,
            };
          })
          .filter(p => p.name);
      }

      console.log(`Found ${this.printers.length} printer(s):`);
      this.printers.forEach(p => {
        console.log(`  - ${p.name}${p.isDefault ? ' (default)' : ''}`);
      });

    } catch (error) {
      console.error('Error detecting printers:', error);
      this.printers = [];
    }
  }

  private async register(): Promise<void> {
    try {
      const response = await this.api.post('/agents/register', {
        agentId: CONFIG.agentId,
        name: CONFIG.agentName,
        printers: this.printers.map(p => p.name),
      });

      console.log('Registered with server:', response.data.message);
    } catch (error: any) {
      console.error('Error registering with server:', error.message);
      console.log('Will retry on next heartbeat...');
    }
  }

  private startHeartbeat(): void {
    const heartbeat = async () => {
      if (!this.isRunning) return;

      try {
        const response = await this.api.post(`/agents/${CONFIG.agentId}/heartbeat`, {
          printers: this.printers.map(p => p.name),
        });

        // Process any pending jobs returned with heartbeat
        const pendingJobs = response.data.pendingJobs || [];
        if (pendingJobs.length > 0) {
          console.log(`Heartbeat: ${pendingJobs.length} pending job(s)`);
        }

      } catch (error: any) {
        console.error('Heartbeat error:', error.message);
        // Try to re-register
        await this.register();
      }

      setTimeout(heartbeat, CONFIG.heartbeatInterval);
    };

    heartbeat();
  }

  private startPolling(): void {
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        // Get pending jobs for this agent
        const response = await this.api.post(`/agents/${CONFIG.agentId}/heartbeat`, {
          printers: this.printers.map(p => p.name),
        });

        const pendingJobs: PrintJob[] = response.data.pendingJobs || [];

        for (const job of pendingJobs) {
          await this.processJob(job);
        }

      } catch (error: any) {
        // Silently ignore polling errors (will retry)
        if (error.code !== 'ECONNREFUSED') {
          console.error('Polling error:', error.message);
        }
      }

      setTimeout(poll, CONFIG.pollInterval);
    };

    poll();
  }

  private async processJob(job: PrintJob): Promise<void> {
    console.log(`\nProcessing job: ${job.jobId}`);
    console.log(`  Type: ${job.documentType}`);
    console.log(`  Title: ${job.title || 'Untitled'}`);
    console.log(`  Printer: ${job.printerName || 'Default'}`);

    try {
      // Claim the job
      const claimResponse = await this.api.post(`/jobs/${job.jobId}/claim`, {
        agentId: CONFIG.agentId,
      });

      if (!claimResponse.data.job) {
        console.log('  Job already claimed by another agent');
        return;
      }

      // Get the content to print
      let content = job.content;
      if (!content && job.contentUrl) {
        const contentResponse = await axios.get(job.contentUrl);
        content = contentResponse.data;
      }

      if (!content) {
        throw new Error('No content to print');
      }

      // Print based on content type
      if (job.contentType === 'html') {
        await this.printHtml(content, job);
      } else if (job.contentType === 'pdf') {
        await this.printPdf(content, job);
      } else {
        await this.printRaw(content, job);
      }

      // Mark job as completed
      await this.api.post(`/jobs/${job.jobId}/complete`);
      console.log(`  Job completed successfully`);

    } catch (error: any) {
      console.error(`  Job failed: ${error.message}`);

      // Report failure
      try {
        await this.api.post(`/jobs/${job.jobId}/fail`, {
          errorMessage: error.message,
        });
      } catch (e) {
        console.error('Error reporting failure:', e);
      }
    }
  }

  private async printHtml(html: string, job: PrintJob): Promise<void> {
    // Use Puppeteer to render and print HTML
    const puppeteer = await import('puppeteer');

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF from HTML
      const pdfPath = path.join(CONFIG.tempDir, `${job.jobId}.pdf`);

      // Map paper size
      const paperFormat = this.mapPaperSize(job.paperSize);

      await page.pdf({
        path: pdfPath,
        format: paperFormat as any,
        landscape: job.orientation === 'landscape',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });

      // Print the PDF
      await this.printFile(pdfPath, job);

      // Cleanup
      fs.unlinkSync(pdfPath);

    } finally {
      await browser.close();
    }
  }

  private async printPdf(base64Content: string, job: PrintJob): Promise<void> {
    // Decode base64 PDF and save to temp file
    const pdfPath = path.join(CONFIG.tempDir, `${job.jobId}.pdf`);
    const buffer = Buffer.from(base64Content, 'base64');
    fs.writeFileSync(pdfPath, buffer);

    try {
      await this.printFile(pdfPath, job);
    } finally {
      fs.unlinkSync(pdfPath);
    }
  }

  private async printRaw(content: string, job: PrintJob): Promise<void> {
    // Save raw content to temp file
    const filePath = path.join(CONFIG.tempDir, `${job.jobId}.txt`);
    fs.writeFileSync(filePath, content);

    try {
      await this.printFile(filePath, job);
    } finally {
      fs.unlinkSync(filePath);
    }
  }

  private async printFile(filePath: string, job: PrintJob): Promise<void> {
    const printerName = job.printerName || this.getDefaultPrinter();
    const copies = job.copies || 1;

    console.log(`  Printing to: ${printerName || 'default'}`);
    console.log(`  Copies: ${copies}`);

    if (process.platform === 'win32') {
      // Windows: Use pdf-to-printer or native print command
      try {
        const pdfToPrinter = await import('pdf-to-printer');
        await pdfToPrinter.print(filePath, {
          printer: printerName,
          copies: copies,
        });
      } catch (e) {
        // Fallback to native print command
        const printerArg = printerName ? `/d:"${printerName}"` : '';
        for (let i = 0; i < copies; i++) {
          await execAsync(`print ${printerArg} "${filePath}"`);
        }
      }

    } else if (process.platform === 'darwin') {
      // macOS: Use lpr command
      const printerArg = printerName ? `-P "${printerName}"` : '';
      await execAsync(`lpr ${printerArg} -# ${copies} "${filePath}"`);

    } else {
      // Linux: Use lpr command
      const printerArg = printerName ? `-P "${printerName}"` : '';
      await execAsync(`lpr ${printerArg} -# ${copies} "${filePath}"`);
    }
  }

  private getDefaultPrinter(): string | undefined {
    const defaultPrinter = this.printers.find(p => p.isDefault);
    return defaultPrinter?.name;
  }

  private mapPaperSize(size: string | null): string {
    // Map custom sizes to Puppeteer format
    const sizeMap: Record<string, string> = {
      'A4': 'A4',
      'A5': 'A5',
      'Letter': 'Letter',
      'Legal': 'Legal',
      '100x50mm': 'A7', // Closest standard size for labels
      '100x150mm': 'A6',
      '80mm': 'A7', // Receipt printer
      '57mm': 'A8',
    };

    return sizeMap[size || 'A4'] || 'A4';
  }
}

// Main entry point
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
