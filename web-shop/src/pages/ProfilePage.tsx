import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Customer } from '../types';
import { useAuth } from '../contexts/AuthContext';

export function ProfilePage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    }
  }, [isAuthenticated]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const result = await api.getProfile();
      setCustomer(result.customer);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Błąd ładowania profilu');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Wszystkie pola są wymagane');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Nowe hasło musi mieć minimum 6 znaków');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Nowe hasła nie są identyczne');
      return;
    }

    try {
      setChangingPassword(true);
      await api.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Hasło zostało zmienione pomyślnie');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const error = err as Error;
      setPasswordError(error.message || 'Błąd zmiany hasła');
    } finally {
      setChangingPassword(false);
    }
  };

  if (authLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: '/profile' }} replace />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-8">Mój profil</h1>

      <div className="grid gap-4 sm:gap-8 md:grid-cols-2">
        {/* Profile Info */}
        <div className="card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
            <span className="text-xl sm:text-2xl">👤</span>
            Dane konta
          </h2>

          {loading ? (
            <div className="text-center py-6 sm:py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
              <p className="mt-2 text-gray-600 text-sm">Ładowanie danych...</p>
            </div>
          ) : error ? (
            <div className="text-center py-6 sm:py-8">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          ) : customer ? (
            <div className="space-y-3 sm:space-y-4">
              {/* Company name */}
              {customer.companyName && (
                <div>
                  <label className="text-xs sm:text-sm font-medium text-gray-500">Firma</label>
                  <p className="text-sm sm:text-base text-gray-900 font-medium">{customer.companyName}</p>
                </div>
              )}

              {/* Name */}
              {(customer.firstName || customer.lastName) && (
                <div>
                  <label className="text-xs sm:text-sm font-medium text-gray-500">Imię i nazwisko</label>
                  <p className="text-sm sm:text-base text-gray-900">{customer.firstName} {customer.lastName}</p>
                </div>
              )}

              {/* NIP */}
              {customer.nip && (
                <div>
                  <label className="text-xs sm:text-sm font-medium text-gray-500">NIP</label>
                  <p className="text-sm sm:text-base text-gray-900">{customer.nip}</p>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">Email</label>
                <p className="text-sm sm:text-base text-gray-900 break-all">{customer.email}</p>
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">Telefon</label>
                <p className="text-sm sm:text-base text-gray-900">{customer.phone}</p>
              </div>

              {/* Address */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">Adres</label>
                <p className="text-sm sm:text-base text-gray-900">{customer.street}</p>
                <p className="text-sm sm:text-base text-gray-900">{customer.postalCode} {customer.city}</p>
                <p className="text-sm sm:text-base text-gray-900">{customer.country}</p>
              </div>

            </div>
          ) : null}
        </div>

        {/* Password Change */}
        <div className="card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
            <span className="text-xl sm:text-2xl">🔒</span>
            Zmiana hasła
          </h2>

          <form onSubmit={handlePasswordChange} className="space-y-3 sm:space-y-4">
            {/* Current password */}
            <div>
              <label htmlFor="currentPassword" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Obecne hasło
              </label>
              <input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                placeholder="Wpisz obecne hasło"
              />
            </div>

            {/* New password */}
            <div>
              <label htmlFor="newPassword" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Nowe hasło
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                placeholder="Minimum 6 znaków"
              />
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Potwierdź nowe hasło
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                placeholder="Powtórz nowe hasło"
              />
            </div>

            {/* Error message */}
            {passwordError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3">
                <p className="text-red-700 text-xs sm:text-sm">{passwordError}</p>
              </div>
            )}

            {/* Success message */}
            {passwordSuccess && (
              <div className="bg-pink-50 border border-pink-200 rounded-lg p-2 sm:p-3">
                <p className="text-pink-700 text-xs sm:text-sm">{passwordSuccess}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={changingPassword}
              className="w-full btn btn-primary py-2.5 sm:py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {changingPassword ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Zmieniam hasło...
                </span>
              ) : (
                'Zmień hasło'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
