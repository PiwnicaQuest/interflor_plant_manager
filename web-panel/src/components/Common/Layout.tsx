import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useNotifications } from '../../contexts/NotificationContext';
import { NotificationCenter } from './NotificationCenter';
import { ToastContainer } from './Toast';
import { WebSocketMessage, OrderStatusChangedEvent, OrderCancelledEvent } from '../../types/notifications';
export function Layout() {
  const navigate = useNavigate();
  const { showNotification } = useNotifications();
  const [toasts, setToasts] = useState<Array<{ id: string; type: any; message: string }>>([]);
  const getUserRole = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role;
    } catch {
      return null;
    }
  };
  const userRole = getUserRole();
  const isAdmin = userRole === 'admin';
  const isWarehouse = userRole === 'warehouse';
  const handleLogout = () => {
    localStorage.removeItem('token');
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
  // Grouped navigation items
  const navGroups = [
    // Dashboard
    [
      { path: '/dashboard', label: 'Dashboard' }
    ],
    // Magazyn
    [
      { path: '/inventory', label: 'Magazyn' },
      ...((isAdmin || isWarehouse) ? [
        { path: '/inventory-movements', label: 'Historia' }
      ] : []),
    ],
    // Sprzedaż
    [
      { path: '/orders', label: 'Zamówienia' },
      { path: '/pos', label: 'Kasa' },
    ],
    // Dokumenty
    [
      { path: '/invoices', label: 'Faktury' },
      { path: '/proforma', label: 'Pro Forma' },
      { path: '/receipts', label: 'Paragony' },
    ],
    // Dane
    [
      { path: '/customers', label: 'Kontrahenci' },
      { path: '/reports', label: 'Raporty' },
    ],
    // Administracja
    ...(isAdmin ? [
      [
        { path: '/settings', label: 'Ustawienia' },
        { path: '/templates', label: 'Szablony' },
        { path: '/losses', label: 'Straty' }
      ]
    ] : []),
  ];
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={handleCloseToast} />
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-2xl font-bold text-primary-600">PlantManager</h1>
              <nav className="hidden md:flex items-center">
                {navGroups.map((group, groupIndex) => (
                  <div key={groupIndex} className="flex items-center">
                    {groupIndex > 0 && (
                      <div className="h-6 w-px bg-gray-300 mx-2"></div>
                    )}
                    <div className="flex space-x-1">
                      {group.map((item) => (
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
                  </div>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <NotificationCenter />
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
