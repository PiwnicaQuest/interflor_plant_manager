import { useState, useEffect, useCallback, useRef } from "react";

// Document types that can be printed
export type DocumentType =
  | "barcode_labels"
  | "orders"
  | "invoices"
  | "receipts"
  | "inventory_reports"
  | "delivery_notes";

// Print Broker types
type BrokerDocumentType = "label" | "receipt" | "invoice" | "order" | "report" | "delivery_note";

interface PrintResult {
  success: boolean;
  method: "broker" | "browser";
  jobId?: string;
  error?: string;
}

interface BrokerStatus {
  online: boolean;
  version: string;
  printerCount: number;
}

interface UsePrintOptions {
  // If true, will always show browser print dialog (for preview)
  forceBrowserPrint?: boolean;
  // If true, skip broker and use browser
  skipBroker?: boolean;
  // Callback when print job is sent to broker
  onBrokerPrint?: (jobId: string) => void;
  // Callback when falling back to browser print
  onBrowserPrint?: () => void;
  // Callback on error
  onError?: (error: string) => void;
}

// Print Broker configuration
const BROKER_BASE_URL = "http://127.0.0.1:19432";
const BROKER_TIMEOUT = 2000; // 2 seconds timeout for broker check
const BROKER_CHECK_INTERVAL = 30000; // Check broker status every 30 seconds

// Map DocumentType to Broker document type
const DOC_TYPE_MAP: Record<DocumentType, BrokerDocumentType> = {
  barcode_labels: "label",
  orders: "order",
  invoices: "invoice",
  receipts: "receipt",
  inventory_reports: "report",
  delivery_notes: "delivery_note",
};

// Map DocumentType to paper size
const DEFAULT_PAPER_SIZE: Record<DocumentType, string> = {
  barcode_labels: "50x30mm",
  orders: "A4",
  invoices: "A4",
  receipts: "75mm",
  inventory_reports: "A4",
  delivery_notes: "A4",
};

// Base print styles that work for all documents
const getBasePrintStyles = (documentType: DocumentType): string => {
  const isReceipt = documentType === "receipts";
  const isLabel = documentType === "barcode_labels";

  if (isReceipt) {
    return `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          width: 72mm;
          margin: 0;
          padding: 0;
          font-family: "Courier New", Courier, monospace;
          font-size: 12px;
          line-height: 1.3;
          color: #000;
          background: #fff;
        }
        @media print {
          @page {
            size: 72mm auto;
            margin: 2mm;
          }
          html, body {
            width: 72mm;
          }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      </style>
    `;
  }

  if (isLabel) {
    return `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          font-size: 10px;
          color: #000;
          background: #fff;
        }
        @media print {
          @page {
            margin: 0;
          }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      </style>
    `;
  }

  // Default A4 styles (invoices, orders, etc.)
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html, body {
        width: 210mm;
        margin: 0;
        padding: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 11px;
        line-height: 1.4;
        color: #1f2937;
        background: #fff;
      }
      @media print {
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        html, body {
          width: 210mm;
          height: 297mm;
        }
        .no-print { display: none !important; }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
      }
    </style>
  `;
};

// ============================================
// Print Broker Functions
// ============================================

/**
 * Check if Print Broker is running locally
 */
async function checkBrokerStatus(): Promise<BrokerStatus | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BROKER_TIMEOUT);

    const response = await fetch(`${BROKER_BASE_URL}/status`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      online: data.online ?? true,
      version: data.version ?? "unknown",
      printerCount: data.printerCount ?? 0,
    };
  } catch (error) {
    // Broker not available (connection refused, timeout, etc.)
    return null;
  }
}

/**
 * Send print job to local Print Broker
 */
async function sendToBroker(
  documentType: DocumentType,
  htmlContent: string,
  options?: {
    printer?: string;
    copies?: number;
    paperSize?: string;
    title?: string;
  }
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const brokerDocType = DOC_TYPE_MAP[documentType];
    const paperSize = options?.paperSize || DEFAULT_PAPER_SIZE[documentType];

    // Wrap HTML with proper styles
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${getBasePrintStyles(documentType)}
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

    const response = await fetch(`${BROKER_BASE_URL}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: brokerDocType,
        contentType: "html",
        content: fullHtml,
        printer: options?.printer,
        copies: options?.copies || 1,
        paperSize: paperSize,
        title: options?.title,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || "Błąd Print Broker",
      };
    }

    return {
      success: true,
      jobId: data.jobId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Nie można połączyć z Print Broker",
    };
  }
}

/**
 * Get available printers from Print Broker
 */
export async function getBrokerPrinters(): Promise<
  { name: string; displayName: string; category: string; isDefault: boolean }[]
> {
  try {
    const response = await fetch(`${BROKER_BASE_URL}/printers`, {
      method: "GET",
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.printers || [];
  } catch {
    return [];
  }
}

// ============================================
// Main Hook
// ============================================

export function usePrint(options: UsePrintOptions = {}) {
  const [loading, setLoading] = useState(true);
  const [lastResult, setLastResult] = useState<PrintResult | null>(null);
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(null);
  const [brokerChecking, setBrokerChecking] = useState(false);

  const brokerCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Check broker status
  const checkBroker = useCallback(async () => {
    if (brokerChecking) return brokerStatus;

    setBrokerChecking(true);
    const status = await checkBrokerStatus();
    setBrokerStatus(status);
    setBrokerChecking(false);

    return status;
  }, [brokerChecking, brokerStatus]);

  // Check broker on mount
  useEffect(() => {
    const init = async () => {
      await checkBroker();
      setLoading(false);
    };

    init();

    // Periodically check broker status
    brokerCheckRef.current = setInterval(() => {
      checkBroker();
    }, BROKER_CHECK_INTERVAL);

    return () => {
      if (brokerCheckRef.current) {
        clearInterval(brokerCheckRef.current);
      }
    };
  }, []);

  // Check if broker is available
  const isBrokerAvailable = useCallback((): boolean => {
    return brokerStatus?.online === true;
  }, [brokerStatus]);

  // Main print function
  const print = useCallback(
    async (
      documentType: DocumentType,
      htmlContent: string,
      printOptions?: {
        title?: string;
        sourceType?: string;
        sourceId?: number;
        printer?: string;
        copies?: number;
        paperSize?: string;
        windowFeatures?: string;
      }
    ): Promise<PrintResult> => {
      const {
        forceBrowserPrint,
        skipBroker,
        onBrokerPrint,
        onBrowserPrint,
        onError,
      } = options;

      // ========================================
      // 1. Try Print Broker first (if available)
      // ========================================
      if (!forceBrowserPrint && !skipBroker) {
        // Check broker status (use cached or refresh)
        let status = brokerStatus;
        if (!status) {
          status = await checkBroker();
        }

        if (status?.online) {
          console.log("[usePrint] Using Print Broker...");

          const brokerResult = await sendToBroker(documentType, htmlContent, {
            title: printOptions?.title,
            printer: printOptions?.printer,
            copies: printOptions?.copies,
            paperSize: printOptions?.paperSize,
          });

          if (brokerResult.success) {
            const result: PrintResult = {
              success: true,
              method: "broker",
              jobId: brokerResult.jobId,
            };
            setLastResult(result);
            onBrokerPrint?.(brokerResult.jobId || "");
            console.log("[usePrint] Print Broker job sent:", brokerResult.jobId);
            return result;
          } else {
            console.warn("[usePrint] Print Broker failed:", brokerResult.error);
            // Continue to browser fallback
          }
        }
      }

      // ========================================
      // 2. Browser print fallback
      // ========================================
      try {
        console.log("[usePrint] Using browser print...");

        const title = printOptions?.title || "Wydruk";
        const baseStyles = getBasePrintStyles(documentType);

        const fullHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            ${baseStyles}
          </head>
          <body>
            ${htmlContent}
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 500);
              };

            </script>

          </body>
          </html>
        `;

        const printWindow = window.open(
          "",
          "_blank",
          printOptions?.windowFeatures || "width=900,height=700"
        );

        if (!printWindow) {
          const result: PrintResult = {
            success: false,
            method: "browser",
            error: "Nie można otworzyć okna drukowania. Sprawdź blokadę popup.",
          };
          setLastResult(result);
          onError?.(result.error!);
          return result;
        }

        printWindow.document.write(fullHtml);
        printWindow.document.close();

        const result: PrintResult = {
          success: true,
          method: "browser",
        };

        setLastResult(result);
        onBrowserPrint?.();
        return result;
      } catch (error: any) {
        const result: PrintResult = {
          success: false,
          method: "browser",
          error: error.message || "Błąd drukowania",
        };
        setLastResult(result);
        onError?.(result.error!);
        return result;
      }
    },
    [options, brokerStatus, checkBroker]
  );

  // Print barcodes specifically
  const printBarcodes = useCallback(
    async (
      htmlContent: string,
      opts?: { title?: string; productId?: number; copies?: number }
    ): Promise<PrintResult> => {
      return print("barcode_labels", htmlContent, {
        title: opts?.title || "Etykiety",
        sourceType: "product",
        sourceId: opts?.productId,
        copies: opts?.copies,
      });
    },
    [print]
  );

  // Print invoice
  const printInvoice = useCallback(
    async (
      htmlContent: string,
      opts?: { title?: string; invoiceId?: number }
    ): Promise<PrintResult> => {
      return print("invoices", htmlContent, {
        title: opts?.title || "Faktura",
        sourceType: "invoice",
        sourceId: opts?.invoiceId,
      });
    },
    [print]
  );

  // Print order
  const printOrder = useCallback(
    async (
      htmlContent: string,
      opts?: { title?: string; orderId?: number }
    ): Promise<PrintResult> => {
      return print("orders", htmlContent, {
        title: opts?.title || "Zamówienie",
        sourceType: "order",
        sourceId: opts?.orderId,
      });
    },
    [print]
  );

  // Print receipt
  const printReceipt = useCallback(
    async (
      htmlContent: string,
      opts?: { title?: string; orderId?: number }
    ): Promise<PrintResult> => {
      return print("receipts", htmlContent, {
        title: opts?.title || "Paragon",
        sourceType: "order",
        sourceId: opts?.orderId,
      });
    },
    [print]
  );

  // Print delivery note
  const printDeliveryNote = useCallback(
    async (
      htmlContent: string,
      opts?: { title?: string; orderId?: number }
    ): Promise<PrintResult> => {
      return print("delivery_notes", htmlContent, {
        title: opts?.title || "List przewozowy",
        sourceType: "order",
        sourceId: opts?.orderId,
      });
    },
    [print]
  );


  // Print invoice from PDF (fetches PDF from backend)
  const printInvoicePdf = useCallback(
    async (
      invoiceId: number,
      opts?: { title?: string }
    ): Promise<PrintResult> => {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");

      try {
        const response = await fetch(`${API_URL}/invoices/${invoiceId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Nie można pobrać PDF faktury");
        }

        const blob = await response.blob();

        let status = brokerStatus;
        if (!status) {
          status = await checkBroker();
        }

        if (status?.online) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const brokerResponse = await fetch(`${BROKER_BASE_URL}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentType: "invoice",
              contentType: "pdf",
              content: base64,
              copies: 1,
              paperSize: "A4",
              title: opts?.title,
            }),
          });

          const data = await brokerResponse.json();
          if (brokerResponse.ok && data.success) {
            const result: PrintResult = { success: true, method: "broker", jobId: data.jobId };
            setLastResult(result);
            return result;
          }
        }

        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, "_blank");
        if (printWindow) {
          printWindow.onload = () => setTimeout(() => { printWindow.print(); setTimeout(() => { try { printWindow.close(); } catch(e) {} }, 1000); }, 500);
        }

        const result: PrintResult = { success: true, method: "browser" };
        setLastResult(result);
        return result;

      } catch (error: any) {
        const result: PrintResult = { success: false, method: "browser", error: error.message || "Błąd drukowania PDF" };
        setLastResult(result);
        return result;
      }
    },
    [brokerStatus, checkBroker]
  );

  const printReceiptPdf = useCallback(
    async (
      receiptId: number,
      opts?: { title?: string }
    ): Promise<PrintResult> => {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");

      try {
        const response = await fetch(`${API_URL}/receipts/${receiptId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Nie mozna pobrac PDF paragonu");
        }

        const blob = await response.blob();

        let status = brokerStatus;
        if (!status) {
          status = await checkBroker();
        }

        if (status?.online) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const brokerResponse = await fetch(`${BROKER_BASE_URL}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentType: "receipt",
              contentType: "pdf",
              content: base64,
              copies: 1,
              paperSize: "A4",
              title: opts?.title,
            }),
          });

          const data = await brokerResponse.json();
          if (brokerResponse.ok && data.success) {
            const result: PrintResult = { success: true, method: "broker", jobId: data.jobId };
            setLastResult(result);
            return result;
          }
        }

        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, "_blank");
        if (printWindow) {
          printWindow.onload = () => setTimeout(() => { printWindow.print(); setTimeout(() => { try { printWindow.close(); } catch(e) {} }, 1000); }, 500);
        }

        const result: PrintResult = { success: true, method: "browser" };
        setLastResult(result);
        return result;

      } catch (error: any) {
        const result: PrintResult = { success: false, method: "browser", error: error.message || "Blad drukowania PDF" };
        setLastResult(result);
        return result;
      }
    },
    [brokerStatus, checkBroker]
  );

  const printProformaPdf = useCallback(
    async (
      proformaId: number,
      opts?: { title?: string }
    ): Promise<PrintResult> => {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");

      try {
        const response = await fetch(`${API_URL}/proforma/${proformaId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Nie mozna pobrac PDF pro formy");
        }

        const blob = await response.blob();

        let status = brokerStatus;
        if (!status) {
          status = await checkBroker();
        }

        if (status?.online) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const brokerResponse = await fetch(`${BROKER_BASE_URL}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentType: "proforma",
              contentType: "pdf",
              content: base64,
              copies: 1,
              paperSize: "A4",
              title: opts?.title,
            }),
          });

          const data = await brokerResponse.json();
          if (brokerResponse.ok && data.success) {
            const result: PrintResult = { success: true, method: "broker", jobId: data.jobId };
            setLastResult(result);
            return result;
          }
        }

        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, "_blank");
        if (printWindow) {
          printWindow.onload = () => setTimeout(() => { printWindow.print(); setTimeout(() => { try { printWindow.close(); } catch(e) {} }, 1000); }, 500);
        }

        const result: PrintResult = { success: true, method: "browser" };
        setLastResult(result);
        return result;

      } catch (error: any) {
        const result: PrintResult = { success: false, method: "browser", error: error.message || "Blad drukowania PDF" };
        setLastResult(result);
        return result;
      }
    },
    [brokerStatus, checkBroker]
  );

  const printOrderPdf = useCallback(
    async (
      orderId: number,
      opts?: { title?: string }
    ): Promise<PrintResult> => {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");

      try {
        const response = await fetch(`${API_URL}/orders/${orderId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Nie mozna pobrac PDF zamowienia");
        }

        const blob = await response.blob();

        let status = brokerStatus;
        if (!status) {
          status = await checkBroker();
        }

        if (status?.online) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const brokerResponse = await fetch(`${BROKER_BASE_URL}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentType: "order",
              contentType: "pdf",
              content: base64,
              copies: 1,
              paperSize: "A4",
              title: opts?.title,
            }),
          });

          const data = await brokerResponse.json();
          if (brokerResponse.ok && data.success) {
            const result: PrintResult = { success: true, method: "broker", jobId: data.jobId };
            setLastResult(result);
            return result;
          }
        }

        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, "_blank");
        if (printWindow) {
          printWindow.onload = () => setTimeout(() => { printWindow.print(); setTimeout(() => { try { printWindow.close(); } catch(e) {} }, 1000); }, 500);
        }

        const result: PrintResult = { success: true, method: "browser" };
        setLastResult(result);
        return result;

      } catch (error: any) {
        const result: PrintResult = { success: false, method: "browser", error: error.message || "Blad drukowania PDF" };
        setLastResult(result);
        return result;
      }
    },
    [brokerStatus, checkBroker]
  );

  return {
    // State
    loading,
    lastResult,
    brokerStatus,

    // Helpers
    isBrokerAvailable,
    checkBroker,

    // Print functions
    print,
    printBarcodes,
    printInvoice,
    printOrder,
    printReceipt,
    printDeliveryNote,
    printInvoicePdf,
    printReceiptPdf,
    printProformaPdf,
    printOrderPdf,
  };
}

// ============================================
// Standalone functions
// ============================================

/**
 * Check if Print Broker is available (for use outside React)
 */
export async function isPrintBrokerAvailable(): Promise<boolean> {
  const status = await checkBrokerStatus();
  return status?.online === true;
}

/**
 * Send print job directly to Print Broker (for use outside React)
 */
export async function printViaBroker(
  documentType: DocumentType,
  htmlContent: string,
  options?: {
    title?: string;
    printer?: string;
    copies?: number;
    paperSize?: string;
  }
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  const status = await checkBrokerStatus();

  if (!status?.online) {
    return {
      success: false,
      error: "Print Broker nie jest dostępny",
    };
  }

  return sendToBroker(documentType, htmlContent, options);
}
