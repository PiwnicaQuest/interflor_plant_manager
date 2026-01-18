import { Customer } from '../../types';

type SortField = 'name' | 'nip' | 'email' | 'city' | 'priceGroup' | 'createdAt';
type SortOrder = 'ASC' | 'DESC';

interface CustomersTableProps {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (customerId: number) => void;
  onPermanentDelete?: (customerId: number, customerName: string) => void;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  onSort?: (field: SortField) => void;
}

export function CustomersTable({
  customers,
  onEdit,
  onDelete,
  onPermanentDelete,
  sortBy,
  sortOrder,
  onSort
}: CustomersTableProps) {
  if (customers.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-500">Brak kontrahentów w bazie</p>
      </div>
    );
  }

  const getDisplayName = (customer: Customer) => {
    if (customer.companyName) {
      return customer.companyName;
    }
    return `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Brak nazwy';
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) {
      return <span className="text-gray-300 ml-1">⇅</span>;
    }
    return (
      <span className="text-primary-600 ml-1">
        {sortOrder === 'ASC' ? '↑' : '↓'}
      </span>
    );
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => onSort?.(field)}
    >
      <div className="flex items-center">
        {children}
        {onSort && <SortIcon field={field} />}
      </div>
    </th>
  );

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <SortableHeader field="name">Nazwa / Imie i nazwisko</SortableHeader>
              <th style={{ width: '100px' }}>Kod</th>
              <SortableHeader field="nip">NIP</SortableHeader>
              <SortableHeader field="email">Email</SortableHeader>
              <th>Telefon</th>
              <SortableHeader field="city">Miasto</SortableHeader>
              <SortableHeader field="priceGroup">Grupa cenowa</SortableHeader>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td className="font-medium">{getDisplayName(customer)}</td>
                <td>{customer.customerCode || ''}</td>
                <td>{customer.nip || '-'}</td>
                <td>{customer.email}</td>
                <td>{customer.phone}</td>
                <td>{customer.city}</td>
                <td>
                  <span className="badge badge-info">
                    {customer.priceGroupName || `Grupa #${customer.priceGroupId}`}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit(customer)}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      Edytuj
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Czy na pewno chcesz usunąć tego kontrahenta?')) {
                          onDelete(customer.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Usuń
                    </button>
                    {onPermanentDelete && (
                      <button
                        onClick={() => onPermanentDelete(customer.id, getDisplayName(customer))}
                        className="text-red-800 hover:text-red-900 text-sm font-bold"
                      >
                        Usuń trwale
                      </button>
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
