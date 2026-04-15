import { Invoice, PaymentStatus } from '../../types';

type SortField = 'invoiceNumber' | 'customerCode' | 'customerName' | 'issueDate' | 'paymentDeadline' | 'paymentStatus' | 'totalGross';
type SortOrder = 'asc' | 'desc';

interface InvoicesTableProps {
  invoices: Invoice[];
  onViewDetails: (invoice: Invoice) => void;
  onUpdatePayment: (invoice: Invoice) => void;
  onSendEmail?: (invoice: Invoice) => void;
  onCreateCorrection?: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
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
  onEdit,
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

  const getKsefStatusBadge = (invoice: Invoice) => {
    const status = invoice.ksefStatus;
    switch (status) {
      case 'sending':
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-yellow-700 bg-yellow-100 border border-yellow-200"><span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>Wysylanie</span>;
      case 'sent':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-blue-700 bg-blue-100 border border-blue-200"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Wyslana</span>;
      case 'accepted':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); window.open('/print/ksef-confirmation/' + invoice.id, '_blank'); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-green-700 bg-green-100 border border-green-200 hover:bg-green-200 transition-colors cursor-pointer"
            title={invoice.ksefReferenceNumber ? 'KSeF: ' + invoice.ksefReferenceNumber : 'Faktura przyjeta do KSeF - kliknij aby wydrukować potwierdzenie'}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            KSeF
          </button>
        );
      case 'rejected':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-red-700 bg-red-100 border border-red-200" title={invoice.ksefErrorMessage || 'Faktura odrzucona'}><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>Odrzucona</span>;
      case 'error':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-red-700 bg-red-100 border border-red-200" title={invoice.ksefErrorMessage || 'Blad wysylki KSeF'}><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>Blad</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-gray-400 bg-gray-50 border border-gray-200">—</span>;
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
                  {getKsefStatusBadge(invoice)}
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
                    <button
                      onClick={() => window.open('/print/ksef-confirmation/' + invoice.id, '_blank')}
                      className={invoice.ksefStatus === 'accepted' ? "text-green-600 hover:text-green-700 text-sm font-medium" : "text-amber-600 hover:text-amber-700 text-sm font-medium"}
                      title={invoice.ksefStatus === 'accepted' ? "Drukuj potwierdzenie KSeF" : "Drukuj potwierdzenie transakcji"}
                    >
                      {invoice.ksefStatus === 'accepted' ? 'KSeF' : 'Potw.'}
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
                    {onEdit && (!invoice.ksefStatus || invoice.ksefStatus === 'not_sent' || invoice.ksefStatus === 'offline_saved') && (
                      <button
                        onClick={() => onEdit(invoice)}
                        className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                        title="Edytuj fakture"
                      >
                        Edytuj
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
