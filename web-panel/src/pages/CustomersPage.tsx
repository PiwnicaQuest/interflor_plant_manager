import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Customer } from '../types';
import { CustomersTable } from '../components/Customers/CustomersTable';
import { CustomerForm } from '../components/Customers/CustomerForm';

type SortField = 'name' | 'nip' | 'email' | 'city' | 'priceGroup' | 'createdAt';
type SortOrder = 'ASC' | 'DESC';

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ASC');

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await api.getCustomers();
      setCustomers(data.customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAdd = () => {
    setEditingCustomer(null);
    setShowForm(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleDelete = async (_customerId: number) => {
    try {
      alert('Funkcja usuwania zostanie dodana wkrotce');
    } catch (error) {
      console.error('Error deleting customer:', error);
    }
  };

  const handlePermanentDelete = async (customerId: number, customerName: string) => {
    if (!confirm(`UWAGA: Trwale usuniesz kontrahenta "${customerName}" wraz z jego kontem online.\nTo dzialanie jest NIEODWRACALNE!\nCzy na pewno chcesz kontynuowac?`)) return;
    try {
      await api.permanentlyDeleteCustomer(customerId);
      await fetchCustomers();
      alert(`Kontrahent "${customerName}" zostal trwale usuniety`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Blad trwalego usuwania kontrahenta');
    }
  };

  const handleSave = () => {
    setShowForm(false);
    setEditingCustomer(null);
    fetchCustomers();
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCustomer(null);
  };

  const getDisplayName = (customer: Customer) => {
    if (customer.companyName) {
      return customer.companyName;
    }
    return `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Brak nazwy';
  };

  const filteredAndSortedCustomers = useMemo(() => {
    // Filter
    let result = customers.filter((customer) => {
      const searchLower = searchTerm.toLowerCase();
      const name = `${customer.companyName || ''} ${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase();
      const nip = String(customer.nip || '');
      const email = (customer.email || '').toLowerCase();

      return name.includes(searchLower) || nip.includes(searchTerm) || email.includes(searchLower);
    });

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortBy) {
        case 'name':
          aVal = getDisplayName(a).toLowerCase();
          bVal = getDisplayName(b).toLowerCase();
          break;
        case 'nip':
          aVal = a.nip || '';
          bVal = b.nip || '';
          break;
        case 'email':
          aVal = (a.email || '').toLowerCase();
          bVal = (b.email || '').toLowerCase();
          break;
        case 'city':
          aVal = (a.city || '').toLowerCase();
          bVal = (b.city || '').toLowerCase();
          break;
        case 'priceGroup':
          aVal = a.priceGroupName || `Grupa #${a.priceGroupId}`;
          bVal = b.priceGroupName || `Grupa #${b.priceGroupId}`;
          break;
        case 'createdAt':
          aVal = a.createdAt || '';
          bVal = b.createdAt || '';
          break;
      }

      if (aVal < bVal) return sortOrder === 'ASC' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'ASC' ? 1 : -1;
      return 0;
    });

    return result;
  }, [customers, searchTerm, sortBy, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Kontrahenci</h1>
        <button onClick={handleAdd} className="btn btn-primary">
          + Dodaj kontrahenta
        </button>
      </div>

      {/* Filters & Sorting */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wyszukaj
            </label>
            <input
              type="text"
              className="input"
              placeholder="Nazwa firmy, NIP, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sortuj wg
            </label>
            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
            >
              <option value="name">Nazwa</option>
              <option value="nip">NIP</option>
              <option value="email">Email</option>
              <option value="city">Miasto</option>
              <option value="priceGroup">Grupa cenowa</option>
              <option value="createdAt">Data dodania</option>
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kolejnosc
            </label>
            <select
              className="input"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            >
              <option value="ASC">A-Z (rosnaco)</option>
              <option value="DESC">Z-A (malejaco)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Ladowanie...</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center text-sm text-gray-600">
            <p>Znaleziono: {filteredAndSortedCustomers.length} kontrahentow</p>
          </div>
          <CustomersTable
            customers={filteredAndSortedCustomers}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onPermanentDelete={handlePermanentDelete}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={(field) => {
              if (field === sortBy) {
                setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
              } else {
                setSortBy(field);
                setSortOrder('ASC');
              }
            }}
          />
        </>
      )}

      {/* Form Modal */}
      {showForm && (
        <CustomerForm
          customer={editingCustomer}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
