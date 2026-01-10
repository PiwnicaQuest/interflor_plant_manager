import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { InventoryMovement, MovementType, User } from '../types';
import { useSearchParams } from 'react-router-dom';

const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  [MovementType.PURCHASE]: 'Zakup',
  [MovementType.SALE]: 'Sprzedaż',
  [MovementType.CORRECTION]: 'Korekta',
  [MovementType.RETURN]: 'Zwrot',
  [MovementType.ADJUSTMENT]: 'Korekta stanu',
  [MovementType.ORDER]: 'Zamówienie',
  [MovementType.DAMAGE]: 'Uszkodzenie',
  [MovementType.LOSS]: 'Strata',
  [MovementType.LOSS_REVERSAL]: 'Cofnięcie straty',
  [MovementType.MERGE]: 'Połączenie',
  [MovementType.OTHER]: 'Inne'
};

const MOVEMENT_TYPE_COLORS: Record<MovementType, string> = {
  [MovementType.PURCHASE]: 'bg-blue-100 text-blue-800',
  [MovementType.SALE]: 'bg-green-100 text-green-800',
  [MovementType.CORRECTION]: 'bg-yellow-100 text-yellow-800',
  [MovementType.RETURN]: 'bg-purple-100 text-purple-800',
  [MovementType.ADJUSTMENT]: 'bg-orange-100 text-orange-800',
  [MovementType.ORDER]: 'bg-indigo-100 text-indigo-800',
  [MovementType.DAMAGE]: 'bg-red-100 text-red-800',
  [MovementType.LOSS]: 'bg-red-100 text-red-800',
  [MovementType.LOSS_REVERSAL]: 'bg-green-100 text-green-800',
  [MovementType.MERGE]: 'bg-cyan-100 text-cyan-800',
  [MovementType.OTHER]: 'bg-gray-100 text-gray-800'
};

export function InventoryMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [statistics, setStatistics] = useState<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedType, setSelectedType] = useState<MovementType | ''>((searchParams.get('type') as MovementType) || '');
  const [selectedUserId, setSelectedUserId] = useState<number | ''>(searchParams.get('userId') ? parseInt(searchParams.get('userId')!) : '');
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');

  // Pagination
  const limit = 50;
  const [offset, setOffset] = useState(parseInt(searchParams.get('offset') || '0'));

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  // Fetch users for filter
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await api.getUsers();
        setUsers(data.users);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    fetchUsers();
  }, []);

  // Fetch movements with debounce
  const fetchMovements = useCallback(async () => {
    try {
      setLoading(true);

      const filters: any = {
        limit,
        offset,
      };

      if (selectedType) filters.type = selectedType;
      if (selectedUserId) filters.userId = selectedUserId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (searchTerm) filters.search = searchTerm;

      const data = await api.getInventoryMovements(filters);

      setMovements(data.movements);
      setTotal(data.total);

      // Fetch statistics
      const statsFilters: any = {};
      if (startDate) statsFilters.startDate = startDate;
      if (endDate) statsFilters.endDate = endDate;

      const stats = await api.getInventoryMovementStatistics(statsFilters);
      setStatistics(stats);
    } catch (error) {
      console.error('Error fetching movements:', error);
    } finally {
      setLoading(false);
    }
  }, [offset, selectedType, selectedUserId, startDate, endDate, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMovements();
    }, 300);

    return () => clearTimeout(timer);
  }, [fetchMovements]);

  // Update URL params
  useEffect(() => {
    const params: any = {};
    if (searchTerm) params.search = searchTerm;
    if (selectedType) params.type = selectedType;
    if (selectedUserId) params.userId = selectedUserId.toString();
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (offset > 0) params.offset = offset.toString();
    setSearchParams(params);
  }, [searchTerm, selectedType, selectedUserId, startDate, endDate, offset, setSearchParams]);

  // Reset offset when search term changes
  useEffect(() => {
    setOffset(0);
  }, [searchTerm]);

  const handleReset = () => {
    setSearchTerm('');
    setSelectedType('');
    setSelectedUserId('');
    setStartDate('');
    setEndDate('');
    setOffset(0);
  };

  const handleExportCSV = () => {
    const csvContent = [
      ['Data', 'Produkt', 'Kod kreskowy', 'Typ ruchu', 'Jednostki (delta)', 'Palety (delta)', 'Użytkownik', 'Notatki'],
      ...movements.map(m => [
        new Date(m.createdAt).toLocaleString('pl-PL'),
        m.plantName || '-',
        m.barcode || '-',
        MOVEMENT_TYPE_LABELS[m.movementType],
        m.deltaUnits.toString(),
        m.deltaPallets.toString(),
        m.userEmail || '-',
        m.reason || '-'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historia_ruchow_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handlePageChange = (newPage: number) => {
    setOffset((newPage - 1) * limit);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Historia ruchów magazynowych</h1>
          <p className="text-gray-600 mt-1">Szczegółowy audit log zmian stanów magazynowych</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Eksportuj do CSV
        </button>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Łącznie ruchów</p>
            <p className="text-2xl font-bold text-gray-900">{statistics.totalMovements}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Jednostki: przyjęte</p>
            <p className="text-2xl font-bold text-green-600">+{statistics.totalUnitsIn}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Jednostki: wydane</p>
            <p className="text-2xl font-bold text-red-600">-{statistics.totalUnitsOut}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Palety: przyjęte</p>
            <p className="text-2xl font-bold text-green-600">+{statistics.totalPalletsIn}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Palety: wydane</p>
            <p className="text-2xl font-bold text-red-600">-{statistics.totalPalletsOut}</p>
          </div>
        </div>
      )}

      {/* Breakdown by Type */}
      {statistics && statistics.byType.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Rozkład wg typu ruchu</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statistics.byType.map((stat: any) => (
              <div key={stat.movementType} className="border rounded-lg p-3">
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 ${MOVEMENT_TYPE_COLORS[stat.movementType as MovementType]}`}>
                  {MOVEMENT_TYPE_LABELS[stat.movementType as MovementType]}
                </span>
                <p className="text-sm text-gray-600">Ruchów: {stat.count}</p>
                <p className="text-sm text-gray-600">Jednostek: {stat.totalUnits}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Filtry</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Szukaj produktu
            </label>
            <input
              type="text"
              placeholder="Nazwa lub kod kreskowy..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Typ ruchu
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as MovementType | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Wszystkie</option>
              {Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Użytkownik
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Wszyscy</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data od
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data do
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Resetuj filtry
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Produkt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Typ ruchu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jednostki
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Palety
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Użytkownik
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notatki
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    Ładowanie...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    Brak ruchów spełniających kryteria wyszukiwania
                  </td>
                </tr>
              ) : (
                movements.map((movement) => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(movement.createdAt).toLocaleString('pl-PL', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {movement.plantName || '-'}
                      </div>
                      {movement.barcode && (
                        <div className="text-xs text-gray-500">{movement.barcode}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${MOVEMENT_TYPE_COLORS[movement.movementType]}`}>
                        {MOVEMENT_TYPE_LABELS[movement.movementType]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${movement.deltaUnits >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {movement.deltaUnits >= 0 ? '+' : ''}{movement.deltaUnits}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${movement.deltaPallets >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {movement.deltaPallets >= 0 ? '+' : ''}{movement.deltaPallets}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {movement.userEmail || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {movement.reason || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Poprzednia
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Następna
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Pokazuje <span className="font-medium">{offset + 1}</span> do{' '}
                  <span className="font-medium">{Math.min(offset + limit, total)}</span> z{' '}
                  <span className="font-medium">{total}</span> wyników
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Poprzednia
                  </button>
                  {[...Array(totalPages)].map((_, i) => {
                    const page = i + 1;
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 2 && page <= currentPage + 2)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            page === currentPage
                              ? 'z-10 bg-primary-50 border-primary-500 text-primary-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 3 || page === currentPage + 3) {
                      return (
                        <span key={page} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Następna
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
