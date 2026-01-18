/**
 * Print Agent v2 - Type Definitions
 */

// Printer categories based on hardware type
export type PrinterCategory = 'thermal_label' | 'thermal_receipt' | 'standard' | 'unknown';

// Document types that can be printed
export type DocumentType =
  | 'barcode_labels'
  | 'orders'
  | 'invoices'
  | 'receipts'
  | 'inventory_reports'
  | 'delivery_notes';

// Print job status
export type PrintJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

// Content type
export type ContentType = 'html' | 'pdf' | 'raw' | 'image';

// Printer information
export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  category: PrinterCategory;
  driver?: string;
  portName?: string;
  status?: string;
}

// Print job from server
export interface PrintJob {
  id: number;
  jobId: string;
  documentType: DocumentType;
  status: PrintJobStatus;
  contentType: ContentType;
  content: string | null;
  contentUrl: string | null;
  printerName: string | null;
  paperSize: string | null;
  copies: number;
  orientation: string | null;
  colorMode: string | null;
  title: string | null;
}

// Paper configuration
export interface PaperConfig {
  format?: string;
  width?: number;  // in mm
  height?: number; // in mm
}

// Printer configuration from server
export interface PrinterConfig {
  documentType: DocumentType;
  agentId: string | null;
  printerName: string | null;
  paperSize: string;
  copies: number;
  orientation: string;
  colorMode: string;
  isActive: boolean;
}

// Document type to printer category mapping
export const DOCUMENT_PRINTER_CATEGORY: Record<DocumentType, PrinterCategory> = {
  barcode_labels: 'thermal_label',
  receipts: 'thermal_receipt',
  orders: 'standard',
  invoices: 'standard',
  inventory_reports: 'standard',
  delivery_notes: 'standard',
};

// Standard paper sizes
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  'A4': { width: 210, height: 297 },
  'A5': { width: 148, height: 210 },
  'A6': { width: 105, height: 148 },
  'Letter': { width: 216, height: 279 },
  'Legal': { width: 216, height: 356 },
  // Label sizes
  '50x30mm': { width: 50, height: 30 },
  '50x30': { width: 50, height: 30 },
  '57x30mm': { width: 57, height: 30 },
  '57x30': { width: 57, height: 30 },
  '100x50mm': { width: 100, height: 50 },
  '100x50': { width: 100, height: 50 },
  '100x150mm': { width: 100, height: 150 },
  '100x150': { width: 100, height: 150 },
  // Receipt sizes (width is fixed, height is variable)
  '58mm': { width: 58, height: 200 },
  '80mm': { width: 80, height: 200 },
  '75mm': { width: 75, height: 200 },
};
