import { useState, useCallback } from 'react';

// Document types for print configuration
export type DocumentType = 'invoice' | 'receipt' | 'label' | 'order' | 'report' | 'proforma' | 'receipt-a4' | 'correction';

interface UseSmartPrintOptions {
  documentType: DocumentType;
  onPrintStart?: () => void;
  onPrintEnd?: () => void;
  onPrintError?: (error: Error) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook do drukowania - używa window.print()
 */
export function useSmartPrint(options: UseSmartPrintOptions) {
  const [isPrinting, setIsPrinting] = useState(false);

  // Browser print - always used now
  const print = useCallback(async () => {
    if (options.onPrintStart) {
      options.onPrintStart();
    }
    setIsPrinting(true);

    try {
      // Use browser print
      window.print();
    } catch (error: any) {
      if (options.onPrintError) {
        options.onPrintError(error);
      }
      if (options.onError) {
        options.onError(error);
      }
    } finally {
      setIsPrinting(false);
      if (options.onPrintEnd) {
        options.onPrintEnd();
      }
    }
  }, [options]);

  const printElement = useCallback(async (element: HTMLElement) => {
    return print();
  }, [print]);

  return {
    print,
    printElement,
    isPrinting,
    isQzConfigured: false,  // QZ Tray removed
    printerName: null,      // QZ Tray removed
  };
}
