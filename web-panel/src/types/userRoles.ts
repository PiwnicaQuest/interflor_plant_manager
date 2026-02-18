// PlantManager - User Roles and Permissions System Foundation
// This file defines the user roles and their permissions

import { UserRole } from './index';

// Permission definitions
export enum Permission {
  // Inventory
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_CREATE = 'inventory:create',
  INVENTORY_EDIT = 'inventory:edit',
  INVENTORY_DELETE = 'inventory:delete',
  INVENTORY_ARCHIVE = 'inventory:archive',
  INVENTORY_MERGE = 'inventory:merge',

  // Orders
  ORDERS_VIEW = 'orders:view',
  ORDERS_CREATE = 'orders:create',
  ORDERS_EDIT = 'orders:edit',
  ORDERS_DELETE = 'orders:delete',
  ORDERS_CANCEL = 'orders:cancel',
  ORDERS_REOPEN = 'orders:reopen',
  ORDERS_STATUS_CHANGE = 'orders:status_change',
  ORDERS_TRANSFER = 'orders:transfer',

  // Customers
  CUSTOMERS_VIEW = 'customers:view',
  CUSTOMERS_CREATE = 'customers:create',
  CUSTOMERS_EDIT = 'customers:edit',
  CUSTOMERS_DELETE = 'customers:delete',

  // Invoices
  INVOICES_VIEW = 'invoices:view',
  INVOICES_CREATE = 'invoices:create',
  INVOICES_EDIT = 'invoices:edit',
  INVOICES_DELETE = 'invoices:delete',
  INVOICES_PAYMENT = 'invoices:payment',

  // Receipts
  RECEIPTS_VIEW = 'receipts:view',
  RECEIPTS_CREATE = 'receipts:create',

  // Reports
  REPORTS_VIEW = 'reports:view',
  REPORTS_EXPORT = 'reports:export',

  // Users
  USERS_VIEW = 'users:view',
  USERS_CREATE = 'users:create',
  USERS_EDIT = 'users:edit',
  USERS_DELETE = 'users:delete',

  // Settings
  SETTINGS_VIEW = 'settings:view',
  SETTINGS_EDIT = 'settings:edit',

  // POS
  POS_ACCESS = 'pos:access',
  POS_CHECKOUT = 'pos:checkout',

  // Scanner
  SCANNER_ACCESS = 'scanner:access',
  SCANNER_SCAN = 'scanner:scan',
  SCANNER_CREATE_ORDER = 'scanner:create_order',

  // Shop
  SHOP_VIEW = 'shop:view',
  SHOP_ORDER = 'shop:order',
}

// Role permissions mapping
export const rolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // Admin has all permissions
    ...Object.values(Permission),
  ],

  [UserRole.WAREHOUSE]: [
    // Warehouse staff permissions
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_CREATE,
    Permission.INVENTORY_EDIT,
    Permission.INVENTORY_ARCHIVE,
    Permission.INVENTORY_MERGE,
    Permission.ORDERS_VIEW,
    Permission.ORDERS_CREATE,
    Permission.ORDERS_EDIT,
    Permission.ORDERS_STATUS_CHANGE,
    Permission.ORDERS_TRANSFER,
    Permission.CUSTOMERS_VIEW,
    Permission.SCANNER_ACCESS,
    Permission.SCANNER_SCAN,
    Permission.SCANNER_CREATE_ORDER,
    Permission.REPORTS_VIEW,
  ],

  [UserRole.POS]: [
    // POS staff permissions
    Permission.INVENTORY_VIEW,
    Permission.ORDERS_VIEW,
    Permission.ORDERS_CREATE,
    Permission.ORDERS_STATUS_CHANGE,
    Permission.CUSTOMERS_VIEW,
    Permission.CUSTOMERS_CREATE,
    Permission.INVOICES_VIEW,
    Permission.INVOICES_CREATE,
    Permission.INVOICES_PAYMENT,
    Permission.RECEIPTS_VIEW,
    Permission.RECEIPTS_CREATE,
    Permission.POS_ACCESS,
    Permission.POS_CHECKOUT,
    Permission.SCANNER_ACCESS,
    Permission.SCANNER_SCAN,
    Permission.SCANNER_CREATE_ORDER,
  ],

  [UserRole.CUSTOMER]: [
    // Customer permissions - shop only
    Permission.SHOP_VIEW,
    Permission.SHOP_ORDER,
    Permission.ORDERS_VIEW, // Own orders only
  ],
};

// Helper functions
export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  const permissions = rolePermissions[userRole] || [];
  return permissions.includes(permission);
}

export function hasAnyPermission(userRole: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(userRole, permission));
}

export function hasAllPermissions(userRole: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(userRole, permission));
}

// Role labels for UI
export const roleLabels: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.WAREHOUSE]: 'Magazynier',
  [UserRole.POS]: 'Sprzedawca',
  [UserRole.CUSTOMER]: 'Klient',
};

// Role descriptions for UI
export const roleDescriptions: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Pełny dostęp do wszystkich funkcji systemu',
  [UserRole.WAREHOUSE]: 'Zarządzanie magazynem, zamówieniami i skanerem',
  [UserRole.POS]: 'Obsługa punktu sprzedaży i wystawianie dokumentów',
  [UserRole.CUSTOMER]: 'Dostęp do sklepu internetowego i własnych zamówień',
};

// Role colors for UI badges
export const roleColors: Record<UserRole, { bg: string; text: string }> = {
  [UserRole.ADMIN]: { bg: 'bg-purple-100', text: 'text-purple-700' },
  [UserRole.WAREHOUSE]: { bg: 'bg-blue-100', text: 'text-blue-700' },
  [UserRole.POS]: { bg: 'bg-green-100', text: 'text-primary-700' },
  [UserRole.CUSTOMER]: { bg: 'bg-gray-100', text: 'text-gray-700' },
};
