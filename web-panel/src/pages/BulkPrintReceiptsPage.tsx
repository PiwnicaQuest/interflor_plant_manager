import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { ReceiptTemplate } from '../components/Print/ReceiptTemplate';
import { Receipt, Order } from '../types';

export function BulkPrintReceiptsPage() {
  const [searchParams] = useSearchParams();
  const [receiptsData, setReceiptsData] = useState<Array<{ receipt: Receipt; order?: Order }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean) || [];

  useEffect(() => {
    const fetchReceipts = async () => {
      if (ids.length === 0) {
        setError('Nie podano ID paragonów');
        setLoading(false);
        return;
      }

      try {
        const results = await Promise.all(
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
        );
        setReceiptsData(results);
      } catch (err) {
        console.error('Error fetching receipts:', err);
        setError('Błąd podczas pobierania paragonów');
      } finally {
        setLoading(false);
      }
    };

    fetchReceipts();
  }, []);

  useEffect(() => {
    if (!loading && receiptsData.length > 0) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
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
    <div className="bulk-print-container">
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
          <ReceiptTemplate data={receipt as any} />
        </div>
      ))}
    </div>
  );
}
