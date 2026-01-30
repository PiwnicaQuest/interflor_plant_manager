import { useState, useEffect } from 'react';
import { websocketService } from '../services/websocketService';

interface UserSession {
  sessionId: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  source: string;
  createdAt: string;
}

interface OnlineUser {
  userId: number;
  email: string;
  role: string;
  connectedAt: string;
  sessions: UserSession[];
}

interface OnlineUsersData {
  employees: OnlineUser[];
  customers: OnlineUser[];
}

const deviceIcon = (device: string) => {
  switch (device) {
    case 'iPhone':
    case 'Telefon':
      return '📱';
    case 'iPad':
    case 'Tablet':
      return '📱';
    default:
      return '💻';
  }
};

const sourceLabel = (source: string) => {
  switch (source) {
    case 'shop': return 'Sklep';
    case 'panel': return 'Panel';
    default: return source;
  }
};

export function OnlineUsers() {
  const [onlineData, setOnlineData] = useState<OnlineUsersData>({ employees: [], customers: [] });
  const [isConnected, setIsConnected] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    websocketService.connect();

    const handleAuthSuccess = () => {
      setIsConnected(true);
      websocketService.subscribe('online-users');
    };

    const handleOnlineUsersUpdate = (data: OnlineUsersData) => {
      setOnlineData(data);
    };

    const unsubAuth = websocketService.on('auth:success', handleAuthSuccess);
    const unsubOnlineUsers = websocketService.on('online-users:update', handleOnlineUsersUpdate);

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

  const formatLoginTime = (connectedAt: string) => {
    const connected = new Date(connectedAt);
    return connected.toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (connectedAt: string) => {
    const connected = new Date(connectedAt);
    const now = new Date();
    const diffMs = now.getTime() - connected.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return '< 1 min';
    if (diffMins < 60) return `${diffMins} min`;

    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    if (hours < 24) {
      return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  const formatDeviceLabel = (session: UserSession) => {
    const parts: string[] = [];
    if (session.os) parts.push(session.os);
    if (session.browser) parts.push(session.browser);
    if (parts.length === 0) return session.device || 'Nieznane';
    return parts.join(' / ');
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
                <div key={user.userId} className="p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-700 font-medium text-sm">
                            {user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span title="Czas logowania">{formatLoginTime(user.connectedAt)}</span>
                          <span className="text-gray-300">•</span>
                          <span className="text-green-600 font-medium" title="Czas online">
                            {formatDuration(user.connectedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getRoleBadgeColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                  {/* Sessions / Devices */}
                  {user.sessions && user.sessions.length > 0 && (
                    <div className="mt-2 ml-11 space-y-1">
                      {user.sessions.map((session) => (
                        <div
                          key={session.sessionId}
                          className="flex items-center gap-2 text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-100"
                        >
                          <span title={session.device}>{deviceIcon(session.device)}</span>
                          <span className="font-medium text-gray-700">{formatDeviceLabel(session)}</span>
                          <span className="text-gray-300">•</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            session.source === 'panel'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-green-50 text-green-600'
                          }`}>
                            {sourceLabel(session.source)}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="text-gray-400" title={session.ipAddress}>{session.ipAddress}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                <div key={user.userId} className="p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-gray-600 font-medium text-sm">
                          {user.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span title="Czas logowania">{formatLoginTime(user.connectedAt)}</span>
                        <span className="text-gray-300">•</span>
                        <span className="text-green-600 font-medium" title="Czas online">
                          {formatDuration(user.connectedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Sessions / Devices */}
                  {user.sessions && user.sessions.length > 0 && (
                    <div className="mt-2 ml-11 space-y-1">
                      {user.sessions.map((session) => (
                        <div
                          key={session.sessionId}
                          className="flex items-center gap-2 text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-100"
                        >
                          <span title={session.device}>{deviceIcon(session.device)}</span>
                          <span className="font-medium text-gray-700">{formatDeviceLabel(session)}</span>
                          <span className="text-gray-300">•</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            session.source === 'panel'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-green-50 text-green-600'
                          }`}>
                            {sourceLabel(session.source)}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="text-gray-400" title={session.ipAddress}>{session.ipAddress}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
