import { OrderItem } from '../../types';

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

interface ReceiptA4Data {
  receiptNumber: string;
  orderNumber?: string;
  customerName?: string;
  customerInfo?: CustomerInfo;
  items: OrderItem[];
  totalAmount: number;
  paymentMethod: string;
  paymentSplits?: Array<{ paymentMethod: string; amount: number }>;
  createdAt: string;
  cashierName?: string;
}

interface ReceiptA4TemplateProps {
  data: ReceiptA4Data;
  companyInfo?: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    nip: string;
    phone?: string;
    email?: string;
  };
}

const defaultCompanyInfo = {
  name: 'POLFLOR Sp. z o.o.',
  address: 'ul. Kwiatowa 15',
  city: 'Warszawa',
  postalCode: '00-001',
  nip: '123-456-78-90',
  phone: '+48 123 456 789',
  email: 'zamowienia@polflor.pl',
};

export function ReceiptA4Template({ data, companyInfo = defaultCompanyInfo }: ReceiptA4TemplateProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      card: 'Karta płatnicza',
      cash: 'Gotówka',
      transfer: 'Przelew bankowy',
    };
    return labels[method] || method;
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
    <div className="receipt-a4-template bg-white text-black p-8 max-w-[210mm] mx-auto font-sans text-sm">
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .receipt-a4-template { max-width: 100% !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-300">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">PARAGON</h1>
          <p className="text-xl font-bold text-green-600 mt-1">{data.receiptNumber}</p>
          {data.orderNumber && (
            <p className="text-sm text-gray-500 mt-1">Zamówienie: {data.orderNumber}</p>
          )}
        </div>
        <div className="text-right">
          <div className="inline-block px-4 py-2 rounded-lg border-2 bg-green-100 text-green-800 border-green-300">
            <span className="font-bold text-sm uppercase">ZAPŁACONE</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Data: {formatDate(data.createdAt)}
          </div>
        </div>
      </div>

      {/* Company & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sprzedawca</h3>
          <p className="font-bold">{companyInfo.name}</p>
          <p className="text-sm">{companyInfo.address}</p>
          <p className="text-sm">{companyInfo.postalCode} {companyInfo.city}</p>
          <p className="text-sm mt-2">NIP: <span className="font-semibold">{companyInfo.nip}</span></p>
          {companyInfo.phone && <p className="text-sm">Tel: {companyInfo.phone}</p>}
          {companyInfo.email && <p className="text-sm">Email: {companyInfo.email}</p>}
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Nabywca</h3>
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

      {/* Items */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3 flex items-center gap-2">
          <span>Pozycje</span>
          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">
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
              <th className="border border-gray-300 p-2 text-center text-xs font-semibold w-14">Ilość</th>
              <th className="border border-gray-300 p-2 text-right text-xs font-semibold w-20">Cena jedn.</th>
              <th className="border border-gray-300 p-2 text-right text-xs font-semibold w-24">Wartość</th>
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
                  <td className="border border-gray-300 p-2 text-right text-sm">
                    {(Number(item.unitPriceGross) || 0).toFixed(2)} zł
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-semibold">
                    {(Number(item.totalPrice) || 0).toFixed(2)} zł
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={5} className="border border-gray-300 p-2 text-right">RAZEM:</td>
              <td className="border border-gray-300 p-2 text-center text-lg">{totalQuantity}</td>
              <td className="border border-gray-300 p-2"></td>
              <td className="border border-gray-300 p-2 text-right text-green-600 text-lg">
                {(Number(data.totalAmount) || 0).toFixed(2)} zł
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment Summary */}
      <div className="flex justify-between mb-6">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 w-64">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Forma płatności</h3>
          {data.paymentSplits && data.paymentSplits.length > 1 ? (
            <div className="space-y-1">
              {data.paymentSplits.map((split, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{getPaymentMethodLabel(split.paymentMethod)}:</span>
                  <span className="font-semibold">{(Number(split.amount) || 0).toFixed(2)} zł</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-lg font-bold">{getPaymentMethodLabel(data.paymentMethod)}</p>
          )}
        </div>

        <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200 w-64">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Do zapłaty</h3>
          <div className="text-3xl font-bold text-green-600">
            {(Number(data.totalAmount) || 0).toFixed(2)} PLN
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totalQuantity} szt. produktów
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg text-center">
        <p className="text-lg font-bold text-gray-700">Dziękujemy za zakupy!</p>
        <p className="text-sm text-gray-500 mt-1">Zapraszamy ponownie</p>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 mt-8 pt-6">
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-8">
            <p className="text-xs text-gray-500">Podpis sprzedawcy</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-8">
            <p className="text-xs text-gray-500">Podpis nabywcy</p>
          </div>
        </div>
      </div>

      {/* Print Button */}
      <div className="no-print mt-8 text-center space-x-4">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-sans text-sm"
        >
          Drukuj paragon
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-sans text-sm"
        >
          Powrót
        </button>
      </div>
    </div>
  );
}
