import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Product, Order } from '../types';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStockCount: 0,
    pendingOrdersCount: 0,
    readyForPickupCount: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch low stock products
        const lowStockData = await api.getLowStockProducts();
        setLowStockProducts(lowStockData.products);

        // Fetch all products for stats
        const allProductsData = await api.getInventory();

        // Fetch pending orders
        const pendingData = await api.getOrders({ status: 'pending' });
        setPendingOrders(pendingData.orders);

        // Fetch ready for pickup orders
        const readyData = await api.getOrders({ status: 'ready_for_pickup' });

        setStats({
          totalProducts: allProductsData.products.length,
          lowStockCount: lowStockData.products.length,
          pendingOrdersCount: pendingData.orders.length,
          readyForPickupCount: readyData.orders.length,
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Ładowanie...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Przegląd systemu PlantManager</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link to="/inventory" className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Produkty w magazynie</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalProducts}</p>
            </div>
            <div className="text-4xl">📦</div>
          </div>
        </Link>

        <Link to="/inventory?status=low" className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Niski stan</p>
              <p className="text-3xl font-bold text-orange-600">{stats.lowStockCount}</p>
            </div>
            <div className="text-4xl">⚠️</div>
          </div>
          {stats.lowStockCount > 0 && (
            <div className="mt-2 text-xs text-orange-600 font-medium">
              Wymaga uwagi!
            </div>
          )}
        </Link>

        <Link to="/orders?status=pending" className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Oczekujące zamówienia</p>
              <p className="text-3xl font-bold text-blue-600">{stats.pendingOrdersCount}</p>
            </div>
            <div className="text-4xl">📋</div>
          </div>
        </Link>

        <Link to="/pos" className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Gotowe do odbioru</p>
              <p className="text-3xl font-bold text-green-600">{stats.readyForPickupCount}</p>
            </div>
            <div className="text-4xl">✅</div>
          </div>
        </Link>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-6 rounded">
          <div className="flex items-start">
            <div className="text-3xl mr-4">⚠️</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-900 mb-2">
                Alert: Niski stan magazynowy
              </h3>
              <p className="text-sm text-orange-700 mb-4">
                {lowStockProducts.length} produktów wymaga uzupełnienia zapasów
              </p>
              <div className="bg-white rounded-lg overflow-hidden">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nazwa rośliny</th>
                      <th>Rozmiar doniczki</th>
                      <th>Stan</th>
                      <th>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.slice(0, 5).map((product) => (
                      <tr key={product.id}>
                        <td className="font-medium">{product.plantName}</td>
                        <td>{product.potSize || '-'}</td>
                        <td>
                          <span className="font-semibold text-orange-600">
                            {product.totalUnits} szt.
                          </span>
                        </td>
                        <td>
                          <Link
                            to="/inventory"
                            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                          >
                            Zobacz szczegóły
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lowStockProducts.length > 5 && (
                <div className="mt-4 text-center">
                  <Link
                    to="/inventory?status=low"
                    className="btn btn-primary"
                  >
                    Zobacz wszystkie ({lowStockProducts.length})
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Pending Orders */}
      {pendingOrders.length > 0 && (
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                Oczekujące zamówienia
              </h2>
              <Link
                to="/orders?status=pending"
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                Zobacz wszystkie →
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Nr zamówienia</th>
                  <th>Klient</th>
                  <th>Data</th>
                  <th>Kwota</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td className="font-medium">{order.orderNumber}</td>
                    <td>{order.customerName || 'Brak klienta'}</td>
                    <td className="text-sm">
                      {new Date(order.createdAt).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="font-semibold">
                      {Number(order.totalAmount).toFixed(2)} PLN
                    </td>
                    <td>
                      <Link
                        to="/orders"
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                      >
                        Szczegóły
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/orders"
          className="card p-6 hover:shadow-lg transition-shadow text-center"
        >
          <div className="text-4xl mb-3">📦</div>
          <h3 className="font-semibold text-gray-900">Nowe zamówienie</h3>
          <p className="text-sm text-gray-600 mt-1">Utwórz zamówienie dla klienta</p>
        </Link>

        <Link
          to="/customers"
          className="card p-6 hover:shadow-lg transition-shadow text-center"
        >
          <div className="text-4xl mb-3">👥</div>
          <h3 className="font-semibold text-gray-900">Kontrahenci</h3>
          <p className="text-sm text-gray-600 mt-1">Zarządzaj bazą klientów</p>
        </Link>

        <Link
          to="/pos"
          className="card p-6 hover:shadow-lg transition-shadow text-center"
        >
          <div className="text-4xl mb-3">💳</div>
          <h3 className="font-semibold text-gray-900">Kasa (POS)</h3>
          <p className="text-sm text-gray-600 mt-1">Realizuj płatności</p>
        </Link>
      </div>
    </div>
  );
}
