import { useEffect, useState } from 'react';
import { User, UserRole, CreateUserRequest, UpdateUserRequest, ChangePasswordRequest } from '../types';
import { api } from '../services/api';
import { CreateUserModal } from '../components/Users/CreateUserModal';
import { EditUserModal } from '../components/Users/EditUserModal';
import { ChangePasswordModal } from '../components/Users/ChangePasswordModal';

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [changingPasswordUser, setChangingPasswordUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getUsers();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd ładowania użytkowników');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (data: CreateUserRequest) => {
    await api.createUser(data);
    await loadUsers();
  };

  const handleUpdateUser = async (data: UpdateUserRequest) => {
    if (!editingUser) return;
    await api.updateUser(editingUser.id, data);
    await loadUsers();
  };

  const handleToggleActive = async (userId: number) => {
    if (!confirm('Czy na pewno chcesz zmienić status aktywności tego użytkownika?')) {
      return;
    }
    try {
      await api.toggleUserActive(userId);
      await loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd zmiany statusu');
    }
  };

  const handleChangePassword = async (data: ChangePasswordRequest) => {
    if (!changingPasswordUser) return;
    await api.changeUserPassword(changingPasswordUser.id, data);
  };

  const handleDeleteUser = async (userId: number, userEmail: string) => {
    if (!confirm(`Czy na pewno chcesz dezaktywować użytkownika ${userEmail}?`)) {
      return;
    }
    try {
      await api.deleteUser(userId);
      await loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd usuwania użytkownika');
    }
  };

  const handlePermanentDelete = async (userId: number, userEmail: string) => {
    // Najpierw pobierz informacje o powiązanych danych
    try {
      const relatedData = await api.getUserRelatedData(userId);
      
      let warningMessage = `UWAGA: Trwale usuniesz użytkownika ${userEmail}.\n\n`;
      warningMessage += "To działanie jest NIEODWRACALNE!\n\n";
      
      if (relatedData.hasCustomer) {
        warningMessage += "• Powiązany kontrahent zostanie usunięty\n";
      }
      if (relatedData.orderCount > 0) {
        warningMessage += `• ${relatedData.orderCount} zamówień zostanie odłączonych\n`;
      }
      if (relatedData.invoiceCount > 0) {
        warningMessage += `• ${relatedData.invoiceCount} faktur zostanie odłączonych\n`;
      }
      if (relatedData.movementCount > 0) {
        warningMessage += `• ${relatedData.movementCount} ruchów magazynowych zostanie odłączonych\n`;
      }
      
      warningMessage += "\nCzy na pewno chcesz kontynuować?";
      
      if (!confirm(warningMessage)) {
        return;
      }
      
      const result = await api.permanentlyDeleteUser(userId);
      alert(`Użytkownik ${result.deletedEmail} został trwale usunięty.` + 
        (result.deletedCustomer ? "\nPowiązany kontrahent został usunięty." : ""));
      await loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || "Błąd usuwania użytkownika");
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-red-100 text-red-800';
      case UserRole.WAREHOUSE:
        return 'bg-blue-100 text-blue-800';
      case UserRole.POS:
        return 'bg-green-100 text-green-800';
      case UserRole.CUSTOMER:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'Administrator';
      case UserRole.WAREHOUSE:
        return 'Magazynier';
      case UserRole.POS:
        return 'Kasjer';
      case UserRole.CUSTOMER:
        return 'Klient';
      default:
        return role;
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
        <button onClick={loadUsers} className="mt-2 text-red-600 hover:text-red-800">
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Zarządzanie użytkownikami</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Dodaj użytkownika
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rola
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
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
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
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
                  <button
                    onClick={() => setEditingUser(user)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    Edytuj
                  </button>
                  <button
                    onClick={() => setChangingPasswordUser(user)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Hasło
                  </button>
                  <button
                    onClick={() => handleToggleActive(user.id)}
                    className="text-yellow-600 hover:text-yellow-900 mr-3"
                  >
                    {user.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.email)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Usuń
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(user.id, user.email)}
                    className="text-red-800 hover:text-red-950 ml-2 font-bold"
                    title="Trwale usuń użytkownika i powiązane dane"
                  >
                    Usuń trwale
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">Brak użytkowników</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateUser}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdate={handleUpdateUser}
        />
      )}

      {changingPasswordUser && (
        <ChangePasswordModal
          user={changingPasswordUser}
          onClose={() => setChangingPasswordUser(null)}
          onChangePassword={handleChangePassword}
        />
      )}
    </div>
  );
}
