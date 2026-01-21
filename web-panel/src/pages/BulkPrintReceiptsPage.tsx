import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import ReactDOMServer from 'react-dom/server';

import { ReceiptTemplate } from '../components/Print/ReceiptTemplate';
import { Receipt, Order } from '../types';

const BROKER_URL = "http://127.0.0.1:19432";

interface CompanySettings {
  companyName: string;
  nip: string;
  street: string;
  postalCode: string;
  city: string;
  phone?: string;
  email?: string;
}

export function BulkPrintReceiptsPage() {
  const [searchParams] = useSearchParams();
  const [receiptsData, setReceiptsData] = useState<Array<{ receipt: Receipt; order?: Order }>>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"pending" | "success" | "fallback">("pending");
  const printAttempted = useRef(false);

  const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean) || [];

  useEffect(() => {
    const fetchData = async () => {
      if (ids.length === 0) {
        setError('Nie podano ID paragonów');
        setLoading(false);
        return;
      }

      try {
        const [receiptsResults, settingsResult] = await Promise.all([
          Promise.all(
            ids.map(async (id) => {
              const receiptResponse = await api.getReceipt(id);
              let order: Order | undefined;
              if (receiptResponse.receipt.orderId) {
                try {
                  const orderResponse = await api.getOrder(receiptResponse.receipt.orderId);
                  order = orderResponse.order;
                } catch (e) {
                  console.warn('Could not fetch order:', e);
                }
              }
              return { receipt: receiptResponse.receipt, order };
            })
          ),
          api.getCompanySettings().catch(() => null)
        ]);

        setReceiptsData(receiptsResults);
        if (settingsResult) {
          setCompanySettings(settingsResult);
        }
      } catch (err) {
        console.error('Error fetching receipts:', err);
        setError('Błąd podczas pobierania paragonów');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Build companyInfo from company settings
  const companyInfo = companySettings ? {
    name: companySettings.companyName,
    address: `${companySettings.street}, ${companySettings.postalCode} ${companySettings.city}`,
    nip: companySettings.nip,
    phone: companySettings.phone,
  } : undefined;

  // Auto-print when data is loaded - try Print Broker first
  useEffect(() => {
    const doPrint = async () => {
      if (!loading && receiptsData.length > 0 && !printAttempted.current) {
        printAttempted.current = true;
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try Print Broker first
        try {
          const brokerStatus = await fetch(`${BROKER_URL}/status`, { 
            method: "GET",
            signal: AbortSignal.timeout(2000)
          });
          
          if (brokerStatus.ok) {
            // Get HTML content from the rendered page
            const printContent = document.getElementById('print-content');
            if (printContent) {
              const htmlContent = printContent.innerHTML;
              
              const printResponse = await fetch(`${BROKER_URL}/print`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  documentType: "receipt",
                  contentType: "html",
                  content: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
                    @page { size: 80mm auto; margin: 0; }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    html, body { width: 80mm; font-family: 'Courier New', monospace; font-size: 12px; }
                    .page-break { page-break-after: always; }
                    .page-break:last-child { page-break-after: avoid; }
                  </style></head><body>${htmlContent}</body></html>`,
                  copies: 1,
                  paperSize: "80mm",
                  title: `Paragony (${receiptsData.length})`
                })
              });

              const result = await printResponse.json();
              if (result.success) {
                setPrintStatus("success");
                setTimeout(() => window.close(), 1500);
                return;
              }
            }
          }
        } catch (brokerError) {
          console.log("Print Broker not available, falling back to browser print");
        }

        // Browser print fallback
        setPrintStatus("fallback");
        window.print();
      }
    };
    doPrint();
  }, [loading, receiptsData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Ładowanie paragonów ({ids.length})...</p>
        </div>
      </div>
    );
  }

  if (printStatus === "success") {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        flexDirection: "column",
        gap: "10px"
      }}>
        <div style={{ fontSize: "24px", color: "#16a34a" }}>✓</div>
        <div style={{ fontSize: "18px", color: "#16a34a" }}>Wysłano do drukarki</div>
        <div style={{ fontSize: "14px", color: "#666" }}>Okno zamknie się automatycznie...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-600">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bulk-print-container" id="print-content">
      <style>{`
        @media print {
          .bulk-print-container {
            margin: 0;
            padding: 0;
          }
          .page-break {
            page-break-after: always;
          }
          .page-break:last-child {
            page-break-after: avoid;
          }
        }
        @media screen {
          .bulk-print-container {
            background: #f3f4f6;
            min-height: 100vh;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
          }
          .page-break {
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
        }
      `}</style>

      {receiptsData.map(({ receipt, order }) => (
        <div key={receipt.id} className="page-break">
          <ReceiptTemplate data={receipt as any} companyInfo={companyInfo} />
        </div>
      ))}
    </div>
  );
}
