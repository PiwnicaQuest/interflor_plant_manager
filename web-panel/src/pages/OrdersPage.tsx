import { useState, useEffect } from 'react';
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
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<OrderStatus>(OrderStatus.IN_PROGRESS);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const filters = statusFilter ? { status: statusFilter } : {};
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
  }, [statusFilter]);

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
      [OrderStatus.IN_PROGRESS]: 'W realizacji',
      [OrderStatus.READY_FOR_PICKUP]: 'Gotowe do odbioru',
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
    link.download = `zamowienia_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Print selected orders
  const handlePrintOrders = async () => {
    const ordersToprint = selectedOrders.length > 0
      ? getSelectedOrdersData()
      : orders;

    if (ordersToprint.length === 0) {
      alert('Brak zamówień do wydruku.');
      return;
    }

    // Fetch full details for each order
    const fullOrders: OrderWithItems[] = [];
    for (const order of ordersToprint) {
      try {
        const data = await api.getOrder(order.id);
        fullOrders.push(data.order);
      } catch (error) {
        console.error(`Failed to fetch order ${order.id}:`, error);
      }
    }

    const statusLabels: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'Oczekuje',
      [OrderStatus.IN_PROGRESS]: 'W realizacji',
      [OrderStatus.READY_FOR_PICKUP]: 'Gotowe do odbioru',
      [OrderStatus.COMPLETED]: 'Zakończone',
      [OrderStatus.CANCELLED]: 'Anulowane',
    };

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Zamówienia - wydruk</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
          .order { page-break-after: always; border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; }
          .order:last-child { page-break-after: auto; }
          .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
          .header h2 { margin: 0; }
          .customer { margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
          th { background: #f5f5f5; }
          .total { text-align: right; font-size: 14px; font-weight: bold; }
          .status { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; }
          .status-pending { background: #e0f2fe; color: #0369a1; }
          .status-in_progress { background: #fef3c7; color: #92400e; }
          .status-ready { background: #d1fae5; color: #065f46; }
          .status-completed { background: #d1fae5; color: #065f46; }
          .status-cancelled { background: #fee2e2; color: #991b1b; }
          @media print { .order { page-break-after: always; } }
        </style>
      </head>
      <body>
        ${fullOrders.map(order => `
          <div class="order">
            <div class="header">
              <h2>${order.orderNumber}</h2>
              <span class="status status-${order.status}">${statusLabels[order.status]}</span>
              <div style="float: right; text-align: right;">
                <div>Data: ${new Date(order.createdAt).toLocaleDateString('pl-PL')}</div>
              </div>
            </div>
            <div class="customer">
              <strong>Klient:</strong> ${order.customerName || 'Brak danych'}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th style="width: 60px; text-align: center;">Palety</th>
                  <th style="width: 60px; text-align: center;">Szt.</th>
                  <th style="width: 80px; text-align: right;">Cena</th>
                  <th style="width: 80px; text-align: right;">Wartość</th>
                </tr>
              </thead>
              <tbody>
                ${(order.items || []).map(item => `
                  <tr>
                    <td>${item.productSnapshot?.plantName || item.productName || 'Produkt #' + item.productId}</td>
                    <td style="text-align: center;">${item.palletCount || 0}</td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">${(item.unitPriceGross || 0).toFixed(2)} PLN</td>
                    <td style="text-align: right;">${(item.totalPrice || 0).toFixed(2)} PLN</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="total">
              Łącznie palet: ${(order.items || []).reduce((sum, item) => sum + (item.palletCount || 0), 0)} |
              Łącznie sztuk: ${(order.items || []).reduce((sum, item) => sum + item.quantity, 0)} |
              <strong>SUMA: ${(order.totalAmount || 0).toFixed(2)} PLN</strong>
            </div>
            ${order.customerNotes ? `<div style="margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 4px;"><strong>Uwagi:</strong> ${order.customerNotes}</div>` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
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
        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Filtruj po statusie
          </label>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value={OrderStatus.PENDING}>Oczekuje</option>
            <option value={OrderStatus.IN_PROGRESS}>W realizacji</option>
            <option value={OrderStatus.READY_FOR_PICKUP}>Gotowe do odbioru</option>
            <option value={OrderStatus.COMPLETED}>Zakończone</option>
            <option value={OrderStatus.CANCELLED}>Anulowane</option>
          </select>
        </div>
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
                <option value={OrderStatus.IN_PROGRESS}>W realizacji</option>
                <option value={OrderStatus.READY_FOR_PICKUP}>Gotowe do odbioru</option>
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
