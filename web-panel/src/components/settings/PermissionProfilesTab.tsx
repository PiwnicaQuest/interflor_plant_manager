import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { PermissionProfile, PermissionCategories, PermissionCategory, PermissionItem } from '../../types';
import { FiPlus, FiEdit2, FiTrash2, FiUsers, FiShield, FiCheck } from 'react-icons/fi';

// Color options for profiles
const PROFILE_COLORS = [
  { value: 'gray', label: 'Szary', bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
  { value: 'blue', label: 'Niebieski', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { value: 'green', label: 'Zielony', bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  { value: 'yellow', label: 'Żółty', bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  { value: 'red', label: 'Czerwony', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  { value: 'purple', label: 'Fioletowy', bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { value: 'indigo', label: 'Indygo', bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
  { value: 'pink', label: 'Różowy', bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
];

function getColorClasses(color: string) {
  const colorConfig = PROFILE_COLORS.find(c => c.value === color) || PROFILE_COLORS[0];
  return colorConfig;
}

interface ProfileFormData {
  name: string;
  description: string;
  color: string;
  permissions: string[];
}

export default function PermissionProfilesTab() {
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionCategories | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PermissionProfile | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    description: '',
    color: 'gray',
    permissions: []
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [profilesRes, permissionsRes] = await Promise.all([
        api.getPermissionProfiles(),
        api.getAvailablePermissions()
      ]);
      setProfiles(profilesRes.profiles);
      setAvailablePermissions(permissionsRes.permissions);
    } catch (error) {
      console.error('Error loading profiles:', error);
      showMessage('error', 'Błąd ładowania profili');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingProfile(null);
    setFormData({
      name: '',
      description: '',
      color: 'gray',
      permissions: []
    });
    setShowModal(true);
  };

  const openEditModal = (profile: PermissionProfile) => {
    setEditingProfile(profile);
    setFormData({
      name: profile.name,
      description: profile.description || '',
      color: profile.color,
      permissions: [...profile.permissions]
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showMessage('error', 'Nazwa profilu jest wymagana');
      return;
    }

    if (formData.permissions.length === 0) {
      showMessage('error', 'Wybierz przynajmniej jedno uprawnienie');
      return;
    }

    try {
      setSaving(true);
      if (editingProfile) {
        await api.updatePermissionProfile(editingProfile.id, {
          name: formData.name,
          description: formData.description || undefined,
          color: formData.color,
          permissions: formData.permissions
        });
        showMessage('success', 'Profil zaktualizowany');
      } else {
        await api.createPermissionProfile({
          name: formData.name,
          description: formData.description || undefined,
          color: formData.color,
          permissions: formData.permissions
        });
        showMessage('success', 'Profil utworzony');
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      showMessage('error', error.response?.data?.error || 'Błąd zapisywania profilu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deletePermissionProfile(id);
      showMessage('success', 'Profil usunięty');
      setDeleteConfirm(null);
      loadData();
    } catch (error: any) {
      console.error('Error deleting profile:', error);
      showMessage('error', error.response?.data?.error || 'Błąd usuwania profilu');
    }
  };

  const togglePermission = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p: string) => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const toggleCategoryPermissions = (categoryKey: string) => {
    if (!availablePermissions) return;
    const category = availablePermissions[categoryKey] as PermissionCategory;
    const categoryPermissions = category.permissions.map((p: PermissionItem) => p.key);
    const allSelected = categoryPermissions.every((p: string) => formData.permissions.includes(p));

    setFormData(prev => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((p: string) => !categoryPermissions.includes(p))
        : [...new Set([...prev.permissions, ...categoryPermissions])]
    }));
  };

  const selectAllPermissions = () => {
    if (!availablePermissions) return;
    const allPermissions = Object.values(availablePermissions)
      .flatMap((cat: PermissionCategory) => cat.permissions.map((p: PermissionItem) => p.key));
    setFormData(prev => ({ ...prev, permissions: allPermissions }));
  };

  const clearAllPermissions = () => {
    setFormData(prev => ({ ...prev, permissions: [] }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Profile uprawnień</h3>
          <p className="text-sm text-gray-500">
            Zarządzaj profilami uprawnień dla użytkowników systemu
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          Nowy profil
        </button>
      </div>

      {/* Profiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map(profile => {
          const colorClasses = getColorClasses(profile.color);
          return (
            <div
              key={profile.id}
              className={`bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${colorClasses.border}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${colorClasses.bg}`}>
                    <FiShield className={`w-5 h-5 ${colorClasses.text}`} />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{profile.name}</h4>
                    <p className="text-sm text-gray-500">{profile.description || 'Brak opisu'}</p>
                  </div>
                </div>
                {profile.isSystem && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    Systemowy
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <FiUsers className="w-4 h-4" />
                  <span>{profile.userCount || 0} użytkowników</span>
                </div>
                <div className="flex items-center gap-1">
                  <FiCheck className="w-4 h-4" />
                  <span>{profile.permissions.length} uprawnień</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => openEditModal(profile)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <FiEdit2 className="w-4 h-4" />
                  Edytuj
                </button>
                {!profile.isSystem && (
                  <button
                    onClick={() => setDeleteConfirm(profile.id)}
                    className="flex items-center justify-center gap-1 px-3 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-lg font-medium text-gray-900">
                {editingProfile ? 'Edytuj profil' : 'Nowy profil'}
              </h3>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nazwa profilu *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    disabled={editingProfile?.isSystem}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                    placeholder="np. Kierownik magazynu"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kolor
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {PROFILE_COLORS.map(color => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: color.value })}
                        className={`w-8 h-8 rounded-full ${color.bg} ${
                          formData.color === color.value
                            ? 'ring-2 ring-offset-2 ring-green-500'
                            : ''
                        }`}
                        title={color.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opis
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  rows={2}
                  placeholder="Krótki opis profilu..."
                />
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Uprawnienia ({formData.permissions.length} wybranych)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllPermissions}
                      className="text-xs text-green-600 hover:text-green-700"
                    >
                      Zaznacz wszystkie
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllPermissions}
                      className="text-xs text-gray-600 hover:text-gray-700"
                    >
                      Wyczyść
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availablePermissions && Object.entries(availablePermissions).map(([categoryKey, category]) => {
                    const cat = category as PermissionCategory;
                    const categoryPermissions = cat.permissions.map((p: PermissionItem) => p.key);
                    const selectedCount = categoryPermissions.filter((p: string) => formData.permissions.includes(p)).length;
                    const allSelected = selectedCount === categoryPermissions.length;

                    return (
                      <div key={categoryKey} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleCategoryPermissions(categoryKey)}
                              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                            />
                            <span className="font-medium text-gray-900">{cat.label}</span>
                          </label>
                          <span className="text-xs text-gray-500">
                            {selectedCount}/{categoryPermissions.length}
                          </span>
                        </div>
                        <div className="space-y-1 ml-6">
                          {cat.permissions.map((permission: PermissionItem) => (
                            <label
                              key={permission.key}
                              className="flex items-center gap-2 cursor-pointer text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={formData.permissions.includes(permission.key)}
                                onChange={() => togglePermission(permission.key)}
                                className="w-3.5 h-3.5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                              />
                              <span className="text-gray-700">{permission.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Zapisywanie...' : editingProfile ? 'Zapisz zmiany' : 'Utwórz profil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Usuń profil</h3>
            <p className="text-gray-600 mb-6">
              Czy na pewno chcesz usunąć ten profil? Użytkownicy przypisani do tego profilu
              zostaną odłączeni i mogą stracić dostęp do niektórych funkcji.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
