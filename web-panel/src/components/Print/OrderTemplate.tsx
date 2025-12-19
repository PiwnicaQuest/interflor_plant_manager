import { OrderItem, OrderStatus } from '../../types';

interface CustomerInfo {
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
}

interface OrderData {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  customerId?: number;
  customerName?: string;
  customerInfo?: CustomerInfo;
  items: OrderItem[];
  totalAmount: number;
  notes?: string;
  customerNotes?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

interface OrderTemplateProps {
  data: OrderData;
  companyInfo?: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    phone?: string;
    email?: string;
  };
  showPrices?: boolean;
}

const defaultCompanyInfo = {
  name: 'POLFLOR Sp. z o.o.',
  address: 'ul. Kwiatowa 15',
  city: 'Warszawa',
  postalCode: '00-001',
  phone: '+48 123 456 789',
  email: 'zamowienia@polflor.pl',
};

export function OrderTemplate({ data, companyInfo = defaultCompanyInfo, showPrices = true }: OrderTemplateProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getStatusLabel = (status: OrderStatus) => {
    const labels: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'Oczekujące',
      [OrderStatus.IN_PROGRESS]: 'W realizacji',
      [OrderStatus.READY_FOR_PICKUP]: 'Gotowe do odbioru',
      [OrderStatus.COMPLETED]: 'Zrealizowane',
      [OrderStatus.CANCELLED]: 'Anulowane',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      [OrderStatus.IN_PROGRESS]: 'bg-purple-100 text-purple-800 border-purple-300',
      [OrderStatus.READY_FOR_PICKUP]: 'bg-green-100 text-green-800 border-green-300',
      [OrderStatus.COMPLETED]: 'bg-gray-100 text-gray-800 border-gray-300',
      [OrderStatus.CANCELLED]: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getCustomerName = () => {
    if (data.customerInfo?.companyName) return data.customerInfo.companyName;
    if (data.customerInfo?.firstName || data.customerInfo?.lastName) {
      return (data.customerInfo.firstName || '') + ' ' + (data.customerInfo.lastName || '');
    }
    return data.customerName || 'Klient detaliczny';
  };

  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="order-template bg-white text-black p-8 max-w-[210mm] mx-auto font-sans text-sm">
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .order-template { max-width: 100% !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-300">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ZAMÓWIENIE</h1>
          <p className="text-xl font-bold text-blue-600 mt-1">{data.orderNumber}</p>
        </div>
        <div className="text-right">
          <div className={'inline-block px-4 py-2 rounded-lg border-2 ' + getStatusColor(data.status)}>
            <span className="font-bold text-sm uppercase">{getStatusLabel(data.status)}</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Utworzono: {formatDate(data.createdAt)}
          </div>
        </div>
      </div>

      {/* Company & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Realizator</h3>
          <p className="font-bold">{companyInfo.name}</p>
          <p className="text-sm">{companyInfo.address}</p>
          <p className="text-sm">{companyInfo.postalCode} {companyInfo.city}</p>
          {companyInfo.phone && <p className="text-sm mt-2">Tel: {companyInfo.phone}</p>}
          {companyInfo.email && <p className="text-sm">Email: {companyInfo.email}</p>}
        </div>

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Zamawiający</h3>
          <p className="font-bold text-base">{getCustomerName()}</p>
          {data.customerInfo?.address && <p className="text-sm">{data.customerInfo.address}</p>}
          {(data.customerInfo?.postalCode || data.customerInfo?.city) && (
            <p className="text-sm">{data.customerInfo.postalCode} {data.customerInfo.city}</p>
          )}
          {data.customerInfo?.nip && (
            <p className="text-sm mt-2">NIP: <span className="font-semibold">{data.customerInfo.nip}</span></p>
          )}
          {data.customerInfo?.phone && <p className="text-sm mt-2">Tel: {data.customerInfo.phone}</p>}
          {data.customerInfo?.email && <p className="text-sm">Email: {data.customerInfo.email}</p>}
        </div>
      </div>

      {/* Order Items */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3 flex items-center gap-2">
          <span>Pozycje zamówienia</span>
          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
            {data.items.length} {data.items.length === 1 ? 'pozycja' : data.items.length < 5 ? 'pozycje' : 'pozycji'}
          </span>
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left text-xs font-semibold w-10">Lp.</th>
              <th className="border border-gray-300 p-2 text-left text-xs font-semibold">Nazwa produktu</th>
              <th className="border border-gray-300 p-2 text-center text-xs font-semibold w-14">Rozmiar</th>
              <th className="border border-gray-300 p-2 text-center text-xs font-semibold w-12">Szt/pal</th>
              <th className="border border-gray-300 p-2 text-center text-xs font-semibold w-12">Palety</th>
              <th className="border border-gray-300 p-2 text-center text-xs font-semibold w-14">Szt.</th>
              {showPrices && (
                <>
                  <th className="border border-gray-300 p-2 text-right text-xs font-semibold w-20">Cena</th>
                  <th className="border border-gray-300 p-2 text-right text-xs font-semibold w-20">Wartość</th>
                </>
              )}
              <th className="border border-gray-300 p-2 text-center text-xs font-semibold w-16">Skomplet.</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => {
              const unitsPerPallet = item.productSnapshot?.unitsPerPallet || (item as any).unitsPerPallet || 0;
              const palletCount = unitsPerPallet > 0 ? (item.quantity / unitsPerPallet).toFixed(2) : '-';
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border border-gray-300 p-2 text-center text-sm">{index + 1}</td>
                  <td className="border border-gray-300 p-2">
                    <span className="font-medium">
                      {item.productName || item.productSnapshot?.plantName || 'Produkt #' + item.productId}
                    </span>
                  </td>
                  <td className="border border-gray-300 p-2 text-center text-sm">
                    {item.productSnapshot?.potSize || '-'}
                  </td>
                  <td className="border border-gray-300 p-2 text-center text-sm">
                    {unitsPerPallet || '-'}
                  </td>
                  <td className="border border-gray-300 p-2 text-center text-sm">
                    {palletCount}
                  </td>
                  <td className="border border-gray-300 p-2 text-center font-bold text-base">
                    {item.quantity}
                  </td>
                  {showPrices && (
                    <>
                      <td className="border border-gray-300 p-2 text-right text-sm">
                        {(Number(item.unitPriceGross) || 0).toFixed(2)} zł
                      </td>
                      <td className="border border-gray-300 p-2 text-right font-semibold">
                        {(Number(item.totalPrice) || 0).toFixed(2)} zł
                      </td>
                    </>
                  )}
                  <td className="border border-gray-300 p-3 text-center">
                    <div className="w-5 h-5 border-2 border-gray-400 rounded mx-auto"></div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={3} className="border border-gray-300 p-2 text-right">RAZEM:</td>
              <td className="border border-gray-300 p-2"></td>
              <td className="border border-gray-300 p-2"></td>
              <td className="border border-gray-300 p-2 text-center text-lg">{totalQuantity}</td>
              {showPrices && (
                <>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2 text-right text-blue-600 text-lg">
                    {(Number(data.totalAmount) || 0).toFixed(2)} zł
                  </td>
                </>
              )}
              <td className="border border-gray-300 p-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      {(data.notes || data.customerNotes) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {data.customerNotes && (
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <h3 className="text-xs font-semibold text-yellow-700 uppercase mb-2">Uwagi klienta</h3>
              <p className="text-sm">{data.customerNotes}</p>
            </div>
          )}
          {data.notes && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Notatki wewnętrzne</h3>
              <p className="text-sm">{data.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Summary Box */}
      {showPrices && (
        <div className="flex justify-end mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200 w-64">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Wartość zamówienia</h3>
            <div className="text-3xl font-bold text-blue-600">
              {(Number(data.totalAmount) || 0).toFixed(2)} PLN
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {totalQuantity} szt. produktów
            </div>
          </div>
        </div>
      )}

      {/* Timeline / Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Historia zamówienia</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Utworzone:</span>
            <span className="font-semibold">{formatDateShort(data.createdAt)}</span>
          </div>
          {data.updatedAt && data.updatedAt !== data.createdAt && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Aktualizacja:</span>
              <span className="font-semibold">{formatDateShort(data.updatedAt)}</span>
            </div>
          )}
          {data.completedAt && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Zakończone:</span>
              <span className="font-semibold">{formatDateShort(data.completedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 mt-8 pt-6">
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-8">
            <p className="text-xs text-gray-500">Przygotował</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-8">
            <p className="text-xs text-gray-500">Sprawdził</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-8">
            <p className="text-xs text-gray-500">Wydał / Odebrał</p>
          </div>
        </div>
      </div>

      {/* Print Button */}
      <div className="no-print mt-8 text-center space-x-4">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-sans text-sm"
        >
          Drukuj zamówienie
        </button>
      </div>
    </div>
  );
}
