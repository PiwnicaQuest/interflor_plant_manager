import { useEffect } from 'react';

interface CorrectionItem {
  id: number;
  description: string;
  originalQuantity: number;
  correctedQuantity: number;
  differenceQuantity: number;
  originalUnitPriceNet: number;
  correctedUnitPriceNet: number;
  originalVatRate: number;
  correctedVatRate: number;
  originalTotalNet: number;
  originalTotalVat: number;
  originalTotalGross: number;
  correctedTotalNet: number;
  correctedTotalVat: number;
  correctedTotalGross: number;
  differenceNet: number;
  differenceVat: number;
  differenceGross: number;
}

interface BuyerInfo {
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  street?: string;
  postalCode?: string;
  city?: string;
}

interface CorrectionData {
  id: number;
  correctionNumber: string;
  originalInvoiceNumber: string;
  originalInvoiceDate: string;
  correctionReason: string;
  issueDate: string;
  items: CorrectionItem[];
  originalSubtotalNet: number;
  originalTotalVat: number;
  originalTotalGross: number;
  correctedSubtotalNet: number;
  correctedTotalVat: number;
  correctedTotalGross: number;
  differenceNet: number;
  differenceVat: number;
  differenceGross: number;
  buyerInfo?: BuyerInfo;
}

interface SellerInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  nip: string;
  phone?: string;
  bankAccount?: string;
  bankName?: string;
}

interface CorrectionTemplateProps {
  data: CorrectionData;
  sellerInfo?: SellerInfo;
}

export function CorrectionTemplate({ data, sellerInfo }: CorrectionTemplateProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  const formatMoney = (amount: number) => {
    return (amount || 0).toFixed(2).replace('.', ',');
  };

  const formatDiff = (amount: number) => {
    const val = amount || 0;
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(2).replace('.', ',');
  };

  const getBuyerName = () => {
    if (!data.buyerInfo) return '-';
    return data.buyerInfo.companyName || 
      [data.buyerInfo.firstName, data.buyerInfo.lastName].filter(Boolean).join(' ') || 
      '-';
  };

  useEffect(() => {
    document.title = 'Korekta ' + data.correctionNumber;
    setTimeout(() => window.print(), 500);
  }, [data.correctionNumber]);

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
      marginBottom: '16px',
      paddingBottom: '12px',
      borderBottom: '2px solid #dc2626',
    },
    title: {
      fontSize: '20px',
      fontWeight: 'bold' as const,
      color: '#dc2626',
      margin: '0',
    },
    correctionNumber: {
      fontSize: '16px',
      fontWeight: 'bold' as const,
      color: '#1f2937',
      marginTop: '4px',
    },
    dateInfo: {
      textAlign: 'right' as const,
      fontSize: '11px',
    },
    referenceBox: {
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '6px',
      padding: '10px',
      marginBottom: '16px',
    },
    partiesGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px',
      marginBottom: '16px',
    },
    partyBox: {
      padding: '12px',
      borderRadius: '6px',
      fontSize: '11px',
    },
    sellerBox: {
      backgroundColor: '#f9fafb',
      border: '1px solid #e5e7eb',
    },
    buyerBox: {
      backgroundColor: '#eff6ff',
      border: '1px solid #bfdbfe',
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
      fontSize: '12px',
      marginBottom: '2px',
    },
    reasonBox: {
      backgroundColor: '#fefce8',
      border: '1px solid #fde047',
      borderRadius: '6px',
      padding: '10px',
      marginBottom: '16px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '9px',
      marginBottom: '16px',
    },
    th: {
      border: '1px solid #d1d5db',
      padding: '5px 4px',
      backgroundColor: '#f3f4f6',
      fontWeight: '600' as const,
      textAlign: 'center' as const,
    },
    td: {
      border: '1px solid #d1d5db',
      padding: '4px',
    },
    diffCell: {
      backgroundColor: '#fef3c7',
      fontWeight: 'bold' as const,
    },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: '12px',
      marginBottom: '16px',
    },
    summaryBox: {
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '12px',
      textAlign: 'center' as const,
    },
    bankInfo: {
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      padding: '10px',
      marginBottom: '16px',
    },
    signatures: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '24px',
      marginTop: '50px',
    },
    signatureLine: {
      borderTop: '1px solid #9ca3af',
      paddingTop: '6px',
      marginTop: '40px',
      textAlign: 'center' as const,
      fontSize: '9px',
      color: '#6b7280',
    },
  };

  return (
    <div style={styles.container} className="correction-template">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; }
          .correction-template { width: 194mm !important; max-width: 194mm !important; padding: 0 !important; margin: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>FAKTURA KORYGUJĄCA</h1>
          <div style={styles.correctionNumber}>{data.correctionNumber}</div>
        </div>
        <div style={styles.dateInfo}>
          <div>Data wystawienia: <strong>{formatDate(data.issueDate)}</strong></div>
        </div>
      </div>

      {/* Reference invoice */}
      <div style={styles.referenceBox}>
        <div style={{ fontWeight: 'bold', color: '#dc2626', marginBottom: '4px', fontSize: '10px' }}>
          DOTYCZY FAKTURY
        </div>
        <div>Numer: <strong>{data.originalInvoiceNumber}</strong></div>
        <div>Data wystawienia: <strong>{formatDate(data.originalInvoiceDate)}</strong></div>
      </div>

      {/* Parties */}
      <div style={styles.partiesGrid}>
        <div style={{ ...styles.partyBox, ...styles.sellerBox }}>
          <div style={styles.partyLabel}>Sprzedawca</div>
          <div style={styles.partyName}>{sellerInfo?.name || 'Firma'}</div>
          <div>{sellerInfo?.address}</div>
          <div>{sellerInfo?.postalCode} {sellerInfo?.city}</div>
          {sellerInfo?.nip && <div style={{ marginTop: '4px' }}>NIP: <strong>{sellerInfo.nip}</strong></div>}
          {sellerInfo?.phone && <div>Tel: {sellerInfo.phone}</div>}
        </div>
        <div style={{ ...styles.partyBox, ...styles.buyerBox }}>
          <div style={styles.partyLabel}>Nabywca</div>
          <div style={styles.partyName}>{getBuyerName()}</div>
          {data.buyerInfo?.street && <div>{data.buyerInfo.street}</div>}
          <div>{data.buyerInfo?.postalCode} {data.buyerInfo?.city}</div>
          {data.buyerInfo?.nip && <div style={{ marginTop: '4px' }}>NIP: <strong>{data.buyerInfo.nip}</strong></div>}
        </div>
      </div>

      {/* Reason */}
      <div style={styles.reasonBox}>
        <div style={{ fontWeight: 'bold', color: '#a16207', marginBottom: '4px', fontSize: '10px' }}>
          PRZYCZYNA KOREKTY
        </div>
        <div>{data.correctionReason}</div>
      </div>

      {/* Items table */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, width: '22px' }} rowSpan={2}>Lp.</th>
            <th style={styles.th} rowSpan={2}>Nazwa towaru/usługi</th>
            <th style={styles.th} colSpan={3}>Ilość</th>
            <th style={styles.th} colSpan={2}>Cena netto</th>
            <th style={{ ...styles.th, width: '32px' }} rowSpan={2}>VAT</th>
            <th style={styles.th} colSpan={3}>Wartość brutto</th>
          </tr>
          <tr>
            <th style={{ ...styles.th, width: '38px' }}>Przed</th>
            <th style={{ ...styles.th, width: '38px' }}>Po</th>
            <th style={{ ...styles.th, width: '42px' }}>Różn.</th>
            <th style={{ ...styles.th, width: '48px' }}>Przed</th>
            <th style={{ ...styles.th, width: '48px' }}>Po</th>
            <th style={{ ...styles.th, width: '52px' }}>Przed</th>
            <th style={{ ...styles.th, width: '52px' }}>Po</th>
            <th style={{ ...styles.th, width: '58px' }}>Różnica</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={item.id}>
              <td style={{ ...styles.td, textAlign: 'center' }}>{index + 1}</td>
              <td style={styles.td}>{item.description}</td>
              <td style={{ ...styles.td, textAlign: 'center' }}>{item.originalQuantity}</td>
              <td style={{ ...styles.td, textAlign: 'center' }}>{item.correctedQuantity}</td>
              <td style={{ ...styles.td, ...styles.diffCell, textAlign: 'center' }}>{formatDiff(item.differenceQuantity)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{formatMoney(item.originalUnitPriceNet)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{formatMoney(item.correctedUnitPriceNet)}</td>
              <td style={{ ...styles.td, textAlign: 'center' }}>{item.originalVatRate}%</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{formatMoney(item.originalTotalGross)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{formatMoney(item.correctedTotalGross)}</td>
              <td style={{ ...styles.td, ...styles.diffCell, textAlign: 'right' }}>{formatDiff(item.differenceGross)} zł</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div style={styles.summaryGrid}>
        <div style={{ ...styles.summaryBox, backgroundColor: '#f9fafb' }}>
          <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>PRZED KOREKTĄ</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatMoney(data.originalTotalGross)} zł</div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '4px' }}>
            Netto: {formatMoney(data.originalSubtotalNet)} zł | VAT: {formatMoney(data.originalTotalVat)} zł
          </div>
        </div>
        <div style={{ ...styles.summaryBox, backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
          <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>PO KOREKCIE</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatMoney(data.correctedTotalGross)} zł</div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '4px' }}>
            Netto: {formatMoney(data.correctedSubtotalNet)} zł | VAT: {formatMoney(data.correctedTotalVat)} zł
          </div>
        </div>
        <div style={{ ...styles.summaryBox, backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
          <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>RÓŻNICA</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>{formatDiff(data.differenceGross)} zł</div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '4px' }}>
            Netto: {formatDiff(data.differenceNet)} zł | VAT: {formatDiff(data.differenceVat)} zł
          </div>
        </div>
      </div>

      {/* Bank info */}
      {sellerInfo?.bankAccount && (
        <div style={styles.bankInfo}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>Dane do przelewu (w przypadku zwrotu)</div>
          {sellerInfo.bankName && <div>Bank: {sellerInfo.bankName}</div>}
          <div>Nr konta: <strong>{sellerInfo.bankAccount}</strong></div>
        </div>
      )}

      {/* Signatures */}
      <div style={styles.signatures}>
        <div style={styles.signatureLine}>Podpis osoby upoważnionej do wystawienia</div>
        <div style={styles.signatureLine}>Podpis osoby upoważnionej do odbióru</div>
      </div>
    </div>
  );
}
