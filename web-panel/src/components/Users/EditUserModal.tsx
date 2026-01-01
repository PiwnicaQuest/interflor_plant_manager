import { useState, useEffect } from 'react';
import { User, UserRole, UpdateUserRequest, PermissionProfile } from '../../types';
import { api } from '../../services/api';

interface EditUserModalProps {
  user: User & { profileId?: number; profileName?: string };
  onClose: () => void;
  onUpdate: (data: UpdateUserRequest) => Promise<void>;
}

export function EditUserModal({ user, onClose, onUpdate }: EditUserModalProps) {
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [profileId, setProfileId] = useState<number | undefined>(user.profileId);
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const response = await api.getPermissionProfiles();
      setProfiles(response.profiles);
    } catch (err) {
      console.error('Error loading profiles:', err);
    } finally {
      setProfilesLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Nieprawidłowy format email');
      return;
    }

    setLoading(true);
    try {
      await onUpdate({ email, role, isActive, profileId });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas aktualizacji użytkownika');
    } finally {
      setLoading(false);
    }
  };

  // Get color classes for profile badge
  const getProfileColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      gray: { bg: 'bg-gray-100', text: 'text-gray-800' },
      blue: { bg: 'bg-blue-100', text: 'text-blue-800' },
      green: { bg: 'bg-green-100', text: 'text-green-800' },
      yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      red: { bg: 'bg-red-100', text: 'text-red-800' },
      purple: { bg: 'bg-purple-100', text: 'text-purple-800' },
      indigo: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
      pink: { bg: 'bg-pink-100', text: 'text-pink-800' },
    };
    return colorMap[color] || colorMap.gray;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Edytuj użytkownika</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rola
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value={UserRole.ADMIN}>Administrator</option>
              <option value={UserRole.WAREHOUSE}>Magazynier</option>
              <option value={UserRole.POS}>Kasjer/Sprzedawca</option>
              <option value={UserRole.CUSTOMER}>Klient</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Profil uprawnień
            </label>
            {profilesLoading ? (
              <div className="text-gray-500 text-sm">Ładowanie profili...</div>
            ) : (
              <select
                value={profileId || ''}
                onChange={(e) => setProfileId(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Brak profilu --</option>
                {profiles.map((profile) => {
                  const colors = getProfileColorClasses(profile.color);
                  return (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.permissions.length} uprawnień)
                    </option>
                  );
                })}
              </select>
            )}
            {profileId && profiles.length > 0 && (
              <div className="mt-2">
                {(() => {
                  const selectedProfile = profiles.find(p => p.id === profileId);
                  if (!selectedProfile) return null;
                  const colors = getProfileColorClasses(selectedProfile.color);
                  return (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {selectedProfile.name}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">Aktywny</span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              disabled={loading}
            >
              {loading ? 'Zapisywanie...' : 'Zapisz zmiany'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
