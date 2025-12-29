import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { InvoiceTemplate } from '../components/Print/InvoiceTemplate';
import { Invoice } from '../types';

export function BulkPrintInvoicesPage() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean) || [];

  useEffect(() => {
    const fetchInvoices = async () => {
      if (ids.length === 0) {
        setError('Nie podano ID faktur');
        setLoading(false);
        return;
      }

      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const response = await api.getInvoice(id);
            return response.invoice;
          })
        );
        setInvoices(results);
      } catch (err) {
        console.error('Error fetching invoices:', err);
        setError('Błąd podczas pobierania faktur');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  useEffect(() => {
    if (!loading && invoices.length > 0) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, invoices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Ładowanie faktur ({ids.length})...</p>
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
          }
          .page-break {
            margin-bottom: 40px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
        }
      `}</style>

      {invoices.map((invoice) => (
        <div key={invoice.id} className="page-break">
          <InvoiceTemplate data={invoice as any} />
        </div>
      ))}
    </div>
  );
}
