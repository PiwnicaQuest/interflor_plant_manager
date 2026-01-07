import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { ROLE_LABELS } from '../types';

export function Layout() {
  const { isAuthenticated, customer, user, logout } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Get display name: prefer customer company name, then user name, then email
  const getDisplayName = () => {
    if (customer?.companyName) return customer.companyName;
    if (customer?.firstName) return customer.firstName;
    if (user?.firstName) return user.firstName;
    if (user?.email) return user.email.split('@')[0];
    return 'Użytkownik';
  };

  // Get role label in Polish
  const getRoleLabel = () => {
    if (!user?.role) return '';
    return ROLE_LABELS[user.role] || user.role;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl">🌿</span>
              <span className="text-xl font-bold text-green-700">PlantShop</span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-4">
              <Link to="/" className="text-gray-600 hover:text-green-600 font-medium">
                Katalog
              </Link>

              {isAuthenticated && (
                <>
                  <Link to="/orders" className="text-gray-600 hover:text-green-600 font-medium">
                    Zamówienia
                  </Link>
                  <Link to="/profile" className="text-gray-600 hover:text-green-600 font-medium">
                    Profil
                  </Link>
                  <a
                    href="https://polflor.orderyourflowers.nl/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <span>🌷</span>
                    <span className="hidden sm:inline">Zamówienie specjalne</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>

                  {/* Cart - ONLY visible when authenticated */}
                  <Link to="/cart" className="relative p-2 text-gray-600 hover:text-green-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    {totalItems > 0 && (
                      <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {totalItems}
                      </span>
                    )}
                  </Link>
                </>
              )}

              {/* Auth */}
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-700">
                      {getDisplayName()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {getRoleLabel()}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Wyloguj
                  </button>
                </div>
              ) : (
                <Link to="/login" className="btn btn-primary text-sm">
                  Zaloguj się
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-gray-500 text-sm">
            &copy; 2024 PlantManager. Wszystkie prawa zastrzeżone.
          </p>
        </div>
      </footer>
    </div>
  );
}
