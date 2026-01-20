import { OrderItem } from "../../types";
import { useSmartPrint } from "../../hooks/useSmartPrint";

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
  const { print, isPrinting, isQzConfigured, printerName } = useSmartPrint({
    documentType: 'receipt',
    onPrintError: (error) => console.error('Receipt print error:', error),
  });

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

  // Stała szerokość - 58mm dla drukarki termicznej (bez marginesów drukarki)
  const RECEIPT_WIDTH = "71mm";

  return (
    <div className="receipt-template" id="print-content">
      <style>{`
        /* Reset dla druku */
        @media print {
          @page {
            size: 75mm auto;
            margin: 0mm !important;
          }
          html, body {
            width: 75mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          .receipt-template {
            width: ${RECEIPT_WIDTH} !important;
            max-width: ${RECEIPT_WIDTH} !important;
            padding: 2mm !important;
            margin: 0 !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          .receipt-template * {
            max-width: 100% !important;
            overflow-wrap: break-word !important;
            word-wrap: break-word !important;
          }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* Ekran */
        @media screen {
          .receipt-template {
            width: ${RECEIPT_WIDTH};
            max-width: ${RECEIPT_WIDTH};
            margin: 0 auto;
            padding: 2mm;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            background: white;
          }
        }

        /* Wspólne style */
        .receipt-template {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          color: #000;
          background: #fff;
          box-sizing: border-box;
          overflow: hidden;
          line-height: 1.3;
        }
        .receipt-template * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .receipt-template table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .receipt-template th,
        .receipt-template td {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .receipt-header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 8px;
          margin-bottom: 8px;
        }
        .receipt-header h1 {
          font-size: 13px;
          font-weight: bold;
          margin-bottom: 2px;
        }
        .receipt-header p {
          font-size: 9px;
          margin: 1px 0;
        }
        .receipt-title {
          text-align: center;
          margin-bottom: 8px;
        }
        .receipt-title h2 {
          font-size: 12px;
          font-weight: bold;
        }
        .receipt-title .number {
          font-size: 11px;
          font-weight: bold;
        }
        .receipt-title .order {
          font-size: 9px;
          color: #333;
        }
        .receipt-date {
          font-size: 9px;
          border-bottom: 1px dashed #999;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .receipt-items {
          border-bottom: 1px dashed #999;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .receipt-items table {
          font-size: 9px;
        }
        .receipt-items th {
          font-size: 8px;
          font-weight: bold;
          text-align: left;
          padding: 2px 1px;
          border-bottom: 1px solid #ccc;
        }
        .receipt-items td {
          padding: 2px 1px;
          font-size: 9px;
          vertical-align: top;
        }
        .receipt-items .name {
          white-space: normal;
          word-wrap: break-word;
          overflow-wrap: break-word;
          max-width: 80px;
        }
        .receipt-items .qty {
          text-align: center;
          font-weight: bold;
        }
        .receipt-items .price {
          text-align: right;
        }
        .receipt-items .value {
          text-align: right;
          font-weight: bold;
        }
        .receipt-total {
          border-bottom: 1px dashed #000;
          padding-bottom: 8px;
          margin-bottom: 8px;
        }
        .receipt-total .row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: bold;
        }
        .receipt-payment {
          font-size: 9px;
          border-bottom: 1px dashed #999;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .receipt-payment .row {
          display: flex;
          justify-content: space-between;
        }
        .receipt-footer {
          text-align: center;
          margin-top: 8px;
        }
        .receipt-footer .thanks {
          font-size: 10px;
          font-weight: bold;
        }
        .receipt-footer .sub {
          font-size: 9px;
          color: #666;
        }
        .receipt-footer .date {
          margin-top: 6px;
          font-size: 8px;
          color: #888;
          border-top: 1px dotted #999;
          padding-top: 4px;
        }
        .no-print {
          margin-top: 12px;
          text-align: center;
        }
        .no-print button {
          padding: 6px 16px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
        }
        .no-print button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>

      {/* Header */}
      <div className="receipt-header">
        <h1>{companyInfo.name}</h1>
        <p>{companyInfo.address}</p>
        <p>NIP: {companyInfo.nip}</p>
        {companyInfo.phone && <p>Tel: {companyInfo.phone}</p>}
      </div>

      {/* Title */}
      <div className="receipt-title">
        <h2>DOWÓD WYDANIA</h2>
        <p className="number">{data.receiptNumber}</p>
        {data.orderNumber && (
          <p className="order">Zam: {data.orderNumber}</p>
        )}
      </div>

      {/* Date */}
      <div className="receipt-date">
        <p>Data: {formatDate(data.createdAt)}</p>
        {data.cashierName && <p>Kasjer: {data.cashierName}</p>}
      </div>

      {/* Items */}
      <div className="receipt-items">
        <table>
          <thead>
            <tr>
              <th style={{ width: "50%" }}>Nazwa</th>
              <th style={{ width: "15%", textAlign: "center" }}>Szt</th>
              <th style={{ width: "17%", textAlign: "right" }}>Cena</th>
              <th style={{ width: "18%", textAlign: "right" }}>Wart</th>
            </tr>
          </thead>
          <tbody>
            {data.items?.map((item, index) => (
              <tr key={index}>
                <td className="name">
                  {item.productName || item.productSnapshot?.plantName || `#${item.productId}`}
                </td>
                <td className="qty">{item.quantity}</td>
                <td className="price">{(Number(item.unitPriceGross) || 0).toFixed(2)}</td>
                <td className="value">{(Number(item.totalPrice) || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div className="receipt-total">
        <div className="row">
          <span>SUMA:</span>
          <span>{(Number(data.totalAmount) || 0).toFixed(2)} PLN</span>
        </div>
      </div>

      {/* Payment */}
      <div className="receipt-payment">
        {data.paymentSplits && data.paymentSplits.length > 1 ? (
          <div>
            <p style={{ fontWeight: "bold", marginBottom: "2px" }}>Płatność:</p>
            {data.paymentSplits.map((split, index) => (
              <div key={index} className="row">
                <span>{getPaymentMethodLabel(split.paymentMethod)}:</span>
                <span>{(Number(split.amount) || 0).toFixed(2)} PLN</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="row">
            <span>Płatność:</span>
            <span style={{ fontWeight: "bold" }}>{getPaymentMethodLabel(data.paymentMethod)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="receipt-footer">
        <p className="thanks">Dziękujemy za zakupy!</p>
        <p className="sub">Zapraszamy ponownie</p>
        <p className="date">{formatDate(data.createdAt)}</p>
      </div>

      {/* Print Button */}
      <div className="no-print">
        <button onClick={print} disabled={isPrinting}>
          {isPrinting ? 'Drukowanie...' : 'Drukuj'}
        </button>
        {isQzConfigured && printerName && (
          <p style={{ fontSize: "8px", color: "#666", marginTop: "4px" }}>
            QZ: {printerName}
          </p>
        )}
      </div>
    </div>
  );
}
