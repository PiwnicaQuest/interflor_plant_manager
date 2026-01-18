/**
 * Printer Manager - Handles printer detection and categorization
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { PrinterInfo, PrinterCategory } from './types';

const execAsync = promisify(exec);

// Keywords to detect thermal label printers
const THERMAL_LABEL_KEYWORDS = [
  'tsc', 'mx340p', 'zebra', 'brother ql', 'dymo', 'godex', 'sato', 'citizen',
  'datamax', 'intermec', 'honeywell', 'label', 'barcode', 'etykiet'
];

// Keywords to detect thermal receipt printers  
const THERMAL_RECEIPT_KEYWORDS = [
  'pos', 'receipt', 'epson tm', 'star tsp', 'bixolon', 'sewoo', 'elite',
  'paragon', 'termiczna', 'thermal', 'xprinter', '58mm', '80mm',
  'pos-58', 'pos-80'
];

export class PrinterManager {
  private printers: PrinterInfo[] = [];
  private printerCategories: Map<string, PrinterCategory> = new Map();

  /**
   * Detect and categorize all printers on the system
   */
  async detectPrinters(): Promise<PrinterInfo[]> {
    console.log('\n[PrinterManager] Detecting printers...');

    try {
      if (process.platform === 'win32') {
        await this.detectWindowsPrinters();
      } else if (process.platform === 'darwin') {
        await this.detectMacPrinters();
      } else {
        await this.detectLinuxPrinters();
      }

      // Log detected printers
      console.log(`[PrinterManager] Found ${this.printers.length} printer(s):\n`);
      this.printers.forEach(p => {
        console.log(`  [${p.category.toUpperCase().padEnd(14)}] ${p.name}${p.isDefault ? ' (default)' : ''}`);
      });

      return this.printers;
    } catch (error) {
      console.error('[PrinterManager] Error detecting printers:', error);
      return [];
    }
  }

  /**
   * Detect printers on Windows
   */
  private async detectWindowsPrinters(): Promise<void> {
    try {
      // Get printer list with more details
      const { stdout } = await execAsync(
        'wmic printer get name,default,drivername,portname,status /format:csv',
        { encoding: 'utf-8' }
      );

      const lines = stdout.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        console.log('[PrinterManager] No printers found');
        return;
      }

      const header = lines[0].toLowerCase().split(',');
      const nameIdx = header.findIndex(h => h.trim() === 'name');
      const defaultIdx = header.findIndex(h => h.trim() === 'default');
      const driverIdx = header.findIndex(h => h.trim() === 'drivername');
      const portIdx = header.findIndex(h => h.trim() === 'portname');
      const statusIdx = header.findIndex(h => h.trim() === 'status');

      this.printers = lines.slice(1)
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(',');
          const name = parts[nameIdx]?.trim() || '';
          const isDefault = defaultIdx !== -1 ? parts[defaultIdx]?.trim().toUpperCase() === 'TRUE' : false;
          const driver = driverIdx !== -1 ? parts[driverIdx]?.trim() : undefined;
          const portName = portIdx !== -1 ? parts[portIdx]?.trim() : undefined;
          const status = statusIdx !== -1 ? parts[statusIdx]?.trim() : undefined;

          // Categorize printer based on name and driver
          const category = this.categorizePrinter(name, driver);

          return { name, isDefault, category, driver, portName, status };
        })
        .filter(p => p.name.length > 0);

    } catch (error) {
      console.error('[PrinterManager] Windows printer detection error:', error);
      this.printers = [];
    }
  }

  /**
   * Detect printers on macOS
   */
  private async detectMacPrinters(): Promise<void> {
    try {
      const { stdout } = await execAsync('lpstat -p -d 2>/dev/null || echo ');
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
          const isDefault = name === defaultPrinter;
          const category = this.categorizePrinter(name);
          return { name, isDefault, category };
        })
        .filter(p => p.name);

    } catch (error) {
      console.error('[PrinterManager] macOS printer detection error:', error);
      this.printers = [];
    }
  }

  /**
   * Detect printers on Linux
   */
  private async detectLinuxPrinters(): Promise<void> {
    try {
      const { stdout } = await execAsync('lpstat -p -d 2>/dev/null || echo ');
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
          const isDefault = name === defaultPrinter;
          const category = this.categorizePrinter(name);
          return { name, isDefault, category };
        })
        .filter(p => p.name);

    } catch (error) {
      console.error('[PrinterManager] Linux printer detection error:', error);
      this.printers = [];
    }
  }

  /**
   * Categorize a printer based on its name and driver
   */
  private categorizePrinter(name: string, driver?: string): PrinterCategory {
    const searchStr = `${name} ${driver || ''}`.toLowerCase();

    // Check for thermal label printer
    if (THERMAL_LABEL_KEYWORDS.some(kw => searchStr.includes(kw))) {
      return 'thermal_label';
    }

    // Check for thermal receipt printer
    if (THERMAL_RECEIPT_KEYWORDS.some(kw => searchStr.includes(kw))) {
      return 'thermal_receipt';
    }

    // Default to standard printer
    return 'standard';
  }

  /**
   * Manually set a printer's category (for user configuration)
   */
  setCategory(printerName: string, category: PrinterCategory): void {
    this.printerCategories.set(printerName.toLowerCase(), category);
    
    // Update the printer in the list
    const printer = this.printers.find(p => p.name.toLowerCase() === printerName.toLowerCase());
    if (printer) {
      printer.category = category;
    }
  }

  /**
   * Get all printers
   */
  getPrinters(): PrinterInfo[] {
    return this.printers;
  }

  /**
   * Get printer by name
   */
  getPrinter(name: string): PrinterInfo | undefined {
    return this.printers.find(p => p.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Get printers by category
   */
  getPrintersByCategory(category: PrinterCategory): PrinterInfo[] {
    return this.printers.filter(p => p.category === category);
  }

  /**
   * Get the first available printer for a category
   */
  getDefaultPrinterForCategory(category: PrinterCategory): PrinterInfo | undefined {
    // First try to find a printer with this category
    const categoryPrinters = this.getPrintersByCategory(category);
    if (categoryPrinters.length > 0) {
      // Prefer default printer if it's in the category
      const defaultInCategory = categoryPrinters.find(p => p.isDefault);
      return defaultInCategory || categoryPrinters[0];
    }
    
    // Fallback to standard category for unknown
    if (category === 'unknown') {
      return this.getDefaultPrinterForCategory('standard');
    }

    return undefined;
  }

  /**
   * Get default printer (system default)
   */
  getDefaultPrinter(): PrinterInfo | undefined {
    return this.printers.find(p => p.isDefault);
  }

  /**
   * Get printer names as array
   */
  getPrinterNames(): string[] {
    return this.printers.map(p => p.name);
  }
}
