import { Invoice, PaymentStatus } from '../../types';

type SortField = 'invoiceNumber' | 'customerCode' | 'customerName' | 'issueDate' | 'paymentDeadline' | 'paymentStatus' | 'totalGross';
type SortOrder = 'asc' | 'desc';

interface InvoicesTableProps {
  invoices: Invoice[];
  onViewDetails: (invoice: Invoice) => void;
  onUpdatePayment: (invoice: Invoice) => void;
  onSendEmail?: (invoice: Invoice) => void;
  onCreateCorrection?: (invoice: Invoice) => void;
  selectedInvoices?: number[];
  onSelectInvoice?: (id: number) => void;
  onSelectAll?: () => void;
  sortField?: SortField;
  sortOrder?: SortOrder;
  onSort?: (field: SortField) => void;
}

export function InvoicesTable({
  invoices,
  onViewDetails,
  onUpdatePayment,
  onSendEmail,
  onCreateCorrection,
  selectedInvoices = [],
  onSelectInvoice,
  onSelectAll,
  sortField,
  sortOrder,
  onSort
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
      cash: 'Gotowka',
      transfer: 'Przelew',
    };
    return method ? labels[method] || method : '-';
  };

  const getPaymentStatusLabel = (status: PaymentStatus): string => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'Nieoplacona',
      [PaymentStatus.PARTIALLY_PAID]: 'Czesciowo oplacona',
      [PaymentStatus.PAID]: 'Oplacona',
      [PaymentStatus.OVERDUE]: 'Po terminie',
    };
    return labels[status];
  };

  const getPaymentStatusColor = (status: PaymentStatus): string => {
    const colors: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'text-red-700 bg-red-100',
      [PaymentStatus.PARTIALLY_PAID]: 'text-yellow-700 bg-yellow-100',
      [PaymentStatus.PAID]: 'text-primary-700 bg-green-100',
      [PaymentStatus.OVERDUE]: 'text-red-900 bg-red-200',
    };
    return colors[status];
  };

  const getKsefStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold text-yellow-700 bg-yellow-100">Wysylanie...</span>;
      case 'sent':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold text-blue-700 bg-blue-100">Wyslana</span>;
      case 'accepted':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold text-green-700 bg-green-100">✓ KSeF</span>;
      case 'rejected':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold text-red-700 bg-red-100">Odrzucona</span>;
      case 'error':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold text-red-700 bg-red-100">Blad</span>;
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-semibold text-gray-500 bg-gray-100">—</span>;
    }
  };

  const allSelected = invoices.length > 0 && selectedInvoices.length === invoices.length;

  // Sortable header component
  const SortableHeader = ({
    field,
    children,
    className = ''
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => {
    const isActive = sortField === field;
    const isAsc = sortOrder === 'asc';

    return (
      <th
        className={`cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
        onClick={() => onSort?.(field)}
      >
        <div className="flex items-center gap-1">
          <span>{children}</span>
          <span className="inline-flex flex-col text-xs leading-none">
            <svg
              className={`w-3 h-3 ${isActive && isAsc ? 'text-primary-600' : 'text-gray-300'}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 5l-8 8h16z" />
            </svg>
            <svg
              className={`w-3 h-3 -mt-1 ${isActive && !isAsc ? 'text-primary-600' : 'text-gray-300'}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 19l8-8H4z" />
            </svg>
          </span>
        </div>
      </th>
    );
  };

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
              {onSort ? (
                <>
                  <SortableHeader field="invoiceNumber">Nr faktury</SortableHeader>
                  <SortableHeader field="customerCode">Kod klienta</SortableHeader>
                  <SortableHeader field="customerName">Klient</SortableHeader>
                  <SortableHeader field="issueDate">Data wystawienia</SortableHeader>
                  <SortableHeader field="paymentDeadline">Termin płatnośći</SortableHeader>
                  <th>Metoda płatnośći</th>
                  <SortableHeader field="paymentStatus">Status płatnośći</SortableHeader>
                  <th>KSeF</th>
                  <th>Zaplacono</th>
                  <SortableHeader field="totalGross">Kwota brutto</SortableHeader>
                  <th>Akcje</th>
                </>
              ) : (
                <>
                  <th>Nr faktury</th>
                  <th>Kod klienta</th>
                  <th>Klient</th>
                  <th>Data wystawienia</th>
                  <th>Termin płatnośći</th>
                  <th>Metoda płatnośći</th>
                  <th>Status płatnośći</th>
                  <th>KSeF</th>
                  <th>Zaplacono</th>
                  <th>Kwota brutto</th>
                  <th>Akcje</th>
                </>
              )}
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
                <td className="text-sm text-gray-600">{invoice.customerCode || '-'}</td>
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
                <td>
                  {getKsefStatusBadge(invoice.ksefStatus)}
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
                      title="Drukuj fakture"
                    >
                      Drukuj
                    </button>
                    {onSendEmail && (
                      <button
                        onClick={() => onSendEmail(invoice)}
                        className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                        title={invoice.buyerSnapshot?.email ? `Wyślij na ${invoice.buyerSnapshot.email}` : 'Wyślij fakture emailem'}
                      >
                        Email
                      </button>
                    )}
                    {onCreateCorrection && (
                      <button
                        onClick={() => onCreateCorrection(invoice)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                        title="Wystaw korekte"
                      >
                        Korekta
                      </button>
                    )}
                    <button
                      onClick={() => onUpdatePayment(invoice)}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
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
