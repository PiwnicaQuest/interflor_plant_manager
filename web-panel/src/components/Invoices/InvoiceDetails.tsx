import { useState, useEffect } from "react";
import { Invoice, PaymentStatus, PaymentMethod } from "../../types";
import { API } from "../../services/api";

interface InvoiceDetailsProps {
  invoice: Invoice;
  onClose: () => void;
  onUpdatePayment: (invoice: Invoice) => void;
  onRefresh?: () => void;
}

// Print Broker configuration
const BROKER_BASE_URL = "http://127.0.0.1:19432";
const BROKER_TIMEOUT = 2000;

// Check if Print Broker is available
async function checkBrokerStatus(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BROKER_TIMEOUT);
    const response = await fetch(`${BROKER_BASE_URL}/status`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

// Send PDF to Print Broker
async function sendPdfToBroker(
  pdfBase64: string,
  options?: { printer?: string; copies?: number; title?: string }
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const response = await fetch(`${BROKER_BASE_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentType: "invoice",
        contentType: "pdf",
        content: pdfBase64,
        printer: options?.printer,
        copies: options?.copies || 1,
        paperSize: "A4",
        title: options?.title,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return { success: false, error: data.error || "Błąd Print Broker" };
    }
    return { success: true, jobId: data.jobId };
  } catch (error: any) {
    return { success: false, error: error.message || "Nie można połączyć z Print Broker" };
  }
}

// Fetch PDF from backend and convert to base64
async function fetchInvoicePdfAsBase64(invoiceId: number): Promise<string> {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const token = localStorage.getItem("token");
  
  const response = await fetch(`${API_URL}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Nie można pobrać PDF faktury");
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Open PDF in browser for printing
async function openPdfInBrowser(invoiceId: number, invoiceNumber: string): Promise<void> {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const token = localStorage.getItem("token");
  
  const response = await fetch(`${API_URL}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Nie można pobrać PDF faktury");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  
  // Open in new window with print dialog
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }
}

export function InvoiceDetails({ invoice, onClose, onUpdatePayment, onRefresh }: InvoiceDetailsProps) {
  const [printStatus, setPrintStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isEditingPaymentMethod, setIsEditingPaymentMethod] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(invoice.paymentMethod || PaymentMethod.TRANSFER);
  const [isUpdatingPaymentMethod, setIsUpdatingPaymentMethod] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice>(invoice);
  const [brokerAvailable, setBrokerAvailable] = useState<boolean | null>(null);

  // Check broker status on mount
  useEffect(() => {
    checkBrokerStatus().then(setBrokerAvailable);
  }, []);

  const handleUpdatePaymentMethod = async () => {
    if (selectedPaymentMethod === currentInvoice.paymentMethod) {
      setIsEditingPaymentMethod(false);
      return;
    }

    setIsUpdatingPaymentMethod(true);
    try {
      const result = await API.updateInvoicePaymentMethod(currentInvoice.id, selectedPaymentMethod);
      setCurrentInvoice(result.invoice);
      setIsEditingPaymentMethod(false);
      setPrintStatus({
        type: "success",
        message: "Forma płatności została zmieniona" + (result.invoice.paymentStatus === "paid" ? " i faktura oznaczona jako opłacona" : ""),
      });
      setTimeout(() => setPrintStatus(null), 5000);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Error updating payment method:", error);
      setPrintStatus({ type: "error", message: "Błąd podczas zmiany formy płatności" });
    } finally {
      setIsUpdatingPaymentMethod(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pl-PL");
  };

  const getPaymentMethodLabel = (method?: string) => {
    const labels: Record<string, string> = { card: "Karta", cash: "Gotówka", transfer: "Przelew" };
    return method ? labels[method] || method : "Nie określono";
  };

  const getPaymentStatusLabel = (status: PaymentStatus): string => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: "Nieopłacona",
      [PaymentStatus.PARTIALLY_PAID]: "Częściowo opłacona",
      [PaymentStatus.PAID]: "Opłacona",
      [PaymentStatus.OVERDUE]: "Po terminie",
    };
    return labels[status];
  };

  const getPaymentStatusColor = (status: PaymentStatus): string => {
    const colors: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: "text-red-700 bg-red-100",
      [PaymentStatus.PARTIALLY_PAID]: "text-yellow-700 bg-yellow-100",
      [PaymentStatus.PAID]: "text-primary-700 bg-green-100",
      [PaymentStatus.OVERDUE]: "text-red-900 bg-red-200",
    };
    return colors[status];
  };

  // Main print handler - uses PDF from backend
  const handlePrint = async () => {
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      // Try Print Broker first if available
      if (brokerAvailable) {
        console.log("[InvoiceDetails] Using Print Broker for PDF printing...");
        const pdfBase64 = await fetchInvoicePdfAsBase64(invoice.id);
        const result = await sendPdfToBroker(pdfBase64, {
          title: `Faktura ${invoice.invoiceNumber}`,
        });

        if (result.success) {
          setPrintStatus({
            type: "success",
            message: `Wysłano do drukarki (job: ${result.jobId?.slice(0, 8)}...)`,
          });
          setTimeout(() => setPrintStatus(null), 5000);
          setIsPrinting(false);
          return;
        }
        console.warn("[InvoiceDetails] Print Broker failed:", result.error);
      }

      // Fallback to browser print
      console.log("[InvoiceDetails] Using browser print fallback...");
      await openPdfInBrowser(invoice.id, invoice.invoiceNumber || "");
      setPrintStatus({ type: "info", message: "Otwarto PDF do druku w przeglądarce" });
      setTimeout(() => setPrintStatus(null), 3000);

    } catch (error: any) {
      console.error("[InvoiceDetails] Print error:", error);
      setPrintStatus({ type: "error", message: error.message || "Błąd drukowania" });
    } finally {
      setIsPrinting(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");
      
      const response = await fetch(`${API_URL}/invoices/${invoice.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Nie można pobrać PDF");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faktura-${invoice.invoiceNumber || invoice.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setPrintStatus({ type: "error", message: error.message || "Błąd pobierania PDF" });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Faktura {invoice.invoiceNumber}</h2>
              <p className="text-sm text-gray-500 mt-1">Wystawiono: {formatDate(invoice.issueDate)}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>

          {/* Print status notification */}
          {printStatus && (
            <div className={"mb-4 px-4 py-3 rounded-lg text-sm " + (
              printStatus.type === "success" ? "bg-green-100 text-green-800 border border-green-200" :
              printStatus.type === "error" ? "bg-red-100 text-red-800 border border-red-200" :
              "bg-blue-100 text-blue-800 border border-blue-200"
            )}>
              {printStatus.message}
            </div>
          )}

          {/* Printer status indicator */}
          <div className="mb-4 flex items-center gap-2 text-sm">
            <div className={"w-2 h-2 rounded-full " + (brokerAvailable ? "bg-primary-500" : "bg-gray-400")}></div>
            <span className={brokerAvailable ? "text-primary-700" : "text-gray-600"}>
              {brokerAvailable === null ? "Sprawdzanie Print Broker..." :
               brokerAvailable ? "Print Broker dostępny - automatyczny wydruk PDF" :
               "Print Broker niedostępny - wydruk przez przeglądarkę"}
            </span>
          </div>

          {/* Customer Info */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Dane nabywcy</h3>
            <div className="text-sm text-gray-700">
              <p><strong>Nazwa:</strong> {invoice.customerName || "Brak danych"}</p>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Szczegóły faktury</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <p><strong>Data sprzedaży:</strong> {formatDate(invoice.saleDate)}</p>
                {invoice.paymentDeadline && (
                  <p><strong>Termin płatności:</strong> {formatDate(invoice.paymentDeadline)}</p>
                )}
                <div className="flex items-center gap-2">
                  <strong>Metoda płatności:</strong>
                  {isEditingPaymentMethod ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedPaymentMethod}
                        onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                        disabled={isUpdatingPaymentMethod}
                      >
                        <option value="cash">Gotówka</option>
                        <option value="card">Karta</option>
                        <option value="transfer">Przelew</option>
                      </select>
                      <button
                        onClick={handleUpdatePaymentMethod}
                        disabled={isUpdatingPaymentMethod}
                        className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        {isUpdatingPaymentMethod ? "..." : "Zapisz"}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingPaymentMethod(false);
                          setSelectedPaymentMethod(currentInvoice.paymentMethod || PaymentMethod.TRANSFER);
                        }}
                        disabled={isUpdatingPaymentMethod}
                        className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        Anuluj
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => setIsEditingPaymentMethod(true)}
                      className="cursor-pointer hover:text-primary-600 hover:underline"
                      title="Kliknij aby zmienić"
                    >
                      {getPaymentMethodLabel(currentInvoice.paymentMethod)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Powiązania</h3>
              <div className="text-sm text-gray-700 space-y-1">
                {invoice.orderId && <p><strong>Zamówienie:</strong> #{invoice.orderId}</p>}
                {invoice.customerId && <p><strong>ID Klienta:</strong> {invoice.customerId}</p>}
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Status płatności</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Status:</span>
                <span className={"px-3 py-1 rounded-full text-xs font-semibold " + getPaymentStatusColor(invoice.paymentStatus)}>
                  {getPaymentStatusLabel(invoice.paymentStatus)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Zapłacono:</span>
                <span className="font-semibold text-gray-900">{(Number(invoice.paidAmount) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-sm text-gray-600">Pozostało do zapłaty:</span>
                <span className="font-bold text-primary-600">
                  {((Number(invoice.totalGross) || 0) - (Number(invoice.paidAmount) || 0)).toFixed(2)} PLN
                </span>
              </div>
            </div>
          </div>

          {/* Invoice Items */}
          {invoice.items && invoice.items.length > 0 && (
            <div className="card p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Pozycje faktury</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2">Opis</th>
                      <th className="text-right py-2 px-2">Ilość</th>
                      <th className="text-right py-2 px-2">Cena netto</th>
                      <th className="text-right py-2 px-2">VAT</th>
                      <th className="text-right py-2 px-2">Wartość netto</th>
                      <th className="text-right py-2 px-2">Wartość brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, index) => (
                      <tr key={item.id || index} className="border-b border-gray-100">
                        <td className="py-2 px-2">{item.description}</td>
                        <td className="text-right py-2 px-2">{item.quantity}</td>
                        <td className="text-right py-2 px-2">{(Number(item.unitPriceNet) || 0).toFixed(2)} PLN</td>
                        <td className="text-right py-2 px-2">{Number(item.vatRate) || 0}%</td>
                        <td className="text-right py-2 px-2">{(Number(item.totalNet) || (Number(item.unitPriceNet) * item.quantity)).toFixed(2)} PLN</td>
                        <td className="text-right py-2 px-2 font-medium">{(Number(item.totalGross) || ((Number(item.unitPriceNet) * item.quantity) * (1 + (Number(item.vatRate) || 0) / 100))).toFixed(2)} PLN</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Suma netto:</span>
                <span className="font-medium">{(Number(invoice.subtotalNet) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">VAT:</span>
                <span className="font-medium">{(Number(invoice.totalVat) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="border-t border-gray-300 pt-2 flex justify-between text-xl font-bold">
                <span>Suma brutto:</span>
                <span className="text-primary-600">{(Number(invoice.totalGross) || 0).toFixed(2)} PLN</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="card p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Notatki</h3>
              <p className="text-sm text-gray-700">{invoice.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="btn btn-outline disabled:opacity-50"
            >
              {isPrinting ? "Drukowanie..." : "Drukuj fakturę"}
            </button>
            <button
              onClick={handleDownloadPdf}
              className="btn btn-secondary"
            >
              Pobierz PDF
            </button>
            <button
              onClick={() => onUpdatePayment(invoice)}
              className="btn btn-primary"
            >
              Aktualizuj płatność
            </button>
            <button onClick={onClose} className="btn btn-secondary flex-1">
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
