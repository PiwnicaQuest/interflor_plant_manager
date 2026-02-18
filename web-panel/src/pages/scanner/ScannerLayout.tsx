import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useHeartbeat } from '../../hooks/useHeartbeat';

export function ScannerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userLogin, setUserLogin] = useState<string | null>(null);
  const [showMagazynMenu, setShowMagazynMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const magazynMenuRef = useRef<HTMLDivElement>(null);

  // Connect to WebSocket so scanner users appear as online on dashboard
  useWebSocket({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws',
  });

  // Send periodic heartbeat to keep session active even when screen is off
  useHeartbeat();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/scanner/login', { replace: true });
    } else {
      setIsAuthenticated(true);
      // Decode JWT to get user role
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserRole(payload.role);
        setUserLogin(payload.login || payload.firstName || payload.email);
      } catch {
        setUserRole(null);
      }
    }

    // Check if running as PWA standalone
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone
      || document.referrer.includes('android-app://');
    setIsStandalone(isInStandaloneMode);
  }, [navigate]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (magazynMenuRef.current && !magazynMenuRef.current.contains(event.target as Node)) {
        setShowMagazynMenu(false);
      }
    };

    if (showMagazynMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMagazynMenu]);

  // Close menu on route change
  useEffect(() => {
    setShowMagazynMenu(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/scanner/login', { replace: true });
  };

  if (!isAuthenticated) {
    return null;
  }

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isAdmin = userRole === 'admin';
  const isMagazynActive = isActive('/scanner/losses') || isActive('/scanner/inventory');

  return (
    <div
      className="h-screen flex flex-col overflow-hidden bg-surface"
      style={{
        // Support for iOS safe areas (notch, home indicator)
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Header - with safe area background */}
      <header
        className="bg-brand text-white shadow-lg flex-shrink-0"
        style={{
          // Extend green background into safe area on top
          marginTop: 'calc(-1 * env(safe-area-inset-top))',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isStandalone && <span className="text-lg">📱</span>}
              <h1 className="text-base font-bold">Skaner Magazynowy</h1>
            </div>
            <div className="flex items-center gap-2">
              {userLogin && (
                <span className="text-xs text-gray-300">{userLogin}</span>
              )}
              <button
                onClick={() => setShowLogoutModal(true)}
                className="px-2.5 py-1 bg-brand-light hover:bg-brand-dark rounded text-xs font-medium transition-colors"
              >
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom Navigation - with safe area support */}
      <nav
        className="bg-white border-t border-gray-200 flex-shrink-0 relative"
        style={{
          // Extend white background into safe area on bottom
          marginBottom: 'calc(-1 * env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex">
          <Link
            to="/scanner/scan"
            className={`flex-1 flex flex-col items-center py-2 px-1.5 ${
              isActive('/scanner/scan')
                ? 'text-primary-600 bg-primary-50'
                : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <span className="text-[10px] font-medium">Skanuj</span>
          </Link>

          <Link
            to="/scanner/orders"
            className={`flex-1 flex flex-col items-center py-2 px-1.5 ${
              isActive('/scanner/orders') && !location.pathname.includes('/new')
                ? 'text-primary-600 bg-primary-50'
                : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span className="text-[10px] font-medium">Zamówienia</span>
          </Link>

          <Link
            to="/scanner/orders/new"
            className={`flex-1 flex flex-col items-center py-2 px-1.5 ${
              location.pathname === '/scanner/orders/new'
                ? 'text-primary-600 bg-primary-50'
                : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-[10px] font-medium">Nowe</span>
          </Link>


          <Link
            to="/scanner/pos"
            className={`flex-1 flex flex-col items-center py-2 px-1.5 ${
              isActive('/scanner/pos')
                ? 'text-primary-600 bg-primary-50'
                : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-[10px] font-medium">Kasa</span>
          </Link>
          {/* Magazyn dropdown - only for admin */}
          {isAdmin && (
            <div className="flex-1 relative" ref={magazynMenuRef}>
              <button
                onClick={() => setShowMagazynMenu(!showMagazynMenu)}
                className={`w-full flex flex-col items-center py-2 px-1.5 ${
                  isMagazynActive
                    ? 'text-orange-600 bg-orange-50'
                    : 'text-gray-600 hover:text-orange-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span className="text-[10px] font-medium flex items-center gap-0.5">
                  Magazyn
                  <svg className={`w-2.5 h-2.5 transition-transform ${showMagazynMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
                  </svg>
                </span>
              </button>

              {/* Dropdown Menu */}
              {showMagazynMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-44 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50">
                  <Link
                    to="/scanner/losses"
                    onClick={() => setShowMagazynMenu(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${
                      isActive('/scanner/losses')
                        ? 'bg-red-50 text-red-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">Straty</span>
                  </Link>
                  <Link
                    to="/scanner/inventory"
                    onClick={() => setShowMagazynMenu(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm border-t border-gray-100 ${
                      isActive('/scanner/inventory')
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <span className="font-medium">Inwentaryzacja</span>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setShowLogoutModal(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Wylogowanie
            </h3>
            <p className="text-gray-600 mb-6">
              Czy na pewno chcesz się wylogować?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
