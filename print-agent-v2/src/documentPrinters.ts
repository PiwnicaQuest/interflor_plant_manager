/**
 * Document Printers - Specialized printing for different document types
 * Fixed version with proper viewport and quality settings
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrintJob, PaperConfig, PAPER_SIZES } from './types';

const execAsync = promisify(exec);

// Temp directory for print files
const TEMP_DIR = process.env.TEMP_DIR || path.join(os.tmpdir(), 'print-agent-v2');

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Base class for document printers
 */
export abstract class DocumentPrinter {
  protected printerName: string;

  constructor(printerName: string) {
    this.printerName = printerName;
  }

  abstract print(job: PrintJob): Promise<void>;

  /**
   * Parse paper size from string
   */
  protected parsePaperSize(size: string | null): PaperConfig {
    if (!size) return { format: 'A4', width: 210, height: 297 };

    // Check predefined sizes
    if (PAPER_SIZES[size]) {
      return {
        format: size,
        width: PAPER_SIZES[size].width,
        height: PAPER_SIZES[size].height,
      };
    }

    // Try to parse custom format like "WxHmm"
    const match = size.match(/(\d+)\s*x\s*(\d+)\s*mm?/i);
    if (match) {
      return {
        width: parseInt(match[1]),
        height: parseInt(match[2]),
      };
    }

    // Default to A4
    return { format: 'A4', width: 210, height: 297 };
  }
}

/**
 * Standard Printer - For A4 documents (invoices, orders, reports)
 * Uses Puppeteer to convert HTML to PDF with proper A4 formatting
 */
export class StandardPrinter extends DocumentPrinter {
  async print(job: PrintJob): Promise<void> {
    console.log('[StandardPrinter] Printing to ' + this.printerName);

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();
      const paperConfig = this.parsePaperSize(job.paperSize);

      // Set proper A4 viewport (at 96 DPI screen resolution)
      // A4 = 210mm x 297mm = ~794px x 1123px at 96 DPI
      const widthPx = Math.round((paperConfig.width || 210) * 96 / 25.4);
      const heightPx = Math.round((paperConfig.height || 297) * 96 / 25.4);

      await page.setViewport({
        width: widthPx,
        height: heightPx,
        deviceScaleFactor: 2, // Higher quality
      });

      // Load content - wait for everything to render
      const content = job.content || '';
      await page.setContent(content, { 
        waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
        timeout: 30000,
      });

      // Additional wait for any JS rendering
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

      // Generate high-quality PDF
      const pdfPath = path.join(TEMP_DIR, job.jobId + '.pdf');
      await page.pdf({
        path: pdfPath,
        format: (paperConfig.format as any) || 'A4',
        landscape: job.orientation === 'landscape',
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: '8mm',
          bottom: '8mm',
          left: '8mm',
          right: '8mm',
        },
      });

      // Print PDF
      await this.printFile(pdfPath, job.copies || 1);

      // Cleanup
      fs.unlinkSync(pdfPath);
      console.log('[StandardPrinter] Print completed successfully');

    } finally {
      await browser.close();
    }
  }

  private async printFile(filePath: string, copies: number = 1): Promise<void> {
    if (process.platform === 'win32') {
      try {
        const pdfToPrinter = await import('pdf-to-printer');
        await pdfToPrinter.print(filePath, {
          printer: this.printerName,
          copies: copies,
        });
      } catch (e) {
        // Fallback to Windows print command
        const printerArg = this.printerName ? '/d:"' + this.printerName + '"' : '';
        for (let i = 0; i < copies; i++) {
          await execAsync('print ' + printerArg + ' "' + filePath + '"');
        }
      }
    } else {
      // macOS/Linux using lpr
      const printerArg = this.printerName ? '-P "' + this.printerName + '"' : '';
      await execAsync('lpr ' + printerArg + ' -# ' + copies + ' "' + filePath + '"');
    }
  }
}

/**
 * Thermal Label Printer - For barcode labels (TSC, Zebra, etc.)
 * Converts HTML to high-resolution image for sharp barcode printing
 */
export class ThermalLabelPrinter extends DocumentPrinter {
  async print(job: PrintJob): Promise<void> {
    console.log('[ThermalLabelPrinter] Printing to ' + this.printerName);

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();
      const paperConfig = this.parsePaperSize(job.paperSize);

      // Calculate dimensions - default 100x50mm for labels
      const widthMm = paperConfig.width || 100;
      const heightMm = paperConfig.height || 50;

      // High DPI for sharp barcode printing (300 DPI)
      const dpi = 300;
      const mmToPx = dpi / 25.4;
      
      const widthPx = Math.round(widthMm * mmToPx);
      const heightPx = Math.round(heightMm * mmToPx);

      await page.setViewport({
        width: widthPx,
        height: heightPx,
        deviceScaleFactor: 1,
      });

      // Load HTML content
      const content = job.content || '';
      await page.setContent(content, { 
        waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
        timeout: 30000,
      });

      // Wait for any barcode generation scripts (JsBarcode etc.)
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 800)));

      // Generate high-quality PNG image
      const imagePath = path.join(TEMP_DIR, job.jobId + '.png');
      await page.screenshot({
        path: imagePath,
        type: 'png',
        fullPage: true,
        omitBackground: false,
      });

      // Print image to thermal printer
      await this.printImage(imagePath, job.copies || 1);

      // Cleanup
      fs.unlinkSync(imagePath);
      console.log('[ThermalLabelPrinter] Print completed successfully');

    } finally {
      await browser.close();
    }
  }

  private async printImage(imagePath: string, copies: number = 1): Promise<void> {
    if (process.platform === 'win32') {
      for (let i = 0; i < copies; i++) {
        try {
          const pdfToPrinter = await import('pdf-to-printer');
          await pdfToPrinter.print(imagePath, {
            printer: this.printerName,
          });
        } catch (e) {
          try {
            await execAsync(
              'rundll32 shimgvw.dll,ImageView_PrintTo "' + imagePath + '" "' + this.printerName + '"',
              { timeout: 30000 }
            );
          } catch (e2) {
            console.error('[ThermalLabelPrinter] All print methods failed:', e2);
            throw new Error('Failed to print label - no working print method found');
          }
        }
      }
    } else {
      // macOS/Linux
      const printerArg = this.printerName ? '-P "' + this.printerName + '"' : '';
      for (let i = 0; i < copies; i++) {
        await execAsync('lpr ' + printerArg + ' "' + imagePath + '"');
      }
    }
  }
}

/**
 * Thermal Receipt Printer - For receipts (58mm/80mm thermal)
 * Converts HTML to properly formatted receipt image with correct width
 */
export class ThermalReceiptPrinter extends DocumentPrinter {
  async print(job: PrintJob): Promise<void> {
    console.log('[ThermalReceiptPrinter] Printing to ' + this.printerName);

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();
      const paperConfig = this.parsePaperSize(job.paperSize);

      // Receipt printers - fixed width, variable height
      // Default 72mm (without margins) for 80mm paper
      const widthMm = paperConfig.width || 72;
      
      // Receipt printers typically have ~203 DPI
      const dpi = 203;
      const mmToPx = dpi / 25.4;
      const widthPx = Math.round(widthMm * mmToPx);

      // Set fixed width, tall height for variable content
      await page.setViewport({
        width: widthPx,
        height: 2000, // Tall enough for any receipt
        deviceScaleFactor: 1,
      });

      // Load content
      const content = job.content || '';
      await page.setContent(content, { 
        waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
        timeout: 30000,
      });

      // Wait for rendering
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));

      // Get actual content height
      const contentHeight = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight
        );
      });

      // Take screenshot of exact content height
      const imagePath = path.join(TEMP_DIR, job.jobId + '_receipt.png');
      await page.screenshot({
        path: imagePath,
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: widthPx,
          height: Math.min(contentHeight + 20, 3000), // Add small padding, max 3000px
        },
      });

      // Print image to thermal printer
      await this.printReceiptImage(imagePath, job.copies || 1);

      // Cleanup
      fs.unlinkSync(imagePath);
      console.log('[ThermalReceiptPrinter] Print completed successfully');

    } finally {
      await browser.close();
    }
  }

  private async printReceiptImage(imagePath: string, copies: number = 1): Promise<void> {
    if (process.platform === 'win32') {
      for (let i = 0; i < copies; i++) {
        try {
          const pdfToPrinter = await import('pdf-to-printer');
          await pdfToPrinter.print(imagePath, {
            printer: this.printerName,
          });
        } catch (e) {
          try {
            await execAsync(
              'rundll32 shimgvw.dll,ImageView_PrintTo "' + imagePath + '" "' + this.printerName + '"',
              { timeout: 30000 }
            );
          } catch (e2) {
            throw new Error('Failed to print receipt');
          }
        }
      }
    } else {
      // macOS/Linux
      const printerArg = this.printerName ? '-P "' + this.printerName + '"' : '';
      for (let i = 0; i < copies; i++) {
        await execAsync('lpr ' + printerArg + ' "' + imagePath + '"');
      }
    }
  }
}

/**
 * Factory function to create appropriate printer instance
 */
export function createPrinter(category: string, printerName: string): DocumentPrinter {
  switch (category) {
    case 'thermal_label':
      return new ThermalLabelPrinter(printerName);
    case 'thermal_receipt':
      return new ThermalReceiptPrinter(printerName);
    case 'standard':
    default:
      return new StandardPrinter(printerName);
  }
}
