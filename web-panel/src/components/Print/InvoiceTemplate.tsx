import { PaymentMethod, PaymentStatus, PaymentSplit } from "../../types";
import { useSmartPrint } from "../../hooks/useSmartPrint";

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
  totalVat: number;
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
  paidAt?: string;
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
  name: "Firma nie skonfigurowana",
  address: "Skonfiguruj dane firmy w Ustawieniach",
  city: "",
  postalCode: "",
  nip: "0000000000",
  phone: "",
  email: "",
  bankAccount: "",
  bankName: "",
};

// VAT summary by rate
interface VatSummaryRow {
  rate: number;
  netValue: number;
  vatAmount: number;
  grossValue: number;
}

export function InvoiceTemplate({ data, sellerInfo = defaultSellerInfo }: InvoiceTemplateProps) {
  const { print, isPrinting, isQzConfigured, printerName } = useSmartPrint({
    documentType: 'invoice',
    onPrintError: (error) => console.error('Invoice print error:', error),
  });

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
    let name = "";
    if (data.buyerInfo?.companyName) {
      name = data.buyerInfo.companyName;
    } else if (data.buyerInfo?.firstName || data.buyerInfo?.lastName) {
      name = `${data.buyerInfo.firstName || ""} ${data.buyerInfo.lastName || ""}`.trim();
    } else {
      name = "Nabywca";
    }
    if (data.buyerInfo?.customerCode) {
      return "[" + data.buyerInfo.customerCode + "] " + name;
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

  const hasRecipient = data.recipientInfo && (
    data.recipientInfo.companyName ||
    data.recipientInfo.firstName ||
    data.recipientInfo.lastName ||
    data.recipientInfo.address
  );

  const totalQuantity = data.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  // Calculate VAT summary by rate with rounding adjustment
  const calculateVatSummary = (): VatSummaryRow[] => {
    const vatMap = new Map<number, VatSummaryRow>();

    data.items?.forEach(item => {
      const rate = item.vatRate;
      const existing = vatMap.get(rate);

      if (existing) {
        existing.netValue += Number(item.totalNet) || 0;
        existing.vatAmount += Number(item.totalVat) || 0;
        existing.grossValue += Number(item.totalGross) || 0;
      } else {
        vatMap.set(rate, {
          rate,
          netValue: Number(item.totalNet) || 0,
          vatAmount: Number(item.totalVat) || 0,
          grossValue: Number(item.totalGross) || 0,
        });
      }
    });

    // Sort by VAT rate descending
    const rows = Array.from(vatMap.values()).sort((a, b) => b.rate - a.rate);

    // Adjust for rounding differences - use invoice totals as source of truth
    if (rows.length > 0) {
      const sumNet = rows.reduce((sum, r) => sum + r.netValue, 0);
      const sumVat = rows.reduce((sum, r) => sum + r.vatAmount, 0);
      const sumGross = rows.reduce((sum, r) => sum + r.grossValue, 0);

      const diffNet = (Number(data.subtotalNet) || 0) - sumNet;
      const diffVat = (Number(data.totalVat) || 0) - sumVat;
      const diffGross = (Number(data.totalGross) || 0) - sumGross;

      // Apply rounding adjustment to the first (highest) rate row
      if (Math.abs(diffNet) < 1 && Math.abs(diffVat) < 1 && Math.abs(diffGross) < 1) {
        rows[0].netValue += diffNet;
        rows[0].vatAmount += diffVat;
        rows[0].grossValue += diffGross;
      }
    }

    return rows;
  };

  const vatSummary = calculateVatSummary();
  const remainingToPay = data.totalGross - data.paidAmount;

  // Calculate adjusted item values to match invoice totals (handles rounding differences)
  const getAdjustedItems = () => {
    if (!data.items || data.items.length === 0) return [];

    // Calculate raw sums from items
    const rawSumNet = data.items.reduce((sum, item) => sum + (Number(item.totalNet) || 0), 0);
    const rawSumVat = data.items.reduce((sum, item) => sum + (Number(item.totalVat) || 0), 0);
    const rawSumGross = data.items.reduce((sum, item) => sum + (Number(item.totalGross) || 0), 0);

    // Get invoice totals
    const invoiceNet = Number(data.subtotalNet) || 0;
    const invoiceVat = Number(data.totalVat) || 0;
    const invoiceGross = Number(data.totalGross) || 0;

    // If sums match (within tolerance), return items as-is
    if (Math.abs(rawSumNet - invoiceNet) < 0.01 &&
        Math.abs(rawSumVat - invoiceVat) < 0.01 &&
        Math.abs(rawSumGross - invoiceGross) < 0.01) {
      return data.items.map(item => ({
        ...item,
        adjustedNet: Number(item.totalNet) || 0,
        adjustedVat: Number(item.totalVat) || 0,
        adjustedGross: Number(item.totalGross) || 0,
      }));
    }

    // Adjust values proportionally
    const netRatio = rawSumNet > 0 ? invoiceNet / rawSumNet : 1;
    const vatRatio = rawSumVat > 0 ? invoiceVat / rawSumVat : 1;
    const grossRatio = rawSumGross > 0 ? invoiceGross / rawSumGross : 1;

    let adjustedItems = data.items.map(item => ({
      ...item,
      adjustedNet: (Number(item.totalNet) || 0) * netRatio,
      adjustedVat: (Number(item.totalVat) || 0) * vatRatio,
      adjustedGross: (Number(item.totalGross) || 0) * grossRatio,
    }));

    // Final adjustment to ensure exact match (apply difference to last item)
    if (adjustedItems.length > 0) {
      const sumAdjNet = adjustedItems.reduce((sum, item) => sum + item.adjustedNet, 0);
      const sumAdjVat = adjustedItems.reduce((sum, item) => sum + item.adjustedVat, 0);
      const sumAdjGross = adjustedItems.reduce((sum, item) => sum + item.adjustedGross, 0);

      const lastItem = adjustedItems[adjustedItems.length - 1];
      lastItem.adjustedNet += invoiceNet - sumAdjNet;
      lastItem.adjustedVat += invoiceVat - sumAdjVat;
      lastItem.adjustedGross += invoiceGross - sumAdjGross;
    }

    return adjustedItems;
  };

  const adjustedItems = getAdjustedItems();

  // Inline styles for print compatibility
  const styles = {
    container: {
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize: "11px",
      color: "#1f2937",
      backgroundColor: "#ffffff",
      padding: "8mm",
      width: "190mm",
      maxWidth: "190mm",
      margin: "0 auto",
      boxSizing: "border-box" as const,
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "20px",
      paddingBottom: "15px",
      borderBottom: "2px solid #d1d5db",
    },
    title: {
      fontSize: "22px",
      fontWeight: "bold" as const,
      color: "#1f2937",
      margin: "0",
    },
    invoiceNumber: {
      fontSize: "18px",
      fontWeight: "bold" as const,
      color: "#2563eb",
      marginTop: "4px",
    },
    dateInfo: {
      textAlign: "right" as const,
      fontSize: "11px",
    },
    partiesGrid: {
      display: "grid",
      gridTemplateColumns: hasRecipient ? "1fr 1fr 1fr" : "1fr 1fr",
      gap: "12px",
      marginBottom: "20px",
    },
    partyBox: {
      padding: "12px",
      borderRadius: "6px",
      fontSize: "11px",
    },
    sellerBox: {
      backgroundColor: "#f9fafb",
    },
    buyerBox: {
      backgroundColor: "#eff6ff",
      border: "1px solid #bfdbfe",
    },
    recipientBox: {
      backgroundColor: "#f0fdf4",
      border: "1px solid #bbf7d0",
    },
    partyLabel: {
      fontSize: "9px",
      fontWeight: "600" as const,
      color: "#6b7280",
      textTransform: "uppercase" as const,
      marginBottom: "6px",
    },
    partyName: {
      fontWeight: "bold" as const,
      fontSize: "12px",
      marginBottom: "2px",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
      fontSize: "10px",
      marginBottom: "16px",
      tableLayout: "fixed" as const,
    },
    th: {
      border: "1px solid #d1d5db",
      padding: "6px 4px",
      backgroundColor: "#f3f4f6",
      fontWeight: "600" as const,
      textAlign: "center" as const,
    },
    td: {
      border: "1px solid #d1d5db",
      padding: "5px 4px",
      verticalAlign: "top" as const,
    },
    vatTable: {
      width: "100%",
      borderCollapse: "collapse" as const,
      fontSize: "10px",
      marginBottom: "16px",
    },
    vatTh: {
      border: "1px solid #d1d5db",
      padding: "5px 8px",
      backgroundColor: "#f3f4f6",
      fontWeight: "600" as const,
      textAlign: "center" as const,
      fontSize: "9px",
    },
    vatTd: {
      border: "1px solid #d1d5db",
      padding: "4px 8px",
      textAlign: "right" as const,
      fontSize: "10px",
    },
    summaryGrid: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "20px",
      marginBottom: "20px",
      alignItems: "start",
    },
    totalBox: {
      backgroundColor: "#f8fafc",
      padding: "10px 14px",
      borderRadius: "6px",
      border: "1px solid #e2e8f0",
      minWidth: "180px",
    },
    totalLabel: {
      fontSize: "8px",
      fontWeight: "600" as const,
      color: "#64748b",
      textTransform: "uppercase" as const,
      marginBottom: "2px",
    },
    totalRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "3px 0",
      fontSize: "10px",
    },
    remainingAmount: {
      fontSize: "14px",
      fontWeight: "bold" as const,
      color: "#2563eb",
    },
    signatures: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "24px",
      marginTop: "40px",
      paddingTop: "20px",
    },
    signatureLine: {
      borderTop: "1px solid #9ca3af",
      paddingTop: "6px",
      marginTop: "40px",
      textAlign: "center" as const,
      fontSize: "9px",
      color: "#6b7280",
    },
    noPrint: {
      marginTop: "24px",
      textAlign: "center" as const,
    },
  };

  return (
    <div style={styles.container} className="invoice-template" id="print-content">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
          }
          .invoice-template {
            width: 194mm !important;
            max-width: 194mm !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 10px !important;
          }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
        @media screen {
          .invoice-template {
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
        }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>FAKTURA VAT</h1>
          <div style={styles.invoiceNumber}>{data.invoiceNumber}</div>
          {data.orderNumber && (
            <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "4px" }}>
              Zamówienie: {data.orderNumber}
            </div>
          )}
        </div>
        <div style={styles.dateInfo}>
          <div>Data wystawienia: <strong>{formatDate(data.issueDate)}</strong></div>
          <div>Data sprzedaży: <strong>{formatDate(data.saleDate)}</strong></div>
          {data.paymentDeadline && (
            <div>Termin płatności: <strong>{formatDate(data.paymentDeadline)}</strong></div>
          )}
        </div>
      </div>

      {/* Parties */}
      <div style={styles.partiesGrid}>
        <div style={{ ...styles.partyBox, ...styles.sellerBox }}>
          <div style={styles.partyLabel}>Sprzedawca</div>
          <div style={styles.partyName}>{sellerInfo.name}</div>
          <div>{sellerInfo.address}</div>
          <div>{sellerInfo.postalCode} {sellerInfo.city}</div>
          <div style={{ marginTop: "6px" }}>NIP: <strong>{sellerInfo.nip}</strong></div>
          {sellerInfo.phone && <div>Tel: {sellerInfo.phone}</div>}
          {sellerInfo.email && <div>Email: {sellerInfo.email}</div>}
        </div>

        <div style={{ ...styles.partyBox, ...styles.buyerBox }}>
          <div style={styles.partyLabel}>Nabywca</div>
          <div style={styles.partyName}>{getBuyerName()}</div>
          {data.buyerInfo?.address && <div>{data.buyerInfo.address}</div>}
          {(data.buyerInfo?.postalCode || data.buyerInfo?.city) && (
            <div>{data.buyerInfo.postalCode} {data.buyerInfo.city}</div>
          )}
          {data.buyerInfo?.nip && (
            <div style={{ marginTop: "6px" }}>NIP: <strong>{data.buyerInfo.nip}</strong></div>
          )}
        </div>

        {hasRecipient && (
          <div style={{ ...styles.partyBox, ...styles.recipientBox }}>
            <div style={styles.partyLabel}>Odbiorca</div>
            <div style={styles.partyName}>{getRecipientName()}</div>
            {data.recipientInfo?.address && <div>{data.recipientInfo.address}</div>}
            {(data.recipientInfo?.postalCode || data.recipientInfo?.city) && (
              <div>{data.recipientInfo.postalCode} {data.recipientInfo.city}</div>
            )}
            {data.recipientInfo?.phone && (
              <div style={{ marginTop: "6px" }}>Tel: <strong>{data.recipientInfo.phone}</strong></div>
            )}
          </div>
        )}
      </div>

      {/* Items Table */}
      <table style={styles.table}>
        <colgroup>
          <col style={{ width: "4%" }} />
          <col style={{ width: "31%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "11%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={styles.th}>Lp.</th>
            <th style={{ ...styles.th, textAlign: "left" }}>Nazwa towaru/usługi</th>
            <th style={styles.th}>Ilość</th>
            <th style={styles.th}>J.m.</th>
            <th style={styles.th}><div>Cena</div><div>netto</div></th>
            <th style={styles.th}><div>Cena</div><div>brutto</div></th>
            <th style={styles.th}>VAT%</th>
            <th style={styles.th}>Kwota netto</th>
            <th style={styles.th}>Kwota VAT</th>
            <th style={styles.th}><div>Kwota</div><div>brutto</div></th>
          </tr>
        </thead>
        <tbody>
          {adjustedItems.map((item, index) => (
            <tr key={index}>
              <td style={{ ...styles.td, textAlign: "center" }}>{index + 1}</td>
              <td style={{ ...styles.td, textAlign: "left" }}>
                <div style={{ fontWeight: "500" }}>{item.name}</div>
                {item.growerPassport && (
                  <div style={{ fontSize: "8px", color: "#6b7280" }}>Paszport: {item.growerPassport}</div>
                )}
                <div style={{ fontSize: "8px", color: "#6b7280" }}>PKWiU: 01.30.10.0</div>
              </td>
              <td style={{ ...styles.td, textAlign: "center", fontWeight: "600" }}>{item.quantity}</td>
              <td style={{ ...styles.td, textAlign: "center" }}>{item.unit}</td>
              <td style={{ ...styles.td, textAlign: "right" }}>{(Number(item.unitPriceNet) || 0).toFixed(2)}</td>
              <td style={{ ...styles.td, textAlign: "right" }}>{(Number(item.unitPriceGross) || 0).toFixed(2)}</td>
              <td style={{ ...styles.td, textAlign: "center" }}>{item.vatRate}%</td>
              <td style={{ ...styles.td, textAlign: "right" }}>{item.adjustedNet.toFixed(2)}</td>
              <td style={{ ...styles.td, textAlign: "right" }}>{item.adjustedVat.toFixed(2)}</td>
              <td style={{ ...styles.td, textAlign: "right", fontWeight: "600" }}>{item.adjustedGross.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "bold" }}>
            <td colSpan={2} style={{ ...styles.td, textAlign: "right" }}>RAZEM:</td>
            <td style={{ ...styles.td, textAlign: "center" }}>{totalQuantity}</td>
            <td colSpan={4} style={styles.td}></td>
            <td style={{ ...styles.td, textAlign: "right" }}>{(Number(data.subtotalNet) || 0).toFixed(2)} zł</td>
            <td style={{ ...styles.td, textAlign: "right" }}>{(Number(data.totalVat) || 0).toFixed(2)} zł</td>
            <td style={{ ...styles.td, textAlign: "right", color: "#2563eb" }}>{(Number(data.totalGross) || 0).toFixed(2)} zł</td>
          </tr>
        </tfoot>
      </table>

      {/* VAT Summary Table + Payment Box */}
      <div style={styles.summaryGrid}>
        {/* Left side - VAT Summary Table + Payment Info */}
        <div>
          {/* VAT Summary by Rate */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ ...styles.partyLabel, marginBottom: "6px" }}>Podsumowanie stawek VAT</div>
            <table style={styles.vatTable}>
              <thead>
                <tr>
                  <th style={{ ...styles.vatTh, width: "20%" }}>Stawka VAT</th>
                  <th style={{ ...styles.vatTh, width: "26%" }}>Netto</th>
                  <th style={{ ...styles.vatTh, width: "26%" }}>VAT</th>
                  <th style={{ ...styles.vatTh, width: "31%" }}>Brutto</th>
                </tr>
              </thead>
              <tbody>
                {vatSummary.map((row, index) => (
                  <tr key={index}>
                    <td style={{ ...styles.vatTd, textAlign: "center", fontWeight: "600" }}>{row.rate}%</td>
                    <td style={styles.vatTd}>{row.netValue.toFixed(2)} zł</td>
                    <td style={styles.vatTd}>{row.vatAmount.toFixed(2)} zł</td>
                    <td style={{ ...styles.vatTd, fontWeight: "600" }}>{row.grossValue.toFixed(2)} zł</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: "#f8fafc", fontWeight: "bold" }}>
                  <td style={{ ...styles.vatTd, textAlign: "center" }}>RAZEM</td>
                  <td style={styles.vatTd}>{(Number(data.subtotalNet) || 0).toFixed(2)} zł</td>
                  <td style={styles.vatTd}>{(Number(data.totalVat) || 0).toFixed(2)} zł</td>
                  <td style={{ ...styles.vatTd, color: "#2563eb" }}>{(Number(data.totalGross) || 0).toFixed(2)} zł</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Payment Info */}
          <div style={{ fontSize: "10px" }}>
            <div style={styles.partyLabel}>Płatność</div>
            {data.paymentSplits && data.paymentSplits.length > 1 ? (
              <div>
                <div style={{ fontWeight: "600", marginBottom: "4px" }}>Płatność podzielona:</div>
                {data.paymentSplits.map((split, index) => (
                  <div key={index} style={{ paddingLeft: "8px" }}>
                    • {getPaymentMethodLabel(split.paymentMethod)}: <strong>{(Number(split.amount) || 0).toFixed(2)} zł</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div>Forma: <strong>{getPaymentMethodLabel(data.paymentMethod)}</strong></div>
            )}
            <div style={{ marginTop: "4px" }}>Status: <strong>{getPaymentStatusLabel(data.paymentStatus)}</strong></div>

            {sellerInfo.bankAccount && (
              <div style={{ marginTop: "10px", padding: "10px", backgroundColor: "#f9fafb", borderRadius: "4px", fontSize: "10px" }}>
                <div style={{ fontWeight: "600" }}>{sellerInfo.bankName}</div>
                <div style={{ fontFamily: "monospace", marginTop: "4px" }}>{sellerInfo.bankAccount}</div>
              </div>
            )}
            {sellerInfo.invoiceComment && (
              <div style={{ marginTop: "10px", padding: "10px", backgroundColor: "#fefce8", border: "1px solid #fde047", borderRadius: "4px", fontSize: "10px", color: "#854d0e" }}>
                {sellerInfo.invoiceComment}
              </div>
            )}
          </div>
        </div>

        {/* Right side - Payment Summary Box */}
        <div style={styles.totalBox}>
          <div style={styles.totalLabel}>Podsumowanie płatności</div>

          <div style={{ ...styles.totalRow, borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "6px" }}>
            <span>Wartość faktury:</span>
            <strong>{(Number(data.totalGross) || 0).toFixed(2)} zł</strong>
          </div>

          <div style={styles.totalRow}>
            <span>Zapłacono:</span>
            <strong>{(Number(data.paidAmount) || 0).toFixed(2)} zł</strong>
          </div>

          {data.paidAt && data.paidAmount > 0 && (
            <div style={{ ...styles.totalRow, fontSize: "9px", color: "#64748b" }}>
              <span>Data zapłaty:</span>
              <span>{formatDate(data.paidAt)}</span>
            </div>
          )}

          <div style={{ ...styles.totalRow, borderTop: "1px solid #e2e8f0", paddingTop: "8px", marginTop: "8px" }}>
            <span style={{ fontWeight: "600" }}>Pozostało do zapłaty:</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={styles.remainingAmount}>
              {remainingToPay.toFixed(2)} PLN
            </span>
          </div>

          {data.paymentDeadline && remainingToPay > 0 && (
            <div style={{ fontSize: "9px", color: "#64748b", marginTop: "6px", textAlign: "right" }}>
              Termin: {formatDate(data.paymentDeadline)}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "6px" }}>
          <div style={styles.partyLabel}>Uwagi</div>
          <div>{data.notes}</div>
        </div>
      )}

      {/* Signatures */}
      <div style={styles.signatures}>
        <div style={styles.signatureLine}>
          Podpis osoby upoważnionej do wystawienia
        </div>
        <div style={styles.signatureLine}>
          Podpis osoby upoważnionej do odbióru
        </div>
      </div>

      {/* Print Button */}
      <div className="no-print" style={styles.noPrint}>
        <button
          onClick={print}
          disabled={isPrinting}
          style={{
            padding: "10px 24px",
            backgroundColor: isPrinting ? "#9ca3af" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            cursor: isPrinting ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {isPrinting ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Drukowanie...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Drukuj fakturę
            </>
          )}
        </button>
        {isQzConfigured && printerName && (
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
            QZ Tray: {printerName}
          </div>
        )}
      </div>
    </div>
  );
}
