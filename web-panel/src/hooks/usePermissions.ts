import { useState, useEffect, useCallback } from 'react';

interface PermissionState {
  permissions: string[];
  role: string | null;
  isLoading: boolean;
}

/**
 * Hook do zarządzania uprawnieniami użytkownika
 * Wyciąga uprawnienia z tokena JWT lub z localStorage
 */
export function usePermissions() {
  const [state, setState] = useState<PermissionState>({
    permissions: [],
    role: null,
    isLoading: true,
  });

  useEffect(() => {
    const loadPermissions = () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setState({ permissions: [], role: null, isLoading: false });
          return;
        }

        // Decode JWT payload
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        // Get permissions from token or localStorage (fallback)
        let permissions: string[] = payload.permissions || [];
        
        // If no permissions in token, try localStorage (set during login)
        if (permissions.length === 0) {
          const storedPermissions = localStorage.getItem('userPermissions');
          if (storedPermissions) {
            permissions = JSON.parse(storedPermissions);
          }
        }

        // Admin has all permissions
        if (payload.role === 'admin') {
          permissions = getAllPermissions();
        }

        setState({
          permissions,
          role: payload.role,
          isLoading: false,
        });
      } catch (error) {
        console.error('[usePermissions] Error loading permissions:', error);
        setState({ permissions: [], role: null, isLoading: false });
      }
    };

    loadPermissions();

    // Listen for storage changes (e.g., login/logout in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'userPermissions') {
        loadPermissions();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  /**
   * Sprawdza czy użytkownik ma określone uprawnienie
   */
  const hasPermission = useCallback((permission: string): boolean => {
    // Admin has all permissions
    if (state.role === 'admin') return true;
    return state.permissions.includes(permission);
  }, [state.permissions, state.role]);

  /**
   * Sprawdza czy użytkownik ma którekolwiek z uprawnień (OR)
   */
  const hasAnyPermission = useCallback((permissions: string[]): boolean => {
    if (state.role === 'admin') return true;
    return permissions.some(p => state.permissions.includes(p));
  }, [state.permissions, state.role]);

  /**
   * Sprawdza czy użytkownik ma wszystkie uprawnienia (AND)
   */
  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    if (state.role === 'admin') return true;
    return permissions.every(p => state.permissions.includes(p));
  }, [state.permissions, state.role]);

  /**
   * Sprawdza czy użytkownik jest adminem
   */
  const isAdmin = state.role === 'admin';

  return {
    permissions: state.permissions,
    role: state.role,
    isLoading: state.isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
  };
}

/**
 * Lista wszystkich dostępnych uprawnień w systemie
 */
function getAllPermissions(): string[] {
  return [
    // Inventory
    'inventory:view', 'inventory:create', 'inventory:edit', 
    'inventory:delete', 'inventory:archive', 'inventory:merge',
    // Orders
    'orders:view', 'orders:create', 'orders:edit', 'orders:delete',
    'orders:cancel', 'orders:reopen', 'orders:status_change', 'orders:transfer',
    // Customers
    'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
    // Invoices
    'invoices:view', 'invoices:create', 'invoices:edit', 
    'invoices:delete', 'invoices:payment',
    // Receipts
    'receipts:view', 'receipts:create',
    // Reports
    'reports:view', 'reports:export',
    // Users
    'users:view', 'users:create', 'users:edit', 'users:delete',
    // Settings
    'settings:view', 'settings:edit',
    // Profiles
    'profiles:view', 'profiles:create', 'profiles:edit', 'profiles:delete',
    // POS
    'pos:access', 'pos:checkout',
    // Scanner
    'scanner:access', 'scanner:scan', 'scanner:create_order',
    // Shop
    'shop:view', 'shop:order',
  ];
}

export default usePermissions;
