import { PaymentMethod, PaymentStatus, PaymentSplit } from "../../types";

interface InvoiceItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  unitPriceGross: number;
  totalNet: number;
  totalGross: number;
  vatRate: number;
  vatAmount: number;
  unitsPerPallet?: number;
  growerPassport?: string;
}

interface BuyerInfo {
  customerCode?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

interface RecipientInfo {
  companyName?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
}

interface InvoiceData {
  id: number;
  invoiceNumber: string;
  orderId?: number;
  orderNumber?: string;
  issueDate: string;
  saleDate: string;
  paymentDeadline?: string;
  paymentMethod?: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  paymentStatus: PaymentStatus;
  items?: InvoiceItem[];
  subtotalNet: number;
  totalVat: number;
  totalGross: number;
  paidAmount: number;
  notes?: string;
  buyerInfo?: BuyerInfo;
  recipientInfo?: RecipientInfo;
}

interface InvoiceTemplateProps {
  data: InvoiceData;
  sellerInfo?: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    nip: string;
    phone?: string;
    email?: string;
    bankAccount?: string;
    bankName?: string;
    invoiceComment?: string;
  };
}

const defaultSellerInfo = {
  name: "POLFLOR Sp. z o.o.",
  address: "ul. Kwiatowa 15",
  city: "Warszawa",
  postalCode: "00-001",
  nip: "123-456-78-90",
  phone: "+48 123 456 789",
  email: "biuro@polflor.pl",
  bankAccount: "PL12 1234 5678 9012 3456 7890 1234",
  bankName: "Bank Przykładowy S.A.",
};

export function InvoiceTemplate({ data, sellerInfo = defaultSellerInfo }: InvoiceTemplateProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const getPaymentMethodLabel = (method?: PaymentMethod) => {
    if (!method) return "-";
    const labels: Record<PaymentMethod, string> = {
      [PaymentMethod.CARD]: "Karta",
      [PaymentMethod.CASH]: "Gotówka",
      [PaymentMethod.TRANSFER]: "Przelew",
    };
    return labels[method] || method;
  };

  const getPaymentStatusLabel = (status: PaymentStatus) => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: "Nieopłacona",
      [PaymentStatus.PARTIALLY_PAID]: "Częściowo opłacona",
      [PaymentStatus.PAID]: "Opłacona",
      [PaymentStatus.OVERDUE]: "Przeterminowana",
    };
    return labels[status] || status;
  };

  const getBuyerName = () => {
    let name = '';
    if (data.buyerInfo?.companyName) {
      name = data.buyerInfo.companyName;
    } else if (data.buyerInfo?.firstName || data.buyerInfo?.lastName) {
      name = `${data.buyerInfo.firstName || ""} ${data.buyerInfo.lastName || ""}`.trim();
    } else {
      name = 'Nabywca';
    }
    // Add customerCode prefix if available
    if (data.buyerInfo?.customerCode) {
      return '[' + data.buyerInfo.customerCode + '] ' + name;
    }
    return name;
  };

  const getRecipientName = () => {
    if (data.recipientInfo?.companyName) return data.recipientInfo.companyName;
    if (data.recipientInfo?.firstName || data.recipientInfo?.lastName) {
      return `${data.recipientInfo.firstName || ""} ${data.recipientInfo.lastName || ""}`.trim();
    }
    return "";
  };

  // Check if recipient is different from buyer
  const hasRecipient = data.recipientInfo && (
    data.recipientInfo.companyName ||
    data.recipientInfo.firstName ||
    data.recipientInfo.lastName ||
    data.recipientInfo.address
  );

  const totalQuantity = data.items?.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="invoice-template bg-white text-black p-8 max-w-[210mm] mx-auto font-sans text-sm">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .invoice-template { max-width: 100% !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-300">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">FAKTURA VAT</h1>
          <p className="text-xl font-bold text-blue-600 mt-1">{data.invoiceNumber}</p>
          {data.orderNumber && (
            <p className="text-sm text-gray-500 mt-1">Zamówienie: {data.orderNumber}</p>
          )}
        </div>
        <div className="text-right text-sm">
          <p>Data wystawienia: <span className="font-semibold">{formatDate(data.issueDate)}</span></p>
          <p>Data sprzedaży: <span className="font-semibold">{formatDate(data.saleDate)}</span></p>
          {data.paymentDeadline && (
            <p>Termin płatności: <span className="font-semibold">{formatDate(data.paymentDeadline)}</span></p>
          )}
        </div>
      </div>

      {/* Seller, Buyer & Recipient */}
      <div className={`grid ${hasRecipient ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}>
        {/* Sprzedawca */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sprzedawca</h3>
          <p className="font-bold">{sellerInfo.name}</p>
          <p className="text-sm">{sellerInfo.address}</p>
          <p className="text-sm">{sellerInfo.postalCode} {sellerInfo.city}</p>
          <p className="text-sm mt-2">NIP: <span className="font-semibold">{sellerInfo.nip}</span></p>
          {sellerInfo.phone && <p className="text-sm">Tel: {sellerInfo.phone}</p>}
          {sellerInfo.email && <p className="text-sm">Email: {sellerInfo.email}</p>}
        </div>

        {/* Nabywca */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Nabywca</h3>
          <p className="font-bold text-base">{getBuyerName()}</p>
          {data.buyerInfo?.address && <p className="text-sm">{data.buyerInfo.address}</p>}
          {(data.buyerInfo?.postalCode || data.buyerInfo?.city) && (
            <p className="text-sm">{data.buyerInfo.postalCode} {data.buyerInfo.city}</p>
          )}
          {data.buyerInfo?.nip && (
            <p className="text-sm mt-2">NIP: <span className="font-semibold">{data.buyerInfo.nip}</span></p>
          )}
        </div>

        {/* Odbiorca (opcjonalny) */}
        {hasRecipient && (
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Odbiorca</h3>
            <p className="font-bold text-base">{getRecipientName()}</p>
            {data.recipientInfo?.address && <p className="text-sm">{data.recipientInfo.address}</p>}
            {(data.recipientInfo?.postalCode || data.recipientInfo?.city) && (
              <p className="text-sm">{data.recipientInfo.postalCode} {data.recipientInfo.city}</p>
            )}
            {data.recipientInfo?.phone && (
              <p className="text-sm mt-2">Tel: <span className="font-semibold">{data.recipientInfo.phone}</span></p>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="mb-6">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left w-8">Lp.</th>
              <th className="border border-gray-300 p-2 text-left">Nazwa</th>
              <th className="border border-gray-300 p-2 text-center w-10">Ilość</th>
              <th className="border border-gray-300 p-2 text-center w-10">J.m.</th>
              <th className="border border-gray-300 p-2 text-right w-16">Cena netto</th>
              <th className="border border-gray-300 p-2 text-center w-10">VAT</th>
              <th className="border border-gray-300 p-2 text-right w-14">Wart. netto</th>
              <th className="border border-gray-300 p-2 text-right w-12">Wart. VAT</th>
              <th className="border border-gray-300 p-2 text-right w-16">Wart. brutto</th>
            </tr>
          </thead>
          <tbody>
            {data.items?.map((item, index) => {
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border border-gray-300 p-2 text-center">{index + 1}</td>
                  <td className="border border-gray-300 p-2"><div>{item.name}</div>{item.growerPassport && <div className="text-gray-500 text-[10px]">Paszport: {item.growerPassport}</div>}<div className="text-gray-500 text-[10px]">PKWiU: 01.30.10.0</div></td>
                  <td className="border border-gray-300 p-2 text-center font-semibold">{item.quantity}</td>
                  <td className="border border-gray-300 p-2 text-center">{item.unit}</td>
                  <td className="border border-gray-300 p-2 text-right">{(Number(item.unitPriceNet) || 0).toFixed(2)}</td>
                  <td className="border border-gray-300 p-2 text-center">{item.vatRate}%</td>
                  <td className="border border-gray-300 p-2 text-right">{(Number(item.totalNet) || 0).toFixed(2)}</td>
                  <td className="border border-gray-300 p-2 text-right">{(Number(item.vatAmount) || 0).toFixed(2)}</td>
                  <td className="border border-gray-300 p-2 text-right font-semibold">{(Number(item.totalGross) || 0).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={2} className="border border-gray-300 p-2 text-right">RAZEM:</td>
              <td className="border border-gray-300 p-2 text-center">{totalQuantity}</td>
              <td colSpan={3} className="border border-gray-300 p-2"></td>
              <td className="border border-gray-300 p-2 text-right">{(Number(data.subtotalNet) || 0).toFixed(2)} zł</td>
              <td className="border border-gray-300 p-2 text-right">{(Number(data.totalVat) || 0).toFixed(2)} zł</td>
              <td className="border border-gray-300 p-2 text-right text-blue-600">{(Number(data.totalGross) || 0).toFixed(2)} zł</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-8 mb-6">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Płatność</h3>
          {/* Display payment splits if available */}
          {data.paymentSplits && data.paymentSplits.length > 1 ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold">Płatność podzielona:</p>
              {data.paymentSplits.map((split, index) => (
                <p key={index} className="text-sm pl-2">
                  • {getPaymentMethodLabel(split.paymentMethod)}: <span className="font-semibold">{(Number(split.amount) || 0).toFixed(2)} zł</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm">Forma: <span className="font-semibold">{getPaymentMethodLabel(data.paymentMethod)}</span></p>
          )}
          <p className="text-sm mt-1">Status: <span className="font-semibold">{getPaymentStatusLabel(data.paymentStatus)}</span></p>
          {data.paidAmount > 0 && data.paidAmount < data.totalGross && (
            <p className="text-sm">Zapłacono: <span className="font-semibold">{(Number(data.paidAmount) || 0).toFixed(2)} zł</span></p>
          )}
          {sellerInfo.bankAccount && (
            <div className="mt-3 p-3 bg-gray-50 rounded text-xs">
              <p className="font-semibold">{sellerInfo.bankName}</p>
              <p className="font-mono mt-1">{sellerInfo.bankAccount}</p>
            </div>
          )}
          {sellerInfo.invoiceComment && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs">
              <p className="text-yellow-700">{sellerInfo.invoiceComment}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200 w-64">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Do zapłaty</h3>
            <div className="text-3xl font-bold text-blue-600">
              {(data.totalGross - data.paidAmount).toFixed(2)} PLN
            </div>
            {data.paymentDeadline && (
              <div className="text-xs text-gray-500 mt-1">
                Termin: {formatDate(data.paymentDeadline)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Uwagi</h3>
          <p className="text-sm">{data.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 mt-12 pt-6">
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-12">
            <p className="text-xs text-gray-500">Podpis osoby upoważnionej do wystawienia</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-12">
            <p className="text-xs text-gray-500">Podpis osoby upoważnionej do odbioru</p>
          </div>
        </div>
      </div>

      {/* Print Button */}
      <div className="no-print mt-8 text-center">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-sans text-sm"
        >
          Drukuj fakturę
        </button>
      </div>
    </div>
  );
}
