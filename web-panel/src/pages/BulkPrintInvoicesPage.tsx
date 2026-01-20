import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { InvoiceTemplate } from '../components/Print/InvoiceTemplate';
import { printerService } from "../services/printerService";
import { Invoice } from '../types';

interface CompanySettings {
  companyName: string;
  nip: string;
  street: string;
  postalCode: string;
  city: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccount?: string;
  invoiceComment?: string;
}

export function BulkPrintInvoicesPage() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean) || [];

  useEffect(() => {
    const fetchData = async () => {
      if (ids.length === 0) {
        setError('Nie podano ID faktur');
        setLoading(false);
        return;
      }

      try {
        // Fetch invoices and company settings in parallel
        const [invoiceResults, settingsResult] = await Promise.all([
          Promise.all(
            ids.map(async (id) => {
              const response = await api.getInvoice(id);
              return response.invoice;
            })
          ),
          api.getCompanySettings().catch(() => null)
        ]);

        setInvoices(invoiceResults);
        if (settingsResult) {
          setCompanySettings(settingsResult);
        }
      } catch (err) {
        console.error('Error fetching invoices:', err);
        setError('Błąd podczas pobierania faktur');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const doPrint = async () => {
      if (!loading && invoices.length > 0) {
        // Wait for render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try QZ Tray first
        const printer = printerService.getPrinterForDocument("invoice");
        if (printer && printerService.isConnected()) {
          try {
            const printContent = document.getElementById("print-content");
            if (printContent) {
              const success = await printerService.printElement(printContent, "invoice");
              if (success) {
                console.log("[BulkPrint] QZ Tray print successful");
                return;
              }
            }
          } catch (e) {
            console.warn("[BulkPrint] QZ Tray failed, falling back to browser print");
          }
        }
        
        // Fallback to browser print
        window.print();
      }
    };
    doPrint();
  }, [loading, invoices]);

  // Build sellerInfo from company settings
  const sellerInfo = companySettings ? {
    name: companySettings.companyName,
    nip: companySettings.nip,
    address: companySettings.street,
    postalCode: companySettings.postalCode,
    city: companySettings.city,
    phone: companySettings.phone,
    email: companySettings.email,
    bankName: companySettings.bankName,
    bankAccount: companySettings.bankAccount,
    invoiceComment: companySettings.invoiceComment,
  } : undefined;

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
            <InvoiceTemplate data={invoiceData} sellerInfo={sellerInfo} />
          </div>
        );
      })}
    </div>
  );
}
