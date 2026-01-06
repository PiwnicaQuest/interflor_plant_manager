import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthState } from '../types';
import { api } from '../services/api';

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
          const user = result.user as { role: string; id: number; email: string };
          if (!ALLOWED_ROLES.includes(user.role)) {
            throw new Error('Brak dostępu do sklepu');
          }
          setState({
            user: { id: user.id, email: user.email, role: user.role },
            customer: result.customer || null,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
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
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    const user = result.user as { role: string; id: number; email: string };
    
    if (!ALLOWED_ROLES.includes(user.role)) {
      throw new Error('Brak dostępu do sklepu');
    }

    localStorage.setItem('shop_token', result.token);
    
    // Get customer data (may be null for non-customer roles)
    const meResult = await api.getMe();
    
    setState({
      user: { id: user.id, email: user.email, role: user.role },
      customer: meResult.customer || null,
      token: result.token,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const logout = () => {
    localStorage.removeItem('shop_token');
    setState({
      user: null,
      customer: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

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
