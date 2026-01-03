import { useState, useEffect } from 'react';
import { websocketService } from '../services/websocketService';

interface OnlineUser {
  userId: number;
  email: string;
  role: string;
  connectedAt: string;
}

interface OnlineUsersData {
  employees: OnlineUser[];
  customers: OnlineUser[];
}

export function OnlineUsers() {
  const [onlineData, setOnlineData] = useState<OnlineUsersData>({ employees: [], customers: [] });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to WebSocket
    websocketService.connect();

    // Subscribe to online-users channel after authentication
    const handleAuthSuccess = () => {
      setIsConnected(true);
      websocketService.subscribe('online-users');
    };

    const handleOnlineUsersUpdate = (data: OnlineUsersData) => {
      setOnlineData(data);
    };

    const unsubAuth = websocketService.on('auth:success', handleAuthSuccess);
    const unsubOnlineUsers = websocketService.on('online-users:update', handleOnlineUsersUpdate);

    // Check if already connected
    if (websocketService.getConnectionState()) {
      websocketService.subscribe('online-users');
      websocketService.send('get-online-users');
    }

    return () => {
      unsubAuth();
      unsubOnlineUsers();
      websocketService.unsubscribe('online-users');
    };
  }, []);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrator';
      case 'warehouse': return 'Magazynier';
      case 'pos': return 'Sprzedawca';
      case 'customer': return 'Klient';
      default: return role;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'warehouse': return 'bg-blue-100 text-blue-800';
      case 'pos': return 'bg-green-100 text-green-800';
      case 'customer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatConnectedTime = (connectedAt: string) => {
    const connected = new Date(connectedAt);
    const now = new Date();
    const diffMs = now.getTime() - connected.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'przed chwilą';
    if (diffMins < 60) return `${diffMins} min temu`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} godz. temu`;
    return connected.toLocaleDateString('pl-PL');
  };

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-xl">👥</span>
            Aktywni użytkownicy
          </h3>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
              {isConnected ? 'Live' : 'Łączenie...'}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Employees Section */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <span>🏢</span>
            Pracownicy ({onlineData.employees.length})
          </h4>
          {onlineData.employees.length > 0 ? (
            <div className="space-y-2">
              {onlineData.employees.map((user) => (
                <div key={user.userId} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-700 font-medium text-sm">
                          {user.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.email}</p>
                      <p className="text-xs text-gray-500">{formatConnectedTime(user.connectedAt)}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Brak aktywnych pracowników</p>
          )}
        </div>

        {/* Customers Section */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <span>🛒</span>
            Klienci sklepu ({onlineData.customers.length})
          </h4>
          {onlineData.customers.length > 0 ? (
            <div className="space-y-2">
              {onlineData.customers.map((user) => (
                <div key={user.userId} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-gray-600 font-medium text-sm">
                          {user.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.email}</p>
                      <p className="text-xs text-gray-500">{formatConnectedTime(user.connectedAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Brak aktywnych klientów</p>
          )}
        </div>
      </div>

      {/* Total count footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <p className="text-xs text-gray-500 text-center">
          Łącznie online: {onlineData.employees.length + onlineData.customers.length} użytkowników
        </p>
      </div>
    </div>
  );
}
