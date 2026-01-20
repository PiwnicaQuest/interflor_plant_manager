import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { printerService } from '../services/printerService';
import { ReceiptTemplate } from '../components/Print/ReceiptTemplate';
import { Receipt, Order } from '../types';

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

  const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean) || [];

  useEffect(() => {
    const fetchData = async () => {
      if (ids.length === 0) {
        setError('Nie podano ID paragonów');
        setLoading(false);
        return;
      }

      try {
        // Fetch receipts and company settings in parallel
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

  // Auto-print when data is loaded - try QZ Tray first
  useEffect(() => {
    const doPrint = async () => {
      if (!loading && receiptsData.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try QZ Tray first
        const printer = printerService.getPrinterForDocument("receipt");
        if (printer && printerService.isConnected()) {
          try {
            const printContent = document.getElementById("print-content");
            if (printContent) {
              const success = await printerService.printElement(printContent, "receipt");
              if (success) {
                console.log("[BulkPrintReceipts] QZ Tray print successful");
                return;
              }
            }
          } catch (e) {
            console.warn("[BulkPrintReceipts] QZ Tray failed, falling back to browser print");
          }
        }

        // Fallback to browser print
        window.print();
      }
    };
    doPrint();
  }, [loading, receiptsData]);

  // Build companyInfo from company settings
  const companyInfo = companySettings ? {
    name: companySettings.companyName,
    address: `${companySettings.street}, ${companySettings.postalCode} ${companySettings.city}`,
    nip: companySettings.nip,
    phone: companySettings.phone,
  } : undefined;

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
