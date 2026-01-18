import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { NavDropdown } from './NavDropdown';
import { useState, useCallback, useMemo } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { useWebSocket } from '../../hooks/useWebSocket';
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
  const getUserInfo = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
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
  const handleLogout = () => {
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

    // Dashboard - always visible
    groups.push([{ path: '/dashboard', label: 'Dashboard' }]);

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
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={handleCloseToast} />
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center gap-2">
                <img src="/polflor-logo.png" alt="POLFLOR" className="h-8" />
              </div>
              <nav className="hidden md:flex items-center">
                {navGroups.map((group, groupIndex) => (
                  <div key={groupIndex} className="flex items-center">
                    {groupIndex > 0 && (
                      <div className="h-6 w-px bg-gray-300 mx-2"></div>
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
                                  ? 'bg-primary-100 text-primary-700'
                                  : 'text-gray-700 hover:bg-gray-100'
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
              <span className="text-sm font-medium text-gray-700">{displayName}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
              >
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
