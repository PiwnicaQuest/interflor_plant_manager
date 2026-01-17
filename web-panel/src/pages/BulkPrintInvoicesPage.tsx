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

      {invoices.map((invoice) => {
        // Map invoice items to template format
        const mappedItems = (invoice.items || []).map((item) => ({
          id: item.id,
          name: item.description || 'Produkt',
          quantity: item.quantity,
          unit: 'szt.',
          unitPriceNet: item.unitPriceNet || 0,
          unitPriceGross: (item.unitPriceNet || 0) * (1 + (item.vatRate || 0) / 100),
          totalNet: item.totalNet || 0,
          totalGross: item.totalGross || 0,
          vatRate: item.vatRate || 0,
          totalVat: item.totalVat || 0,
          unitsPerPallet: 0,
          growerPassport: item.growerPassport,
        }));

        // Map buyer info from buyerSnapshot
        const buyerInfo = invoice.buyerSnapshot ? {
          companyName: invoice.buyerSnapshot.companyName,
          firstName: invoice.buyerSnapshot.firstName,
          lastName: invoice.buyerSnapshot.lastName,
          nip: invoice.buyerSnapshot.nip,
          address: invoice.buyerSnapshot.street,
          city: invoice.buyerSnapshot.city,
          postalCode: invoice.buyerSnapshot.postalCode,
        } : undefined;

        // Map recipient info from recipientSnapshot
        const recipientInfo = invoice.recipientSnapshot ? {
          companyName: invoice.recipientSnapshot.companyName,
          firstName: invoice.recipientSnapshot.firstName,
          lastName: invoice.recipientSnapshot.lastName,
          address: invoice.recipientSnapshot.street,
          city: invoice.recipientSnapshot.city,
          postalCode: invoice.recipientSnapshot.postalCode,
          phone: invoice.recipientSnapshot.phone,
        } : undefined;

        // Build invoice data for template
        const invoiceData = {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          orderId: invoice.orderId,
          issueDate: invoice.issueDate,
          saleDate: invoice.saleDate,
          paymentDeadline: invoice.paymentDeadline,
          paymentMethod: invoice.paymentMethod,
          paymentSplits: invoice.paymentSplits,
          paymentStatus: invoice.paymentStatus,
          items: mappedItems,
          subtotalNet: invoice.subtotalNet,
          totalVat: invoice.totalVat,
          totalGross: invoice.totalGross,
          paidAmount: invoice.paidAmount,
          notes: invoice.notes,
          buyerInfo,
          recipientInfo,
        };

        return (
          <div key={invoice.id} className="page-break">
            <InvoiceTemplate data={invoiceData} />
          </div>
        );
      })}
    </div>
  );
}
