import { Invoice, PaymentStatus } from '../../types';

interface InvoicesTableProps {
  invoices: Invoice[];
  onViewDetails: (invoice: Invoice) => void;
  onUpdatePayment: (invoice: Invoice) => void;
  selectedInvoices?: number[];
  onSelectInvoice?: (id: number) => void;
  onSelectAll?: () => void;
}

export function InvoicesTable({
  invoices,
  onViewDetails,
  onUpdatePayment,
  selectedInvoices = [],
  onSelectInvoice,
  onSelectAll
}: InvoicesTableProps) {
  if (invoices.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-500">Brak faktur</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getPaymentMethodLabel = (method?: string) => {
    const labels: Record<string, string> = {
      card: 'Karta',
      cash: 'Gotówka',
      transfer: 'Przelew',
    };
    return method ? labels[method] || method : '-';
  };

  const getPaymentStatusLabel = (status: PaymentStatus): string => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'Nieopłacona',
      [PaymentStatus.PARTIALLY_PAID]: 'Częściowo opłacona',
      [PaymentStatus.PAID]: 'Opłacona',
      [PaymentStatus.OVERDUE]: 'Po terminie',
    };
    return labels[status];
  };

  const getPaymentStatusColor = (status: PaymentStatus): string => {
    const colors: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'text-red-700 bg-red-100',
      [PaymentStatus.PARTIALLY_PAID]: 'text-yellow-700 bg-yellow-100',
      [PaymentStatus.PAID]: 'text-green-700 bg-green-100',
      [PaymentStatus.OVERDUE]: 'text-red-900 bg-red-200',
    };
    return colors[status];
  };

  const allSelected = invoices.length > 0 && selectedInvoices.length === invoices.length;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {onSelectInvoice && (
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onSelectAll}
                    className="checkbox checkbox-sm"
                  />
                </th>
              )}
              <th>Nr faktury</th>
              <th>Klient</th>
              <th>Data wystawienia</th>
              <th>Termin płatności</th>
              <th>Metoda płatności</th>
              <th>Status płatności</th>
              <th>Zapłacono</th>
              <th>Kwota brutto</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className={selectedInvoices.includes(invoice.id) ? 'bg-primary-50' : ''}>
                {onSelectInvoice && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedInvoices.includes(invoice.id)}
                      onChange={() => onSelectInvoice(invoice.id)}
                      className="checkbox checkbox-sm"
                    />
                  </td>
                )}
                <td className="font-medium">{invoice.invoiceNumber}</td>
                <td>{invoice.customerName || 'Brak danych'}</td>
                <td className="text-sm">{formatDate(invoice.issueDate)}</td>
                <td className="text-sm">
                  {invoice.paymentDeadline ? formatDate(invoice.paymentDeadline) : '-'}
                </td>
                <td>
                  <span className="text-sm">
                    {getPaymentMethodLabel(invoice.paymentMethod)}
                  </span>
                </td>
                <td>
                  <span className={'px-2 py-1 rounded-full text-xs font-semibold ' + getPaymentStatusColor(invoice.paymentStatus)}>
                    {getPaymentStatusLabel(invoice.paymentStatus)}
                  </span>
                </td>
                <td className="text-sm">
                  <span className="font-medium">{(Number(invoice.paidAmount) || 0).toFixed(2)} PLN</span>
                  <span className="text-gray-500"> / {(Number(invoice.totalGross) || 0).toFixed(2)} PLN</span>
                </td>
                <td className="font-semibold">{(Number(invoice.totalGross) || 0).toFixed(2)} PLN</td>
                <td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open('/print/invoice/' + invoice.id, '_blank')}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      title="Drukuj fakturę"
                    >
                      Drukuj
                    </button>
                    <button
                      onClick={() => onUpdatePayment(invoice)}
                      className="text-green-600 hover:text-green-700 text-sm font-medium"
                      title="Aktualizuj płatność"
                    >
                      Płatność
                    </button>
                    <button
                      onClick={() => onViewDetails(invoice)}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      Szczegóły
                    </button>
                    {invoice.pdfUrl && (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        PDF
                      </a>
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
