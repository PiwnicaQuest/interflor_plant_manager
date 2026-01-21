import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Order, OrderWithItems, OrderStatus } from '../types';
import { OrdersTable } from '../components/Orders/OrdersTable';
import { OrderForm } from '../components/Orders/OrderForm';
import { OrderDetails } from '../components/Orders/OrderDetails';
import { exportOrderToExcel } from '../utils/exportOrderToExcel';


export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderWithItems | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<OrderStatus>(OrderStatus.READY_FOR_PICKUP);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  // Handle orderId from URL (e.g. from ProductDistributionPanel)
  useEffect(() => {
    const orderIdParam = searchParams.get("orderId");
    if (orderIdParam) {
      const orderId = parseInt(orderIdParam);
      if (!isNaN(orderId)) {
        api.getOrder(orderId).then(result => {
          setSelectedOrder(result.order);
          // Remove the orderId from URL after opening
          searchParams.delete("orderId");
          setSearchParams(searchParams, { replace: true });
        }).catch(err => {
          console.error("Error fetching order from URL:", err);
        });
      }
    }
  }, []);
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      if (statusFilter) filters.status = statusFilter;
      if (customerSearch) {
        filters.customerName = customerSearch;
        filters.customerCode = customerSearch;
        filters.customerNip = customerSearch;
      }
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (sourceFilter) filters.source = sourceFilter;
      const data = await api.getOrders(filters);
      setOrders(data.orders);
      setSelectedOrders([]);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, customerSearch, startDate, endDate, sourceFilter]);

  const handleAdd = () => {
    setShowForm(true);
  };

  const handleViewDetails = async (order: Order) => {
    try {
      const data = await api.getOrder(order.id);
      setSelectedOrder(data.order);
    } catch (error) {
      console.error('Error fetching order details:', error);
    }
  };

  const handlePrintOrder = (order: Order) => {
    window.open(`/print/order/${order.id}`, "_blank");
  };

  const handleExportExcel = async (order: Order) => {
    try {
      const data = await api.getOrder(order.id);
      await exportOrderToExcel(data.order);
    } catch (error) {
      console.error('Error exporting order to Excel:', error);
    }
  };

  const handleChangeStatus = async (orderId: number, status: OrderStatus) => {
    try {
      await api.updateOrderStatus(orderId, status);
      fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const handleEdit = () => {
    setEditingOrder(selectedOrder);
    setSelectedOrder(null);
    setShowForm(true);
  };

  const handleSave = () => {
    setShowForm(false);
    setEditingOrder(null);
    fetchOrders();
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingOrder(null);
  };

  const handleCloseDetails = () => {
    setSelectedOrder(null);
  };

  // Selection handlers
  const handleSelectOrder = (orderId: number) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(o => o.id));
    }
  };

  // Get selected orders data
  const getSelectedOrdersData = () => {
    return orders.filter(o => selectedOrders.includes(o.id));
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedOrders.length === 0) return;

    try {
      setBulkActionInProgress(true);
      let success = 0;
      let failed = 0;

      for (const orderId of selectedOrders) {
        try {
          await api.deleteOrder(orderId);
          success++;
        } catch (error) {
          failed++;
          console.error(`Failed to delete order ${orderId}:`, error);
        }
      }

      setShowBulkDeleteModal(false);
      setSelectedOrders([]);
      await fetchOrders();

      if (failed > 0) {
        alert(`Usunięto ${success} zamówień. ${failed} zamówień nie udało się usunąć.`);
      }
    } catch (error) {
      console.error('Error during bulk delete:', error);
      alert('Wystąpił błąd podczas usuwania zamówień.');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  // Bulk cancel (with stock restoration)
  const handleBulkCancel = async () => {
    if (selectedOrders.length === 0) return;

    const eligibleOrders = getSelectedOrdersData().filter(
      o => o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED
    );

    if (eligibleOrders.length === 0) {
      alert('Żadne z zaznaczonych zamówień nie może być anulowane.');
      setShowBulkCancelModal(false);
      return;
    }

    try {
      setBulkActionInProgress(true);
      let success = 0;
      let failed = 0;

      for (const order of eligibleOrders) {
        try {
          await api.cancelOrder(order.id, 'Masowe anulowanie zamówień');
          success++;
        } catch (error) {
          failed++;
          console.error(`Failed to cancel order ${order.id}:`, error);
        }
      }

      setShowBulkCancelModal(false);
      setSelectedOrders([]);
      await fetchOrders();

      if (failed > 0) {
        alert(`Anulowano ${success} zamówień. ${failed} zamówień nie udało się anulować.`);
      } else {
        alert(`Anulowano ${success} zamówień. Stany magazynowe zostały przywrócone.`);
      }
    } catch (error) {
      console.error('Error during bulk cancel:', error);
      alert('Wystąpił błąd podczas anulowania zamówień.');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  // Bulk status change
  const handleBulkStatusChange = async () => {
    if (selectedOrders.length === 0) return;

    const eligibleOrders = getSelectedOrdersData().filter(
      o => o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED
    );

    if (eligibleOrders.length === 0) {
      alert('Żadne z zaznaczonych zamówień nie może zmienić statusu.');
      setShowBulkStatusModal(false);
      return;
    }

    try {
      setBulkActionInProgress(true);
      let success = 0;
      let failed = 0;

      for (const order of eligibleOrders) {
        try {
          await api.updateOrderStatus(order.id, bulkTargetStatus);
          success++;
        } catch (error) {
          failed++;
          console.error(`Failed to update order ${order.id}:`, error);
        }
      }

      setShowBulkStatusModal(false);
      setSelectedOrders([]);
      await fetchOrders();

      if (failed > 0) {
        alert(`Zmieniono status ${success} zamówień. ${failed} zamówień nie udało się zaktualizować.`);
      }
    } catch (error) {
      console.error('Error during bulk status change:', error);
      alert('Wystąpił błąd podczas zmiany statusów.');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const ordersToExport = selectedOrders.length > 0
      ? getSelectedOrdersData()
      : orders;

    if (ordersToExport.length === 0) {
      alert('Brak zamówień do eksportu.');
      return;
    }

    const headers = ['Nr zamówienia', 'Klient', 'Data', 'Pozycje', 'Kwota', 'Status'];
    const statusLabels: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'Oczekuje',
      [OrderStatus.READY_FOR_PICKUP]: 'Gotowe do odbióru',
      [OrderStatus.COMPLETED]: 'Zakończone',
      [OrderStatus.CANCELLED]: 'Anulowane',
    };

    const rows = ordersToExport.map(order => [
      order.orderNumber,
      order.customerName || 'Brak klienta',
      new Date(order.createdAt).toLocaleDateString('pl-PL'),
      order.itemCount || 0,
      (Number(order.totalAmount) || 0).toFixed(2),
      statusLabels[order.status] || order.status,
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `zamówienia_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Print selected orders
  const handlePrintOrders = () => {
    const ordersToprint = selectedOrders.length > 0
      ? getSelectedOrdersData()
      : orders;

    if (ordersToprint.length === 0) {
      alert('Brak zamówień do wydruku.');
      return;
    }

    // Get order IDs and navigate to bulk print page
    const orderIds = ordersToprint.map(order => order.id).join(',');
    window.open(`/print/orders/bulk?ids=${orderIds}`, '_blank');
  };
  // Count eligible orders for bulk actions
  const eligibleForStatusChange = getSelectedOrdersData().filter(
    o => o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Zamówienia</h1>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="btn btn-secondary">
            Eksport CSV
          </button>
          <button onClick={handleAdd} className="btn btn-primary">
            + Nowe zamówienie
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Wszystkie</option>
              <option value={OrderStatus.PENDING}>Oczekuje</option>
              <option value={OrderStatus.READY_FOR_PICKUP}>Gotowe do odbióru</option>
              <option value={OrderStatus.COMPLETED}>Zakończone</option>
              <option value={OrderStatus.CANCELLED}>Anulowane</option>
            </select>
          </div>

                    {/* Source Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Źródło
            </label>
            <select
              className="input"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">Wszystkie</option>
              <option value="shop">Sklep internetowy</option>
              <option value="scanner">Scanner PWA</option>
              <option value="panel">Panel</option>
            </select>
          </div>

{/* Customer Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kontrahent (nazwa/kod/NIP)
            </label>
            <input
              type="text"
              className="input"
              placeholder="Szukaj kontrahenta..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data od
            </label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data do
            </label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Clear Filters */}
        {(statusFilter || customerSearch || startDate || endDate || sourceFilter) && (
          <div className="mt-3 pt-3 border-t">
            <button
              onClick={() => {
                setStatusFilter('');
                setCustomerSearch('');
                setStartDate('');
                setEndDate('');
                setSourceFilter('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ✕ Wyczyść filtry
            </button>
          </div>
        )}
      </div>

      {/* Selection Action Bar */}
      {selectedOrders.length > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3">
          <div className="flex justify-between items-center mb-3">
            <span className="text-primary-800">
              Zaznaczono <strong>{selectedOrders.length}</strong> z {orders.length} zamówień
              {eligibleForStatusChange < selectedOrders.length && (
                <span className="text-sm text-gray-500 ml-2">
                  ({eligibleForStatusChange} może zmienić status)
                </span>
              )}
            </span>
            <button
              onClick={() => setSelectedOrders([])}
              className="text-primary-600 hover:text-primary-800 text-sm font-medium"
            >
              Odznacz wszystkie
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-primary-700 font-medium mr-2 self-center">Akcje masowe:</span>

            <button
              onClick={() => setShowBulkStatusModal(true)}
              disabled={eligibleForStatusChange === 0}
              className="btn btn-secondary text-sm py-1 px-3"
              title={eligibleForStatusChange === 0 ? 'Brak zamówień do zmiany statusu' : ''}
            >
              Zmień status ({eligibleForStatusChange})
            </button>

            <button
              onClick={() => setShowBulkCancelModal(true)}
              disabled={eligibleForStatusChange === 0}
              className="btn text-sm py-1 px-3 bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300"
              title={eligibleForStatusChange === 0 ? 'Brak zamówień do anulowania' : ''}
            >
              Anuluj ({eligibleForStatusChange})
            </button>

            <button
              onClick={handlePrintOrders}
              className="btn btn-secondary text-sm py-1 px-3"
            >
              Drukuj ({selectedOrders.length})
            </button>

            <button
              onClick={handleExportCSV}
              className="btn btn-secondary text-sm py-1 px-3"
            >
              Eksport CSV ({selectedOrders.length})
            </button>

            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="btn text-sm py-1 px-3 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300"
            >
              Usuń ({selectedOrders.length})
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Ładowanie...</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center text-sm text-gray-600">
            <p>Znaleziono: {orders.length} zamówień</p>
          </div>
          <OrdersTable
            orders={orders}
            selectedOrders={selectedOrders}
            onPrint={handlePrintOrder}
            onViewDetails={handleViewDetails}
            onExportExcel={handleExportExcel}
            onChangeStatus={handleChangeStatus}
            onSelectOrder={handleSelectOrder}
            onSelectAll={handleSelectAll}
          />
        </>
      )}

      {/* Form Modal */}
      {showForm && <OrderForm order={editingOrder} onSave={handleSave} onCancel={handleCancel} />}

      {/* Details Modal */}
      {selectedOrder && (
        <OrderDetails
          order={selectedOrder}
          onClose={handleCloseDetails}
          onOrderUpdated={fetchOrders}
          onEdit={handleEdit}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-red-700 mb-4">
              Potwierdź masowe usuwanie
            </h3>
            <p className="text-gray-700 mb-2">
              Czy na pewno chcesz <strong>trwale usunąć</strong>{' '}
              <span className="font-semibold">{selectedOrders.length}</span> zamówień?
            </p>
            <p className="text-sm text-red-600 mb-6">
              Ta operacja jest nieodwracalna. Stany magazynowe NIE zostaną przywrócone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                className="btn btn-secondary flex-1"
                disabled={bulkActionInProgress}
              >
                Anuluj
              </button>
              <button
                onClick={handleBulkDelete}
                className="btn flex-1 bg-red-700 hover:bg-red-800 text-white border-red-700"
                disabled={bulkActionInProgress}
              >
                {bulkActionInProgress ? 'Usuwanie...' : `Tak, usuń ${selectedOrders.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Cancel Confirmation Modal */}
      {showBulkCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-orange-700 mb-4">
              Potwierdź masowe anulowanie
            </h3>
            <p className="text-gray-700 mb-2">
              Czy na pewno chcesz <strong>anulować</strong>{' '}
              <span className="font-semibold">{eligibleForStatusChange}</span> zamówień?
            </p>
            <p className="text-sm text-green-600 mb-6">
              Stany magazynowe zostaną przywrócone dla wszystkich anulowanych zamówień.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkCancelModal(false)}
                className="btn btn-secondary flex-1"
                disabled={bulkActionInProgress}
              >
                Nie
              </button>
              <button
                onClick={handleBulkCancel}
                className="btn flex-1 bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
                disabled={bulkActionInProgress}
              >
                {bulkActionInProgress ? 'Anulowanie...' : `Tak, anuluj ${eligibleForStatusChange}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Status Change Modal */}
      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Zmień status zamówień
            </h3>
            <p className="text-gray-700 mb-4">
              Zmiana statusu dla <strong>{eligibleForStatusChange}</strong> zamówień.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nowy status
              </label>
              <select
                className="input"
                value={bulkTargetStatus}
                onChange={(e) => setBulkTargetStatus(e.target.value as OrderStatus)}
              >
                <option value={OrderStatus.PENDING}>Oczekuje</option>
                <option value={OrderStatus.READY_FOR_PICKUP}>Gotowe do odbióru</option>
                <option value={OrderStatus.COMPLETED}>Zakończone</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkStatusModal(false)}
                className="btn btn-secondary flex-1"
                disabled={bulkActionInProgress}
              >
                Anuluj
              </button>
              <button
                onClick={handleBulkStatusChange}
                className="btn btn-primary flex-1"
                disabled={bulkActionInProgress}
              >
                {bulkActionInProgress ? 'Zmiana...' : 'Zmień status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
