import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Customer, User, UserRole, CreateUserRequest, UpdateUserRequest, ChangePasswordRequest } from '../types';
import { CustomersTable } from '../components/Customers/CustomersTable';
import { CustomerForm } from '../components/Customers/CustomerForm';
import { CreateUserModal } from '../components/Users/CreateUserModal';
import { EditUserModal } from '../components/Users/EditUserModal';
import { ChangePasswordModal } from '../components/Users/ChangePasswordModal';

type SortField = 'name' | 'nip' | 'email' | 'city' | 'priceGroup' | 'createdAt';
type SortOrder = 'ASC' | 'DESC';
type TabType = 'list' | 'access';

export function CustomersPage() {
  const [activeTab, setActiveTab] = useState<TabType>('list');

  // Customers state (list tab)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ASC');

  // Customer users state (access tab)
  const [customerUsers, setCustomerUsers] = useState<User[]>([]);
  const [customerUsersLoading, setCustomerUsersLoading] = useState(true);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [changingPasswordUser, setChangingPasswordUser] = useState<User | null>(null);
  const [accessSearchTerm, setAccessSearchTerm] = useState('');

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

  const fetchCustomerUsers = async () => {
    try {
      setCustomerUsersLoading(true);
      const data = await api.getUsers();
      // Filter only customer users
      setCustomerUsers(data.users.filter((u: User) => u.role === UserRole.CUSTOMER));
    } catch (error) {
      console.error('Error fetching customer users:', error);
    } finally {
      setCustomerUsersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'list') {
      fetchCustomers();
    } else if (activeTab === 'access') {
      fetchCustomerUsers();
    }
  }, [activeTab]);

  // Customer handlers
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

  // User handlers (for access tab)
  const handleCreateUser = async (data: CreateUserRequest) => {
    await api.createUser(data);
    await fetchCustomerUsers();
  };

  const handleUpdateUser = async (data: UpdateUserRequest) => {
    if (!editingUser) return;
    await api.updateUser(editingUser.id, data);
    await fetchCustomerUsers();
  };

  const handleToggleUserActive = async (userId: number) => {
    if (!confirm('Czy na pewno chcesz zmienic status aktywnosci tego uzytkownika?')) return;
    try {
      await api.toggleUserActive(userId);
      await fetchCustomerUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Blad zmiany statusu');
    }
  };

  const handleChangePassword = async (data: ChangePasswordRequest) => {
    if (!changingPasswordUser) return;
    await api.changeUserPassword(changingPasswordUser.id, data);
  };

  const handleDeleteUser = async (userId: number, userEmail: string) => {
    if (!confirm(`Czy na pewno chcesz dezaktywowac uzytkownika ${userEmail}?`)) return;
    try {
      await api.deleteUser(userId);
      await fetchCustomerUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Blad usuwania uzytkownika');
    }
  };

  const handlePermanentDeleteUser = async (userId: number, userEmail: string) => {
    if (!confirm(`UWAGA: Trwale usuniesz uzytkownika ${userEmail}.\nTo dzialanie jest NIEODWRACALNE!\nCzy na pewno chcesz kontynuowac?`)) return;
    try {
      await api.permanentlyDeleteUser(userId);
      await fetchCustomerUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Blad trwalego usuwania uzytkownika');
    }
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
      const customerCode = (customer.customerCode || '').toLowerCase();

      return name.includes(searchLower) || nip.includes(searchTerm) || email.includes(searchLower) || customerCode.includes(searchLower);
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

  // Filter customer users by company name or email
  const filteredCustomerUsers = useMemo(() => {
    if (!accessSearchTerm.trim()) {
      return customerUsers;
    }
    const searchLower = accessSearchTerm.toLowerCase();
    return customerUsers.filter((user) => {
      const companyName = ((user as any).companyName || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const firstName = ((user as any).firstName || '').toLowerCase();
      const lastName = ((user as any).lastName || '').toLowerCase();
      return companyName.includes(searchLower) || email.includes(searchLower) || firstName.includes(searchLower) || lastName.includes(searchLower);
    });
  }, [customerUsers, accessSearchTerm]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Kontrahenci</h1>
        {activeTab === 'list' && (
          <button onClick={handleAdd} className="btn btn-primary">
            + Dodaj kontrahenta
          </button>
        )}
        {activeTab === 'access' && (
          <button
            onClick={() => setShowCreateUserModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + Dodaj konto dostepu
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'list'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Lista kontrahentow
            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs">
              {customers.length}
            </span>
          </span>
        </button>
        <button
          onClick={() => setActiveTab('access')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'access'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Dostep do sklepu
            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs">
              {customerUsers.length}
            </span>
          </span>
        </button>
      </div>

      {/* List Tab Content */}
      {activeTab === 'list' && (
        <>
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
        </>
      )}

      {/* Access Tab Content */}
      {activeTab === 'access' && (
        <>
          <div className="px-6 py-3 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-sm text-blue-700">
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Konta dostepu do sklepu internetowego. Kazde konto jest powiazane z kontrahentem i umozliwia skladanie zamowien online.
            </p>
          </div>

          {/* Search */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-md">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wyszukaj
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Nazwa firmy, email, imie, nazwisko..."
                  value={accessSearchTerm}
                  onChange={(e) => setAccessSearchTerm(e.target.value)}
                />
              </div>
              <div className="text-sm text-gray-500 pt-6">
                Znaleziono: {filteredCustomerUsers.length} z {customerUsers.length}
              </div>
            </div>
          </div>

          {customerUsersLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Ladowanie...</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Firma</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Imie</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nazwisko</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email (login)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data utworzenia</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCustomerUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{(user as any).companyName || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{(user as any).firstName || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{(user as any).lastName || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {user.isActive ? 'Aktywny' : 'Nieaktywny'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => setEditingUser(user)} className="text-blue-600 hover:text-blue-900 mr-3">Edytuj</button>
                        <button onClick={() => setChangingPasswordUser(user)} className="text-indigo-600 hover:text-indigo-900 mr-3">Haslo</button>
                        <button onClick={() => handleToggleUserActive(user.id)} className="text-yellow-600 hover:text-yellow-900 mr-3">
                          {user.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                        </button>
                        <button onClick={() => handleDeleteUser(user.id, user.email)} className="text-red-600 hover:text-red-900 mr-3">Usun</button>
                        <button onClick={() => handlePermanentDeleteUser(user.id, user.email)} className="text-red-800 hover:text-red-900 font-semibold">Usun trwale</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCustomerUsers.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500">
                    {accessSearchTerm ? 'Brak wynikow dla podanego wyszukiwania' : 'Brak kont dostepu do sklepu'}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Customer Form Modal */}
      {showForm && (
        <CustomerForm
          customer={editingCustomer}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {/* User Modals */}
      {showCreateUserModal && (
        <CreateUserModal onClose={() => setShowCreateUserModal(false)} onCreate={handleCreateUser} />
      )}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onUpdate={handleUpdateUser} />
      )}
      {changingPasswordUser && (
        <ChangePasswordModal user={changingPasswordUser} onClose={() => setChangingPasswordUser(null)} onChangePassword={handleChangePassword} />
      )}
    </div>
  );
}
