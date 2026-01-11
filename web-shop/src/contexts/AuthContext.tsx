import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { AuthState } from '../types';
import { api } from '../services/api';
import { websocketService } from '../services/websocketService';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Roles that can access the shop
const ALLOWED_ROLES = ['customer', 'admin', 'warehouse', 'seller', 'pos'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    customer: null,
    token: localStorage.getItem('shop_token'),
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('shop_token');
      if (token) {
        try {
          const result = await api.getMe();
          const user = result.user as { role: string; id: number; email: string; firstName?: string; lastName?: string };
          if (!ALLOWED_ROLES.includes(user.role)) {
            throw new Error('Brak dostępu do sklepu');
          }
          setState({
            user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
            customer: result.customer || null,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
          // Connect to WebSocket after successful auth check
          websocketService.connect();
        } catch (_error) {
          localStorage.removeItem('shop_token');
          setState({
            user: null,
            customer: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkAuth();

    // Cleanup WebSocket on unmount
    return () => {
      websocketService.disconnect();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    const user = result.user as { role: string; id: number; email: string; firstName?: string; lastName?: string };

    if (!ALLOWED_ROLES.includes(user.role)) {
      throw new Error('Brak dostępu do sklepu');
    }

    localStorage.setItem('shop_token', result.token);

    // Get customer data (may be null for non-customer roles)
    const meResult = await api.getMe();

    setState({
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
      customer: meResult.customer || null,
      token: result.token,
      isAuthenticated: true,
      isLoading: false,
    });

    // Connect/reconnect WebSocket with new token
    websocketService.reconnect();
  };

  const logout = useCallback(() => {
    // Disconnect WebSocket
    websocketService.disconnect();

    // Clear user's cart from localStorage
    if (state.user?.id) {
      localStorage.removeItem(`shop_cart_user_${state.user.id}`);
    }
    // Also clear any legacy global cart
    localStorage.removeItem('shop_cart');
    localStorage.removeItem('shop_token');

    setState({
      user: null,
      customer: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, [state.user?.id]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
