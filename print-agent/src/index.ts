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

// Paper size can be a standard format or custom dimensions
interface PaperConfig {
  format?: string;
  width?: string;
  height?: string;
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
        const { stdout } = await execAsync('wmic printer get name,default /format:csv');

        const lines = stdout.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          console.log('No printers found in wmic output');
          this.printers = [];
          return;
        }

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
          .slice(1)
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
        const defaultMatch = stdout.match(/(?:system default destination|domyslny cel systemowy): (.+)/);
        if (defaultMatch) {
          defaultPrinter = defaultMatch[1].trim();
        }

        this.printers = lines
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

        const pendingJobs = response.data.pendingJobs || [];
        if (pendingJobs.length > 0) {
          console.log(`Heartbeat: ${pendingJobs.length} pending job(s)`);
        }

      } catch (error: any) {
        console.error('Heartbeat error:', error.message);
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
        const response = await this.api.post(`/agents/${CONFIG.agentId}/heartbeat`, {
          printers: this.printers.map(p => p.name),
        });

        const pendingJobs: PrintJob[] = response.data.pendingJobs || [];

        for (const job of pendingJobs) {
          await this.processJob(job);
        }

      } catch (error: any) {
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
    console.log(`  Paper Size: ${job.paperSize || 'Default'}`);

    try {
      const claimResponse = await this.api.post(`/jobs/${job.jobId}/claim`, {
        agentId: CONFIG.agentId,
      });

      if (!claimResponse.data.job) {
        console.log('  Job already claimed by another agent');
        return;
      }

      let content = job.content;
      if (!content && job.contentUrl) {
        const contentResponse = await axios.get(job.contentUrl);
        content = contentResponse.data;
      }

      if (!content) {
        throw new Error('No content to print');
      }

      if (job.contentType === 'html') {
        await this.printHtml(content, job);
      } else if (job.contentType === 'pdf') {
        await this.printPdf(content, job);
      } else {
        await this.printRaw(content, job);
      }

      await this.api.post(`/jobs/${job.jobId}/complete`);
      console.log(`  Job completed successfully`);

    } catch (error: any) {
      console.error(`  Job failed: ${error.message}`);

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
    const puppeteer = await import('puppeteer');

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      // Get paper configuration (format or custom dimensions)
      const paperConfig = this.mapPaperSize(job.paperSize);

      console.log(`  Paper config: ${JSON.stringify(paperConfig)}`);

      // Set high DPI viewport for all documents (minimum 300 DPI)
      // deviceScaleFactor: 4 = 96 * 4 = 384 DPI
      const mmToPx = 3.7795; // 96 DPI conversion

      if (paperConfig.width && paperConfig.height) {
        // Custom dimensions (labels, receipts with custom size)
        const widthMm = parseFloat(paperConfig.width.replace('mm', ''));
        const heightMm = parseFloat(paperConfig.height.replace('mm', ''));

        await page.setViewport({
          width: Math.round(widthMm * mmToPx),
          height: Math.round(heightMm * mmToPx),
          deviceScaleFactor: 4, // ~384 DPI for sharp text and barcodes
        });
      } else {
        // Standard formats (A4, A5, etc.) - set appropriate viewport
        const formatSizes: Record<string, { width: number; height: number }> = {
          'A4': { width: 210, height: 297 },
          'A5': { width: 148, height: 210 },
          'A6': { width: 105, height: 148 },
          'Letter': { width: 216, height: 279 },
          'Legal': { width: 216, height: 356 },
          '75mm': { width: 75, height: 297 }, // Receipt paper 75mm width
          '80mm': { width: 80, height: 297 }, // Receipt paper 80mm width
          '58mm': { width: 58, height: 200 }, // Receipt paper 58mm width
        };

        const size = formatSizes[paperConfig.format || 'A4'] || formatSizes['A4'];
        const isLandscape = job.orientation === 'landscape';

        await page.setViewport({
          width: Math.round((isLandscape ? size.height : size.width) * mmToPx),
          height: Math.round((isLandscape ? size.width : size.height) * mmToPx),
          deviceScaleFactor: 4, // ~384 DPI for high quality print
        });
      }

      // For barcode labels, rotate 180 degrees (TSC printers feed paper from bottom)
      if (false && job.documentType === "barcode_labels") {
        const rotateStyle = '<style>.label-container { transform: rotate(180deg); transform-origin: center center; }</style>';
        html = html.replace('</head>', rotateStyle + '</head>');
      }

      // DEBUG: Save HTML to file for inspection
      const fs = require("fs");
      console.log("DEBUG HTML length:", html.length);
      console.log("DEBUG HTML preview:", html.substring(0, 500));
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfPath = path.join(CONFIG.tempDir, `${job.jobId}.pdf`);

      // Build PDF options
      const pdfOptions: any = {
        path: pdfPath,
        // landscape is only for standard formats, not custom dimensions
        printBackground: true,
        preferCSSPageSize: true, // Respect CSS @page rules
      };

      if (paperConfig.format) {
        // Standard format (A4, A5, Letter, etc.)
        pdfOptions.landscape = job.orientation === 'landscape';
        pdfOptions.format = paperConfig.format;
        pdfOptions.margin = { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' };
      } else if (paperConfig.width && paperConfig.height) {
        // Custom dimensions for labels
        pdfOptions.width = paperConfig.width;
        pdfOptions.height = paperConfig.height;
        pdfOptions.margin = { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' };
        pdfOptions.scale = 1; // No scaling
      }

      console.log("DEBUG Options:", job.documentType);
      if (job.documentType === "barcode_labels") { await page.screenshot({ path: pdfPath.replace(".pdf", ".png"), fullPage: true }); pdfPath = pdfPath.replace(".pdf", ".png"); } else { await page.pdf(pdfOptions); }

      await this.printFile(pdfPath, job);

      fs.unlinkSync(pdfPath);

    } finally {
      await browser.close();
    }
  }

  private async printPdf(base64Content: string, job: PrintJob): Promise<void> {
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
      try {
        const pdfToPrinter = await import('pdf-to-printer');
        await pdfToPrinter.print(filePath, {
          printer: printerName,
          copies: copies,
        });
      } catch (e) {
        const printerArg = printerName ? `/d:"${printerName}"` : '';
        for (let i = 0; i < copies; i++) {
          await execAsync(`print ${printerArg} "${filePath}"`);
        }
      }

    } else if (process.platform === 'darwin') {
      const printerArg = printerName ? `-P "${printerName}"` : '';
      await execAsync(`lpr ${printerArg} -# ${copies} "${filePath}"`);

    } else {
      const printerArg = printerName ? `-P "${printerName}"` : '';
      await execAsync(`lpr ${printerArg} -# ${copies} "${filePath}"`);
    }
  }

  private getDefaultPrinter(): string | undefined {
    const defaultPrinter = this.printers.find(p => p.isDefault);
    return defaultPrinter?.name;
  }

  private mapPaperSize(size: string | null): PaperConfig {
    // Standard format mapping
    const standardFormats: Record<string, string> = {
      'A4': 'A4',
      'A5': 'A5',
      'A6': 'A6',
      'Letter': 'Letter',
      'Legal': 'Legal',
    };

    // Custom size mapping (width x height in mm)
    const customSizes: Record<string, { width: string; height: string }> = {
      '50x30mm': { width: '50mm', height: '30mm' },
      '50x30': { width: '50mm', height: '30mm' },
      '57x30mm': { width: '57mm', height: '30mm' },
      '57x30': { width: '57mm', height: '30mm' },
      '100x50mm': { width: '100mm', height: '50mm' },
      '100x50': { width: '100mm', height: '50mm' },
      '100x150mm': { width: '100mm', height: '150mm' },
      '100x150': { width: '100mm', height: '150mm' },
      '75mm': { width: '75mm', height: '297mm' }, // Receipt roll 75mm - continuous
      '80mm': { width: '80mm', height: '297mm' }, // Receipt roll 80mm - continuous
      '57mm': { width: '57mm', height: '30mm' }, // Common label size
      '58mm': { width: '58mm', height: '40mm' }, // Common label size
    };

    const sizeKey = size || 'A4';

    // Check for standard format first
    if (standardFormats[sizeKey]) {
      return { format: standardFormats[sizeKey] };
    }

    // Check for custom size
    if (customSizes[sizeKey]) {
      return customSizes[sizeKey];
    }

    // Try to parse custom format like "WxHmm" or "W x H mm"
    const customMatch = sizeKey.match(/(\d+)\s*x\s*(\d+)\s*mm?/i);
    if (customMatch) {
      return {
        width: `${customMatch[1]}mm`,
        height: `${customMatch[2]}mm`,
      };
    }

    // Default to A4
    console.log(`  Warning: Unknown paper size "${sizeKey}", defaulting to A4`);
    return { format: 'A4' };
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
