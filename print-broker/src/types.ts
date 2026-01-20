/**
 * PlantManager Print Broker - Type Definitions
 */

// Printer categories
export type PrinterCategory = "thermal_label" | "thermal_receipt" | "standard" | "unknown";

// Document types
export type DocumentType = "label" | "receipt" | "invoice" | "order" | "report" | "delivery_note";

// Content types
export type ContentType = "html" | "pdf" | "zpl" | "tspl" | "raw" | "image";

// Printer info
export interface PrinterInfo {
  name: string;
  displayName: string;
  category: PrinterCategory;
  isDefault: boolean;
  isOnline: boolean;
  driver?: string;
}

// Print request
export interface PrintRequest {
  documentType: DocumentType;
  content: string;
  contentType: ContentType;
  printer?: string;
  copies?: number;
  paperSize?: string;
  title?: string;
}

// Print response
export interface PrintResponse {
  success: boolean;
  message: string;
  jobId?: string;
  error?: string;
}

// Broker status
export interface BrokerStatus {
  online: boolean;
  version: string;
  hostname: string;
  platform: string;
  printerCount: number;
  uptime: number;
}

// Broker config
export interface BrokerConfig {
  port: number;
  allowedOrigins: string[];
  defaultPrinters: {
    label?: string;
    receipt?: string;
    document?: string;
  };
  autoStart: boolean;
}

// Paper sizes (in mm)
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  // Standard
  "A4": { width: 210, height: 297 },
  "A5": { width: 148, height: 210 },
  "Letter": { width: 216, height: 279 },
  // Labels
  "50x30mm": { width: 50, height: 30 },
  "57x30mm": { width: 57, height: 30 },
  "100x50mm": { width: 100, height: 50 },
  "100x150mm": { width: 100, height: 150 },
  // Receipts
  "58mm": { width: 58, height: 297 },
  "75mm": { width: 75, height: 297 },
  "80mm": { width: 80, height: 297 },
};

// Document type to printer category mapping
export const DOC_TYPE_TO_CATEGORY: Record<DocumentType, PrinterCategory> = {
  label: "thermal_label",
  receipt: "thermal_receipt",
  invoice: "standard",
  order: "standard",
  report: "standard",
  delivery_note: "standard",
};
