import { useState, useCallback, useEffect } from 'react';
import { printerService, DocumentType } from '../services/printerService';

interface UseSmartPrintOptions {
  documentType: DocumentType;
  onPrintStart?: () => void;
  onPrintSuccess?: () => void;
  onPrintError?: (error: string) => void;
}

interface UseSmartPrintResult {
  print: () => Promise<void>;
  printElement: (element: HTMLElement) => Promise<void>;
  isPrinting: boolean;
  isQzConfigured: boolean;
  isQzConnected: boolean;
  printerName: string | null;
}

/**
 * Hook do inteligentnego drukowania z obsługą QZ Tray
 * Automatycznie wybiera między QZ Tray a window.print()
 */
export function useSmartPrint({
  documentType,
  onPrintStart,
  onPrintSuccess,
  onPrintError,
}: UseSmartPrintOptions): UseSmartPrintResult {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isQzConnected, setIsQzConnected] = useState(false);
  const [isQzConfigured, setIsQzConfigured] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);

  // Sprawdź status QZ Tray
  useEffect(() => {
    const checkQzStatus = () => {
      const connected = printerService.isConnected();
      const printer = printerService.getPrinterForDocument(documentType);

      setIsQzConnected(connected);
      setIsQzConfigured(!!printer);
      setPrinterName(printer);
    };

    checkQzStatus();

    // Subskrybuj zmiany
    const unsubscribe = printerService.subscribe(checkQzStatus);
    return () => unsubscribe();
  }, [documentType]);

  // Drukuj aktualną stronę
  const print = useCallback(async () => {
    setIsPrinting(true);
    onPrintStart?.();

    try {
      // Sprawdź czy QZ Tray jest skonfigurowany dla tego typu dokumentu
      const printer = printerService.getPrinterForDocument(documentType);

      if (printer && printerService.isConnected()) {
        // Użyj QZ Tray
        const printContent = document.getElementById('print-content');
        if (printContent) {
          const success = await printerService.printElement(printContent, documentType);
          if (success) {
            onPrintSuccess?.();
          } else {
            // Fallback do window.print()
            window.print();
            onPrintSuccess?.();
          }
        } else {
          // Drukuj całą stronę
          const success = await printerService.printCurrentPage(documentType);
          if (success) {
            onPrintSuccess?.();
          } else {
            window.print();
            onPrintSuccess?.();
          }
        }
      } else {
        // Fallback do window.print()
        window.print();
        onPrintSuccess?.();
      }
    } catch (error: any) {
      console.error('Print error:', error);
      // W przypadku błędu, użyj window.print()
      try {
        window.print();
        onPrintSuccess?.();
      } catch (e) {
        onPrintError?.(error.message || 'Błąd drukowania');
      }
    } finally {
      setIsPrinting(false);
    }
  }, [documentType, onPrintStart, onPrintSuccess, onPrintError]);

  // Drukuj konkretny element
  const printElement = useCallback(async (element: HTMLElement) => {
    setIsPrinting(true);
    onPrintStart?.();

    try {
      const printer = printerService.getPrinterForDocument(documentType);

      if (printer && printerService.isConnected()) {
        const success = await printerService.printElement(element, documentType);
        if (success) {
          onPrintSuccess?.();
        } else {
          window.print();
          onPrintSuccess?.();
        }
      } else {
        window.print();
        onPrintSuccess?.();
      }
    } catch (error: any) {
      console.error('Print error:', error);
      try {
        window.print();
        onPrintSuccess?.();
      } catch (e) {
        onPrintError?.(error.message || 'Błąd drukowania');
      }
    } finally {
      setIsPrinting(false);
    }
  }, [documentType, onPrintStart, onPrintSuccess, onPrintError]);

  return {
    print,
    printElement,
    isPrinting,
    isQzConfigured,
    isQzConnected,
    printerName,
  };
}
