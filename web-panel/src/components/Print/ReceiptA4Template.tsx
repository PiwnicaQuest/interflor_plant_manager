import { OrderItem } from '../../types';

interface CustomerInfo {
  customerCode?: string;
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
  name: 'Firma nie skonfigurowana',
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
    let name = '';
    if (data.customerInfo?.companyName) {
      name = data.customerInfo.companyName;
    } else if (data.customerInfo?.firstName || data.customerInfo?.lastName) {
      name = (data.customerInfo.firstName || '') + ' ' + (data.customerInfo.lastName || '');
    } else {
      name = data.customerName || 'Klient detaliczny';
    }
    if (data.customerInfo?.customerCode) {
      return '[' + data.customerInfo.customerCode + '] ' + name;
    }
    return name;
  };

  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);

  // Inline styles for print compatibility
  const styles = {
    container: {
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize: '11px',
      color: '#1f2937',
      backgroundColor: '#ffffff',
      padding: '8mm',
      width: '190mm',
      maxWidth: '190mm',
      margin: '0 auto',
      boxSizing: 'border-box' as const,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '20px',
      paddingBottom: '15px',
      borderBottom: '2px solid #d1d5db',
    },
    title: {
      fontSize: '22px',
      fontWeight: 'bold' as const,
      color: '#1f2937',
      margin: '0',
    },
    receiptNumber: {
      fontSize: '18px',
      fontWeight: 'bold' as const,
      color: '#16a34a',
      marginTop: '4px',
    },
    paidBadge: {
      display: 'inline-block',
      padding: '8px 16px',
      borderRadius: '6px',
      backgroundColor: '#dcfce7',
      color: '#166534',
      border: '2px solid #86efac',
      fontWeight: 'bold' as const,
      fontSize: '12px',
      textTransform: 'uppercase' as const,
    },
    partiesGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginBottom: '20px',
    },
    partyBox: {
      padding: '14px',
      borderRadius: '6px',
      fontSize: '11px',
    },
    sellerBox: {
      backgroundColor: '#f9fafb',
    },
    buyerBox: {
      backgroundColor: '#f0fdf4',
      border: '1px solid #bbf7d0',
    },
    partyLabel: {
      fontSize: '9px',
      fontWeight: '600' as const,
      color: '#6b7280',
      textTransform: 'uppercase' as const,
      marginBottom: '6px',
    },
    partyName: {
      fontWeight: 'bold' as const,
      fontSize: '13px',
      marginBottom: '2px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '10px',
      marginBottom: '20px',
      tableLayout: 'fixed' as const,
    },
    th: {
      border: '1px solid #d1d5db',
      padding: '8px 6px',
      backgroundColor: '#f3f4f6',
      fontWeight: '600' as const,
      textAlign: 'center' as const,
      fontSize: '10px',
    },
    td: {
      border: '1px solid #d1d5db',
      padding: '6px',
      verticalAlign: 'top' as const,
    },
    summaryGrid: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '20px',
    },
    paymentBox: {
      backgroundColor: '#f9fafb',
      padding: '14px',
      borderRadius: '6px',
      border: '1px solid #e5e7eb',
      width: '200px',
    },
    totalBox: {
      backgroundColor: '#f0fdf4',
      padding: '14px',
      borderRadius: '6px',
      border: '2px solid #86efac',
      textAlign: 'right' as const,
      width: '200px',
    },
    totalAmount: {
      fontSize: '26px',
      fontWeight: 'bold' as const,
      color: '#16a34a',
    },
    footer: {
      marginBottom: '20px',
      padding: '16px',
      backgroundColor: '#f9fafb',
      borderRadius: '6px',
      textAlign: 'center' as const,
    },
    signatures: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '32px',
      marginTop: '40px',
    },
    signatureLine: {
      borderTop: '1px solid #9ca3af',
      paddingTop: '6px',
      marginTop: '40px',
      textAlign: 'center' as const,
      fontSize: '9px',
      color: '#6b7280',
    },
    noPrint: {
      marginTop: '24px',
      textAlign: 'center' as const,
    },
  };

  return (
    <div style={styles.container} className="receipt-a4-template">
      <style>{`
        @media print {
          @page { 
            size: A4 portrait; 
            margin: 10mm; 
          }
          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
          }
          .receipt-a4-template {
            width: 190mm !important;
            max-width: 190mm !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
        @media screen {
          .receipt-a4-template {
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
        }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>DOWÓD WYDANIA</h1>
          <div style={styles.receiptNumber}>{data.receiptNumber}</div>
          {data.orderNumber && (
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
              Zamówienie: {data.orderNumber}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={styles.paidBadge}>ZAPŁACONE</div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: '#6b7280' }}>
            Data: {formatDate(data.createdAt)}
          </div>
        </div>
      </div>

      {/* Parties */}
      <div style={styles.partiesGrid}>
        <div style={{ ...styles.partyBox, ...styles.sellerBox }}>
          <div style={styles.partyLabel}>Sprzedawca</div>
          <div style={styles.partyName}>{companyInfo.name}</div>
          <div>{companyInfo.address}</div>
          <div>{companyInfo.postalCode} {companyInfo.city}</div>
          <div style={{ marginTop: '6px' }}>NIP: <strong>{companyInfo.nip}</strong></div>
          {companyInfo.phone && <div>Tel: {companyInfo.phone}</div>}
          {companyInfo.email && <div>Email: {companyInfo.email}</div>}
        </div>

        <div style={{ ...styles.partyBox, ...styles.buyerBox }}>
          <div style={styles.partyLabel}>Nabywca</div>
          <div style={styles.partyName}>{getCustomerName()}</div>
          {data.customerInfo?.address && <div>{data.customerInfo.address}</div>}
          {(data.customerInfo?.postalCode || data.customerInfo?.city) && (
            <div>{data.customerInfo.postalCode} {data.customerInfo.city}</div>
          )}
          {data.customerInfo?.nip && (
            <div style={{ marginTop: '6px' }}>NIP: <strong>{data.customerInfo.nip}</strong></div>
          )}
          {data.customerInfo?.phone && <div style={{ marginTop: '6px' }}>Tel: {data.customerInfo.phone}</div>}
        </div>
      </div>

      {/* Items Table - UPROSZCZONA BEZ SZT/PAL I PALET */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ ...styles.partyLabel, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Pozycje</span>
          <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>
            {data.items.length} {data.items.length === 1 ? 'pozycja' : data.items.length < 5 ? 'pozycje' : 'pozycji'}
          </span>
        </div>
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '46%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={styles.th}>Lp.</th>
              <th style={{ ...styles.th, textAlign: 'left' }}>Nazwa produktu</th>
              <th style={styles.th}>Rozmiar</th>
              <th style={styles.th}>Ilość</th>
              <th style={styles.th}>Cena jedn.</th>
              <th style={styles.th}>Wartość</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={index}>
                <td style={{ ...styles.td, textAlign: 'center' }}>{index + 1}</td>
                <td style={{ ...styles.td, textAlign: 'left' }}>
                  <div style={{ fontWeight: '500' }}>
                    {item.productName || item.productSnapshot?.plantName || 'Produkt #' + item.productId}
                  </div>
                </td>
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  {item.productSnapshot?.potSize || '-'}
                </td>
                <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
                  {item.quantity}
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  {(Number(item.unitPriceGross) || 0).toFixed(2)} zł
                </td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>
                  {(Number(item.totalPrice) || 0).toFixed(2)} zł
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#f3f4f6', fontWeight: 'bold' }}>
              <td colSpan={3} style={{ ...styles.td, textAlign: 'right' }}>RAZEM:</td>
              <td style={{ ...styles.td, textAlign: 'center', fontSize: '14px' }}>{totalQuantity}</td>
              <td style={styles.td}></td>
              <td style={{ ...styles.td, textAlign: 'right', color: '#16a34a', fontSize: '14px' }}>
                {(Number(data.totalAmount) || 0).toFixed(2)} zł
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment Summary */}
      <div style={styles.summaryGrid}>
        <div style={styles.paymentBox}>
          <div style={styles.partyLabel}>Forma płatności</div>
          {data.paymentSplits && data.paymentSplits.length > 1 ? (
            <div>
              {data.paymentSplits.map((split, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span>{getPaymentMethodLabel(split.paymentMethod)}:</span>
                  <span style={{ fontWeight: '600' }}>{(Number(split.amount) || 0).toFixed(2)} zł</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{getPaymentMethodLabel(data.paymentMethod)}</div>
          )}
        </div>

        <div style={styles.totalBox}>
          <div style={styles.partyLabel}>Do zapłaty</div>
          <div style={styles.totalAmount}>
            {(Number(data.totalAmount) || 0).toFixed(2)} PLN
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
            {totalQuantity} szt. produktów
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151' }}>Dziękujemy za zakupy!</div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Zapraszamy ponownie</div>
      </div>

      {/* Signatures */}
      <div style={styles.signatures}>
        <div style={styles.signatureLine}>
          Podpis sprzedawcy
        </div>
        <div style={styles.signatureLine}>
          Podpis nabywcy
        </div>
      </div>

      {/* Print Button */}
      <div className="no-print" style={styles.noPrint}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 24px',
            backgroundColor: '#16a34a',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
            marginRight: '12px',
          }}
        >
          Drukuj dowód wydania
        </button>
        <button
          onClick={() => window.history.back()}
          style={{
            padding: '10px 24px',
            backgroundColor: '#e5e7eb',
            color: '#374151',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Powrót
        </button>
      </div>
    </div>
  );
}
