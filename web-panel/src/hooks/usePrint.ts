import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

// Document types that can be printed
export type DocumentType =
  | 'barcode_labels'
  | 'orders'
  | 'invoices'
  | 'receipts'
  | 'inventory_reports'
  | 'delivery_notes';

interface PrinterConfig {
  id: number;
  documentType: DocumentType;
  agentId: string | null;
  printerName: string | null;
  paperSize: string;
  copies: number;
  orientation: string;
  colorMode: string;
  isActive: boolean;
}

interface PrintResult {
  success: boolean;
  method: 'queue' | 'browser';
  jobId?: string;
  error?: string;
}

interface UsePrintOptions {
  // If true, will always show browser print dialog (for preview)
  forceBrowserPrint?: boolean;
  // Callback when print job is queued
  onQueued?: (jobId: string) => void;
  // Callback when falling back to browser print
  onBrowserPrint?: () => void;
  // Callback on error
  onError?: (error: string) => void;
}

export function usePrint(options: UsePrintOptions = {}) {
  const [configs, setConfigs] = useState<PrinterConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastResult, setLastResult] = useState<PrintResult | null>(null);

  // Fetch printer configurations on mount
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const result = await api.getPrintConfigs();
        setConfigs(result.configs || []);
      } catch (error) {
        console.error('Failed to fetch print configs:', error);
        setConfigs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchConfigs();
  }, []);

  // Check if a document type has a configured printer
  const hasConfiguredPrinter = useCallback((documentType: DocumentType): boolean => {
    const config = configs.find(c => c.documentType === documentType);
    return !!(config?.agentId && config?.isActive !== false);
  }, [configs]);

  // Get config for a document type
  const getConfig = useCallback((documentType: DocumentType): PrinterConfig | undefined => {
    return configs.find(c => c.documentType === documentType);
  }, [configs]);

  // Main print function
  const print = useCallback(async (
    documentType: DocumentType,
    htmlContent: string,
    printOptions?: {
      title?: string;
      sourceType?: string;
      sourceId?: number;
      // For browser fallback - open in new window
      windowFeatures?: string;
    }
  ): Promise<PrintResult> => {
    const { forceBrowserPrint, onQueued, onBrowserPrint, onError } = options;

    // Check if we should use print queue
    const config = getConfig(documentType);
    const useQueue = !forceBrowserPrint && config?.agentId && config?.isActive !== false;

    if (useQueue) {
      // Send to print queue - Print Agent will handle it
      try {
        const response = await api.createPrintJob({
          documentType,
          contentType: 'html',
          content: htmlContent,
          title: printOptions?.title,
          sourceType: printOptions?.sourceType,
          sourceId: printOptions?.sourceId,
        });

        const result: PrintResult = {
          success: true,
          method: 'queue',
          jobId: response.job?.jobId,
        };

        setLastResult(result);
        onQueued?.(response.job?.jobId);

        console.log('Print job queued: ' + response.job?.jobId + ' -> ' + (config.printerName || 'default printer'));
        return result;

      } catch (error: any) {
        const errorMsg = error.response?.data?.error || error.message || 'Blad wysylania do kolejki druku';
        console.error('Print queue error:', errorMsg);
        onError?.(errorMsg);

        // Fall back to browser print on queue error
        console.log('Falling back to browser print...');
      }
    }

    // Browser print fallback
    try {
      const printWindow = window.open('', '_blank', printOptions?.windowFeatures || 'width=800,height=600');

      if (!printWindow) {
        const result: PrintResult = {
          success: false,
          method: 'browser',
          error: 'Nie mozna otworzyc okna drukowania. Sprawdz blokade popup.',
        };
        setLastResult(result);
        onError?.(result.error!);
        return result;
      }

      // Write content to new window
      const title = printOptions?.title || 'Wydruk';
      printWindow.document.write(
        '<!DOCTYPE html><html><head><title>' + title + '</title>' +
        '<style>@media print { body { margin: 0; padding: 0; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }</style>' +
        '</head><body>' + htmlContent +
        '<script>setTimeout(function() { window.print(); window.close(); }, 300);</script>' +
        '</body></html>'
      );
      printWindow.document.close();

      const result: PrintResult = {
        success: true,
        method: 'browser',
      };

      setLastResult(result);
      onBrowserPrint?.();
      return result;

    } catch (error: any) {
      const result: PrintResult = {
        success: false,
        method: 'browser',
        error: error.message || 'Blad drukowania',
      };
      setLastResult(result);
      onError?.(result.error!);
      return result;
    }
  }, [configs, options, getConfig]);

  // Print barcodes specifically
  const printBarcodes = useCallback(async (
    htmlContent: string,
    opts?: { title?: string; productId?: number }
  ): Promise<PrintResult> => {
    return print('barcode_labels', htmlContent, {
      title: opts?.title || 'Etykiety',
      sourceType: 'product',
      sourceId: opts?.productId,
    });
  }, [print]);

  // Print invoice
  const printInvoice = useCallback(async (
    htmlContent: string,
    opts?: { title?: string; invoiceId?: number }
  ): Promise<PrintResult> => {
    return print('invoices', htmlContent, {
      title: opts?.title || 'Faktura',
      sourceType: 'invoice',
      sourceId: opts?.invoiceId,
    });
  }, [print]);

  // Print order
  const printOrder = useCallback(async (
    htmlContent: string,
    opts?: { title?: string; orderId?: number }
  ): Promise<PrintResult> => {
    return print('orders', htmlContent, {
      title: opts?.title || 'Zamowienie',
      sourceType: 'order',
      sourceId: opts?.orderId,
    });
  }, [print]);

  // Print receipt
  const printReceipt = useCallback(async (
    htmlContent: string,
    opts?: { title?: string; orderId?: number }
  ): Promise<PrintResult> => {
    return print('receipts', htmlContent, {
      title: opts?.title || 'Paragon',
      sourceType: 'order',
      sourceId: opts?.orderId,
    });
  }, [print]);

  // Print delivery note
  const printDeliveryNote = useCallback(async (
    htmlContent: string,
    opts?: { title?: string; orderId?: number }
  ): Promise<PrintResult> => {
    return print('delivery_notes', htmlContent, {
      title: opts?.title || 'List przewozowy',
      sourceType: 'order',
      sourceId: opts?.orderId,
    });
  }, [print]);

  return {
    // State
    loading,
    configs,
    lastResult,

    // Helpers
    hasConfiguredPrinter,
    getConfig,

    // Print functions
    print,
    printBarcodes,
    printInvoice,
    printOrder,
    printReceipt,
    printDeliveryNote,
  };
}

// Standalone function for use outside of React components
export async function sendToPrintQueue(
  documentType: DocumentType,
  htmlContent: string,
  options?: {
    title?: string;
    sourceType?: string;
    sourceId?: number;
  }
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const response = await api.createPrintJob({
      documentType,
      contentType: 'html',
      content: htmlContent,
      title: options?.title,
      sourceType: options?.sourceType,
      sourceId: options?.sourceId,
    });

    return {
      success: true,
      jobId: response.job?.jobId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
}
