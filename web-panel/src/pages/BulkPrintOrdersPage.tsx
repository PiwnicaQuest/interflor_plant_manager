import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { OrderTemplate } from '../components/Print/OrderTemplate';
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

  const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean) || [];
  const showPrices = searchParams.get('showPrices') !== 'false';

  useEffect(() => {
    const fetchOrders = async () => {
      if (ids.length === 0) {
        setError('Nie podano ID zamówień');
        setLoading(false);
        return;
      }

      try {
        setProgress('Pobieranie ustawień firmy...');
        
        // Fetch company settings once
        const companyResponse = await api.getCompanySettings().catch(() => null);
        setCompanySettings(companyResponse);

        setProgress(`Pobieranie ${ids.length} zamówień...`);
        
        // Use new bulk endpoint - single request for all orders
        const response = await api.getOrdersBulk(ids);
        setOrdersData(response.orders);
        
        setProgress('Gotowe!');
      } catch (err) {
        console.error('Error fetching orders:', err);
        setError('Błąd podczas pobierania zamówień');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  useEffect(() => {
    if (!loading && ordersData.length > 0) {
      setTimeout(() => {
        window.print();
      }, 300);
    }
  }, [loading, ordersData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Ładowanie zamówień ({ids.length})...</p>
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

  // Map company settings to companyInfo format (same as PrintOrderPage)
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

      {ordersData.map((order) => {
        // Use customerSnapshot from order directly (no need to fetch customer separately)
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
            <OrderTemplate
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
