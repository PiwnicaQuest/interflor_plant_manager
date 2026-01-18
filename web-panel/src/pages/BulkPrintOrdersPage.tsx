import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { OrderTemplateLite } from '../components/Print/OrderTemplateLite';
import { OrderWithItems } from '../types';

interface CompanySettings {
  companyName: string;
  nip: string;
  regon: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccount: string;
  bankSwift: string;
}

export function BulkPrintOrdersPage() {
  const [searchParams] = useSearchParams();
  const [ordersData, setOrdersData] = useState<OrderWithItems[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [readyToPrint, setReadyToPrint] = useState(false);

  const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean) || [];
  const showPrices = searchParams.get('showPrices') !== 'false';

  useEffect(() => {
    const fetchOrders = async () => {
      if (ids.length === 0) {
        setError('Nie podano ID zamowien');
        setLoading(false);
        return;
      }

      try {
        setProgress('Pobieranie ustawien firmy...');

        // Fetch company settings once
        const companyResponse = await api.getCompanySettings().catch(() => null);
        setCompanySettings(companyResponse);

        setProgress(`Pobieranie ${ids.length} zamowien...`);

        // Use new bulk endpoint - single request for all orders
        const response = await api.getOrdersBulk(ids);
        setOrdersData(response.orders);

        setProgress('Renderowanie...');
      } catch (err) {
        console.error('Error fetching orders:', err);
        setError('Blad podczas pobierania zamowien');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  // Wait for DOM to fully render before enabling print
  useEffect(() => {
    if (!loading && ordersData.length > 0) {
      // Use requestAnimationFrame to wait for browser to paint
      const waitForRender = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Short delay - lite template renders much faster
            const delay = Math.min(200 + (ordersData.length * 20), 1500);

            setTimeout(() => {
              setProgress('Gotowe do druku!');
              setReadyToPrint(true);
            }, delay);
          });
        });
      };

      waitForRender();
    }
  }, [loading, ordersData]);

  // Auto-print when ready
  useEffect(() => {
    if (readyToPrint) {
      setTimeout(() => {
        window.print();
      }, 100);
    }
  }, [readyToPrint]);

  const handleManualPrint = useCallback(() => {
    window.print();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Ladowanie zamowien ({ids.length})...</p>
          <p className="text-sm text-gray-500 mt-2">{progress}</p>
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

  // Map company settings to companyInfo format
  const companyInfo = companySettings ? {
    name: companySettings.companyName,
    nip: companySettings.nip,
    address: companySettings.street,
    city: companySettings.city,
    postalCode: companySettings.postalCode,
    phone: companySettings.phone,
    email: companySettings.email,
  } : undefined;

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
          .print-status-bar {
            display: none !important;
          }
          .order-template {
            max-width: 100% !important;
            padding: 0 !important;
            font-size: 10px !important;
          }
          .barcode-container svg {
            max-width: 140px !important;
            height: 35px !important;
          }
        }
        @media screen {
          .bulk-print-container {
            background: #f3f4f6;
            min-height: 100vh;
            padding: 20px;
            padding-top: 60px;
          }
          .page-break {
            margin-bottom: 40px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .print-status-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: white;
            border-bottom: 1px solid #e5e7eb;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .barcode-container svg {
            max-width: 140px;
            height: 35px;
          }
        }
      `}</style>

      {/* Status bar - only visible on screen */}
      <div className="print-status-bar">
        <div className="flex items-center gap-3">
          {!readyToPrint ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">{progress}</span>
            </>
          ) : (
            <>
              <span className="text-green-600 font-medium">&#10003; {ordersData.length} zamowien gotowych do druku</span>
            </>
          )}
        </div>
        <button
          onClick={handleManualPrint}
          disabled={!readyToPrint}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            readyToPrint
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {readyToPrint ? 'Drukuj ponownie' : 'Przygotowywanie...'}
        </button>
      </div>

      {ordersData.map((order) => {
        const snapshot = (order as any).customerSnapshot;
        const customerInfo = snapshot ? {
          customerCode: snapshot.customerCode,
          companyName: snapshot.companyName,
          firstName: snapshot.firstName,
          lastName: snapshot.lastName,
          nip: snapshot.nip,
          address: snapshot.street,
          city: snapshot.city,
          postalCode: snapshot.postalCode,
          email: snapshot.email,
          phone: snapshot.phone,
        } : undefined;

        return (
          <div key={order.id} className="page-break">
            <OrderTemplateLite
              data={{
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                customerId: order.customerId,
                customerName: order.customerName,
                customerInfo,
                items: order.items,
                totalAmount: order.totalAmount,
                notes: order.notes,
                customerNotes: order.customerNotes,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                completedAt: order.completedAt,
              }}
              companyInfo={companyInfo}
              showPrices={showPrices}
            />
          </div>
        );
      })}
    </div>
  );
}
