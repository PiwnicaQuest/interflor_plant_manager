import { useEffect, useState } from 'react';
import { PriceGroup, Customer, CreatePriceGroupRequest, UpdatePriceGroupRequest } from '../types';
import { api } from '../services/api';
import { CreatePriceGroupModal } from '../components/PriceGroups/CreatePriceGroupModal';
import { EditPriceGroupModal } from '../components/PriceGroups/EditPriceGroupModal';

export function PriceGroupsPage() {
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPriceGroup, setEditingPriceGroup] = useState<PriceGroup | null>(null);
  const [viewingCustomers, setViewingCustomers] = useState<{ priceGroup: PriceGroup; customers: Customer[] } | null>(null);
  const [_loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    loadPriceGroups();
  }, []);

  const loadPriceGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPriceGroups();
      setPriceGroups(data.priceGroups);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd ładowania grup cenowych');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePriceGroup = async (data: CreatePriceGroupRequest) => {
    await api.createPriceGroup(data);
    await loadPriceGroups();
  };

  const handleUpdatePriceGroup = async (id: number, data: UpdatePriceGroupRequest) => {
    await api.updatePriceGroup(id, data);
    await loadPriceGroups();
  };

  const handleDeletePriceGroup = async (priceGroup: PriceGroup) => {
    if (priceGroup.id === 1) {
      alert('Nie można usunąć domyślnej grupy cenowej');
      return;
    }

    const customerCount = priceGroup.customerCount || 0;
    if (customerCount > 0) {
      alert(`Nie można usunąć grupy cenowej. ${customerCount} klient(ów) jest przypisanych do tej grupy.`);
      return;
    }

    if (!confirm(`Czy na pewno chcesz usunąć grupę cenową "${priceGroup.name}"?`)) {
      return;
    }

    try {
      await api.deletePriceGroup(priceGroup.id);
      await loadPriceGroups();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd usuwania grupy cenowej');
    }
  };

  const handleViewCustomers = async (priceGroup: PriceGroup) => {
    setLoadingCustomers(true);
    try {
      const data = await api.getPriceGroupCustomers(priceGroup.id);
      setViewingCustomers({ priceGroup, customers: data.customers });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd ładowania klientów');
    } finally {
      setLoadingCustomers(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Ładowanie...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-800">{error}</p>
        <button onClick={loadPriceGroups} className="mt-2 text-red-600 hover:text-red-800">
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Grupy cenowe</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Dodaj grupę cenową
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nazwa
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rabat
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Opis
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Liczba klientów
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data utworzenia
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {priceGroups.map((priceGroup) => (
              <tr key={priceGroup.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{priceGroup.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    {priceGroup.discountPercentage}%
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-500 max-w-xs truncate">
                    {priceGroup.description || '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {priceGroup.customerCount && priceGroup.customerCount > 0 ? (
                    <button
                      onClick={() => handleViewCustomers(priceGroup)}
                      className="text-sm text-blue-600 hover:text-blue-900"
                    >
                      {priceGroup.customerCount} {priceGroup.customerCount === 1 ? 'klient' : 'klientów'}
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500">0 klientów</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(priceGroup.createdAt).toLocaleDateString('pl-PL')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => setEditingPriceGroup(priceGroup)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    Edytuj
                  </button>
                  {priceGroup.id !== 1 && (
                    <button
                      onClick={() => handleDeletePriceGroup(priceGroup)}
                      className="text-red-600 hover:text-red-900"
                      disabled={(priceGroup.customerCount || 0) > 0}
                    >
                      Usuń
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {priceGroups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">Brak grup cenowych</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreatePriceGroupModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePriceGroup}
        />
      )}

      {editingPriceGroup && (
        <EditPriceGroupModal
          priceGroup={editingPriceGroup}
          onClose={() => setEditingPriceGroup(null)}
          onUpdate={handleUpdatePriceGroup}
        />
      )}

      {viewingCustomers && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Klienci w grupie: {viewingCustomers.priceGroup.name}
              </h2>
              <button
                onClick={() => setViewingCustomers(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {viewingCustomers.customers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Brak klientów w tej grupie</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Nazwa/Imię i nazwisko
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Telefon
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {viewingCustomers.customers.map((customer) => (
                      <tr key={customer.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {customer.companyName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim()}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {customer.email}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {customer.phone}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewingCustomers(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
