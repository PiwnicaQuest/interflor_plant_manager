import { Order, OrderStatus } from '../../types';

interface OrdersTableProps {
  orders: Order[];
  selectedOrders: number[];
  onViewDetails: (order: Order) => void;
  onExportExcel: (order: Order) => void;
  onChangeStatus: (orderId: number, status: OrderStatus) => void;
  onSelectOrder: (orderId: number) => void;
  onSelectAll: () => void;
}

const statusConfig: Record<OrderStatus, { label: string; class: string }> = {
  [OrderStatus.PENDING]: { label: 'Oczekuje', class: 'badge-info' },
  [OrderStatus.READY_FOR_PICKUP]: { label: 'Gotowe do odbióru', class: 'badge-success' },
  [OrderStatus.COMPLETED]: { label: 'Zakończone', class: 'badge-success' },
  [OrderStatus.CANCELLED]: { label: 'Anulowane', class: 'badge-danger' },
};

const sourceConfig: Record<string, string> = {
  shop: 'Sklep internetowy',
  scanner: 'Scanner PWA',
  panel: 'Panel',

};

export function OrdersTable({
  orders,
  selectedOrders,
  onViewDetails,
  onExportExcel,
  onChangeStatus,
  onSelectOrder,
  onSelectAll
}: OrdersTableProps) {
  if (orders.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-500">Brak zamówień</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const allSelected = orders.length > 0 && selectedOrders.length === orders.length;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              <th>Nr zamówienia</th>
              <th>Kod</th>
              <th>Klient</th>
              <th>Data</th>
              <th>Pozycje</th>
              <th>Kwota</th>
              <th>Status</th>
              <th>Źródło</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className={selectedOrders.includes(order.id) ? 'bg-primary-50' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(order.id)}
                    onChange={() => onSelectOrder(order.id)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
                <td className="font-medium">{order.orderNumber}</td>
                <td className="text-sm text-gray-600 font-mono">{order.customerCode || '-'}</td>
                <td>{order.customerName || 'Brak klienta'}</td>
                <td className="text-sm">{formatDate(order.createdAt)}</td>
                <td className="text-center">{order.itemCount || '-'}</td>
                <td className="font-semibold">{(Number(order.totalAmount) || 0).toFixed(2)} PLN</td>
                <td>
                  <span className={`badge ${statusConfig[order.status].class}`}>
                    {statusConfig[order.status].label}
                  </span>
                </td>
                <td>
                  <span className="text-sm text-gray-600">
                    {order.source ? sourceConfig[order.source] || order.source : '-'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => onViewDetails(order)}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      Szczegóły
                    </button>
                    <button
                      onClick={() => onExportExcel(order)}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                      title="Eksport do Excel"
                    >
                      Excel
                    </button>
                    {order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && (
                      <select
                        value={order.status}
                        onChange={(e) => onChangeStatus(order.id, e.target.value as OrderStatus)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value={OrderStatus.PENDING}>Oczekuje</option>
                        <option value={OrderStatus.READY_FOR_PICKUP}>Gotowe</option>
                        <option value={OrderStatus.COMPLETED}>Zakończone</option>
                        <option value={OrderStatus.CANCELLED}>Anuluj</option>
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
