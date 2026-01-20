import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';

export function ScannerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

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

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/scanner/login', { replace: true });
  };

  if (!isAuthenticated) {
    return null;
  }

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isAdmin = userRole === 'admin';

  return (
    <div
      className="h-screen flex flex-col overflow-hidden bg-gray-100"
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
        className="bg-green-600 text-white shadow-lg flex-shrink-0"
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
            <button
              onClick={handleLogout}
              className="px-2.5 py-1 bg-green-700 hover:bg-green-800 rounded text-xs font-medium transition-colors"
            >
              Wyloguj
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom Navigation - with safe area support */}
      <nav
        className="bg-white border-t border-gray-200 flex-shrink-0"
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
                ? 'text-green-600 bg-green-50'
                : 'text-gray-600 hover:text-green-600 hover:bg-gray-50'
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
                ? 'text-green-600 bg-green-50'
                : 'text-gray-600 hover:text-green-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span className="text-[10px] font-medium">Zamówienia</span>
          </Link>

          {isAdmin && (
            <Link
              to="/scanner/losses"
              className={`flex-1 flex flex-col items-center py-2 px-1.5 ${
                isActive('/scanner/losses')
                  ? 'text-red-600 bg-red-50'
                  : 'text-gray-600 hover:text-red-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-[10px] font-medium">Straty</span>
            </Link>
          )}

          <Link
            to="/scanner/orders/new"
            className={`flex-1 flex flex-col items-center py-2 px-1.5 ${
              location.pathname === '/scanner/orders/new'
                ? 'text-green-600 bg-green-50'
                : 'text-gray-600 hover:text-green-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-[10px] font-medium">Nowe</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
