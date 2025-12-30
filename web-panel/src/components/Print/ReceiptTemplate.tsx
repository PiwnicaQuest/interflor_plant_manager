import { OrderItem } from "../../types";

interface ReceiptData {
  receiptNumber: string;
  orderId?: number;
  orderNumber?: string;
  items?: OrderItem[];
  totalAmount: number;
  paymentMethod: string;
  paymentSplits?: Array<{ paymentMethod: string; amount: number }>;
  createdAt: string;
  cashierName?: string;
}

interface ReceiptTemplateProps {
  data: ReceiptData;
  companyInfo?: {
    name: string;
    address: string;
    nip: string;
    phone?: string;
  };
}

const defaultCompanyInfo = {
  name: "POLFLOR Sp. z o.o.",
  address: "ul. Kwiatowa 15, 00-001 Warszawa",
  nip: "123-456-78-90",
  phone: "+48 123 456 789",
};

export function ReceiptTemplate({ data, companyInfo = defaultCompanyInfo }: ReceiptTemplateProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pl-PL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      card: "Karta",
      cash: "Gotówka",
      transfer: "Przelew",
    };
    return labels[method] || method;
  };

  return (
    <div className="receipt-template bg-white text-black p-4 max-w-[80mm] mx-auto font-mono text-sm">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          body { margin: 0; padding: 0; }
          .receipt-template { max-width: 100% !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="text-center border-b-2 border-dashed border-black pb-3 mb-3">
        <h1 className="text-lg font-bold">{companyInfo.name}</h1>
        <p className="text-xs">{companyInfo.address}</p>
        <p className="text-xs">NIP: {companyInfo.nip}</p>
        {companyInfo.phone && <p className="text-xs">Tel: {companyInfo.phone}</p>}
      </div>

      {/* Receipt Number */}
      <div className="text-center mb-3">
        <h2 className="text-base font-bold">DOWÓD WYDANIA</h2>
        <p className="text-sm font-bold">{data.receiptNumber}</p>
        {data.orderNumber && (
          <p className="text-xs">Zamówienie: {data.orderNumber}</p>
        )}
      </div>

      {/* Date */}
      <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
        <p className="text-xs">Data: {formatDate(data.createdAt)}</p>
        {data.cashierName && <p className="text-xs">Kasjer: {data.cashierName}</p>}
      </div>

      {/* Items */}
      <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-1">Nazwa</th>
              <th className="text-center w-10">Szt/pal</th>
              <th className="text-center w-10">Pal.</th>
              <th className="text-center w-8">Szt.</th>
              <th className="text-right w-14">Cena</th>
              <th className="text-right w-14">Wart.</th>
            </tr>
          </thead>
          <tbody>
            {data.items?.map((item, index) => {
              const unitsPerPallet = item.productSnapshot?.unitsPerPallet || (item as any).unitsPerPallet || 0;
              const palletCount = unitsPerPallet > 0 ? (item.quantity / unitsPerPallet).toFixed(2) : "-";
              return (
                <tr key={index} className="border-b border-dotted border-gray-200">
                  <td className="py-1 pr-1 break-words max-w-[100px]">
                    {item.productName || item.productSnapshot?.plantName || `Produkt #${item.productId}`}
                  </td>
                  <td className="text-center text-[10px]">{unitsPerPallet || "-"}</td>
                  <td className="text-center text-[10px]">{palletCount}</td>
                  <td className="text-center font-semibold">{item.quantity}</td>
                  <td className="text-right">{(Number(item.unitPriceGross) || 0).toFixed(2)}</td>
                  <td className="text-right font-semibold">{(Number(item.totalPrice) || 0).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div className="border-b-2 border-dashed border-black pb-3 mb-3">
        <div className="flex justify-between items-center text-base font-bold">
          <span>SUMA:</span>
          <span>{(Number(data.totalAmount) || 0).toFixed(2)} PLN</span>
        </div>
      </div>

      {/* Payment Method */}
      <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
        {data.paymentSplits && data.paymentSplits.length > 1 ? (
          <div>
            <p className="text-xs font-semibold mb-1">Płatność podzielona:</p>
            {data.paymentSplits.map((split, index) => (
              <div key={index} className="flex justify-between text-xs">
                <span>{getPaymentMethodLabel(split.paymentMethod)}:</span>
                <span>{(Number(split.amount) || 0).toFixed(2)} PLN</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-between text-xs">
            <span>Forma płatności:</span>
            <span className="font-semibold">{getPaymentMethodLabel(data.paymentMethod)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs mt-4">
        <p className="font-semibold">Dziękujemy za zakupy!</p>
        <p className="text-gray-600 mt-1">Zapraszamy ponownie</p>
        <div className="mt-3 pt-2 border-t border-dotted border-gray-400">
          <p className="text-[10px] text-gray-500">
            {formatDate(data.createdAt)}
          </p>
        </div>
      </div>

      {/* Print Button */}
      <div className="no-print mt-6 text-center">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-sans text-sm"
        >
          Drukuj dowód wydania
        </button>
      </div>
    </div>
  );
}
