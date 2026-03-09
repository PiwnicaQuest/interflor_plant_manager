import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { NavDropdown } from './NavDropdown';
import { useState, useCallback, useMemo } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useHeartbeat } from '../../hooks/useHeartbeat';
import { useNotifications } from '../../contexts/NotificationContext';
import { NotificationCenter } from './NotificationCenter';
import { ToastContainer } from './Toast';
import { WebSocketMessage, OrderStatusChangedEvent, OrderCancelledEvent } from '../../types/notifications';

// Navigation types
type NavItem = { path: string; label: string };
type NavDropdownItem = { type: 'dropdown'; label: string; items: NavItem[] };
type NavGroup = NavItem[] | NavDropdownItem;

export function Layout() {
  const navigate = useNavigate();
  const { showNotification } = useNotifications();
  const [toasts, setToasts] = useState<Array<{ id: string; type: any; message: string }>>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getUserInfo = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payload = JSON.parse(decodeURIComponent(atob(token.split(".")[1]).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
      return {
        role: payload.role,
        email: payload.email,
        firstName: payload.firstName
      };
    } catch {
      return null;
    }
  };
  const userInfo = getUserInfo();
  const userRole = userInfo?.role;
  const isAdmin = userRole === 'admin';
  const isWarehouse = userRole === 'warehouse';
  const displayName = userInfo?.firstName || userInfo?.email?.split('@')[0] || '';
  const handleLogout = async () => {
    await api.logout();
    localStorage.removeItem('token');
    localStorage.removeItem('userPermissions');
    localStorage.removeItem('userRole');
    navigate('/login');
  };
  // WebSocket message handler
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      // Handle authentication responses
      if (message.type === 'auth:success') {
        console.log('[Layout] WebSocket authenticated');
        return;
      }
      if (message.type === 'auth:failed') {
        console.error('[Layout] WebSocket authentication failed:', message.error);
        return;
      }
      // Handle order events
      if (message.type === 'order:status_changed') {
        const event = message as OrderStatusChangedEvent;
        const { orderNumber, oldStatus, newStatus } = event.data;
        const notificationMessage = `Zamówienie ${orderNumber} zmieniono status z ${oldStatus} na ${newStatus}`;
        // Show toast
        const toastId = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id: toastId, type: 'info', message: notificationMessage }]);
        // Add to notification center
        showNotification(notificationMessage, 'info');
      }
      if (message.type === 'order:cancelled') {
        const event = message as OrderCancelledEvent;
        const { orderNumber } = event.data;
        const notificationMessage = `Zamówienie ${orderNumber} zostało anulowane`;
        // Show toast
        const toastId = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id: toastId, type: 'warning', message: notificationMessage }]);
        // Add to notification center
        showNotification(notificationMessage, 'warning');
      }
    },
    [showNotification]
  );
  // Session heartbeat (keeps user visible as online)
  useHeartbeat();

  // WebSocket connection
  useWebSocket({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws',
    onMessage: handleWebSocketMessage,
    onConnect: () => {
      console.log('[Layout] WebSocket connected');
    },
    onDisconnect: () => {
      console.log('[Layout] WebSocket disconnected');
    },
    onError: (error) => {
      console.error('[Layout] WebSocket error:', error);
    },
  });
  const handleCloseToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Use permissions hook
  const { hasPermission, hasAnyPermission } = usePermissions();

  // Navigation groups - filtered by permissions
  const navGroups: NavGroup[] = useMemo(() => {
    const groups: NavGroup[] = [];

    // Dashboard - only for admin
    if (isAdmin) { groups.push([{ path: '/dashboard', label: 'Dashboard' }]); }

    // Magazyn
    const magazynItems: NavItem[] = [];
    if (hasPermission('inventory:view')) {
      magazynItems.push({ path: '/inventory', label: 'Magazyn' });
    }
    if (hasPermission('inventory:view')) {
      magazynItems.push({ path: '/inventory-movements', label: 'Historia' });
    }
    if (magazynItems.length > 0) {
      groups.push(magazynItems);
    }

    // Sprzedaż
    const sprzedazItems: NavItem[] = [];
    if (hasPermission('orders:view')) {
      sprzedazItems.push({ path: '/orders', label: 'Zamówienia' });
    }
    if (hasPermission('pos:access')) {
      sprzedazItems.push({ path: '/pos', label: 'Kasa' });
    }
    if (sprzedazItems.length > 0) {
      groups.push(sprzedazItems);
    }

    // Dokumenty - jako dropdown
    const dokumentyItems: NavItem[] = [];
    if (hasPermission('invoices:view')) {
      dokumentyItems.push({ path: '/invoices', label: 'Faktury' });
      dokumentyItems.push({ path: '/invoice-corrections', label: 'Korekty faktur' });
      dokumentyItems.push({ path: '/proforma', label: 'Pro Forma' });
    }
    if (hasPermission('receipts:view')) {
      dokumentyItems.push({ path: '/receipts', label: 'Paragony' });
    }
    if (dokumentyItems.length > 0) {
      groups.push({
        type: 'dropdown',
        label: 'Dokumenty',
        items: dokumentyItems
      });
    }

    // Dane
    const daneItems: NavItem[] = [];
    if (hasPermission('customers:view')) {
      daneItems.push({ path: '/customers', label: 'Kontrahenci' });
    }
    if (hasPermission('reports:view')) {
      daneItems.push({ path: '/reports', label: 'Raporty' });
    }
    if (daneItems.length > 0) {
      groups.push(daneItems);
    }

    // Administracja
    const adminItems: NavItem[] = [];
    if (hasPermission('settings:view')) {
      adminItems.push({ path: '/settings', label: 'Ustawienia' });
    }
    if (hasPermission('settings:edit')) {
      adminItems.push({ path: '/templates', label: 'Szablony etykiet' });
    }
    if (hasPermission('inventory:delete')) {
      adminItems.push({ path: '/losses', label: 'Straty' });
    }
    if (adminItems.length > 0) {
      groups.push(adminItems);
    }

    return groups;
  }, [hasPermission, hasAnyPermission]);

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={handleCloseToast} />
      {/* Header */}
      <header className="flex-shrink-0 bg-brand shadow-sm border-b border-brand-dark">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 md:h-16">
            <div className="flex items-center space-x-8">
              {/* Hamburger button - mobile only */}
              <button
                className="md:hidden p-2 rounded-md text-gray-200 hover:bg-brand-dark"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Otwórz menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <img src="/interflor-logo.png" alt="INTERFLOR" className="h-20" />
              </div>
              <nav className="hidden md:flex items-center">
                {navGroups.map((group, groupIndex) => (
                  <div key={groupIndex} className="flex items-center">
                    {groupIndex > 0 && (
                      <div className="h-6 w-px bg-brand-light mx-2"></div>
                    )}
                    {'type' in group && group.type === 'dropdown' ? (
                      <NavDropdown label={group.label} items={group.items} />
                    ) : (
                      <div className="flex space-x-1">
                        {(group as NavItem[]).map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                              `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                isActive
                                  ? 'bg-white/20 text-white font-semibold'
                                  : 'text-white hover:bg-brand-dark'
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <NotificationCenter />
              <span className="hidden md:inline text-sm font-medium text-white">{displayName}</span>
              <button
                onClick={handleLogout}
                className="hidden md:inline-block px-4 py-2 text-sm text-white hover:text-gray-200"
              >
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Slide-in panel */}
          <div className="fixed inset-y-0 left-0 w-72 bg-brand shadow-xl overflow-y-auto">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-brand-dark">
              <img src="/interflor-logo.png" alt="INTERFLOR" className="h-20" />
              <button
                className="p-2 rounded-md text-gray-200 hover:bg-brand-dark"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Zamknij menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Navigation links */}
            <nav className="px-2 py-4 space-y-1">
              {navGroups.map((group, groupIndex) => (
                <div key={groupIndex}>
                  {groupIndex > 0 && (
                    <div className="h-px bg-brand-light my-2 mx-2"></div>
                  )}
                  {'type' in group && group.type === 'dropdown' ? (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        {group.label}
                      </div>
                      {group.items.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              isActive
                                ? 'bg-white/20 text-white font-semibold'
                                : 'text-white hover:bg-brand-dark'
                            }`
                          }
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : (
                    (group as NavItem[]).map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-white/20 text-white font-semibold'
                              : 'text-white hover:bg-brand-dark'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))
                  )}
                </div>
              ))}
            </nav>
            {/* User info + logout */}
            <div className="border-t border-brand-dark px-4 py-4 mt-2">
              <div className="text-sm font-medium text-white mb-3">{displayName}</div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-white hover:bg-brand-dark transition-colors"
              >
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
