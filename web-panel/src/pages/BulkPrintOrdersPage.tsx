import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { OrderTemplate } from '../components/Print/OrderTemplate';
import { OrderWithItems, Customer } from '../types';

export function BulkPrintOrdersPage() {
  const [searchParams] = useSearchParams();
  const [ordersData, setOrdersData] = useState<Array<{ order: OrderWithItems; customer?: Customer }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const results = await Promise.all(
          ids.map(async (id) => {
            const orderResponse = await api.getOrder(id);
            let customer: Customer | undefined;
            if (orderResponse.order.customerId) {
              try {
                const customerResponse = await api.getCustomer(orderResponse.order.customerId);
                customer = customerResponse.customer;
              } catch (e) {
                console.warn('Could not fetch customer:', e);
              }
            }
            return { order: orderResponse.order, customer };
          })
        );
        setOrdersData(results);
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
      }, 500);
    }
  }, [loading, ordersData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Ładowanie zamówień ({ids.length})...</p>
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

      {ordersData.map(({ order, customer }, index) => (
        <div key={order.id} className="page-break">
          
            <OrderTemplate
            data={order as any}
            
            showPrices={showPrices}
          />
        </div>
      ))}
    </div>
  );
}
