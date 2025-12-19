import { useState, useEffect, useCallback } from 'react';
import { 
  ALL_COLUMNS, 
  DEFAULT_COLUMN_ORDER, 
  DEFAULT_VISIBLE_COLUMNS,
  getDefaultWidths,
  ColumnDefinition 
} from '../components/Inventory/columnDefinitions';

const STORAGE_KEY = 'inventory-column-preferences';
const VERSION = 1;

export interface ColumnPreferences {
  version: number;
  columnOrder: string[];
  visibleColumns: string[];
  columnWidths: Record<string, number>;
}

const getDefaultPreferences = (): ColumnPreferences => ({
  version: VERSION,
  columnOrder: [...DEFAULT_COLUMN_ORDER],
  visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
  columnWidths: getDefaultWidths(),
});

const loadPreferences = (): ColumnPreferences => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ColumnPreferences;
      // Migrate if needed
      if (parsed.version !== VERSION) {
        return getDefaultPreferences();
      }
      // Merge with defaults to handle new columns
      const defaults = getDefaultPreferences();
      return {
        ...defaults,
        ...parsed,
        // Ensure all columns exist in order
        columnOrder: [
          ...parsed.columnOrder.filter(key => 
            ALL_COLUMNS.some(col => col.key === key)
          ),
          ...defaults.columnOrder.filter(key => 
            !parsed.columnOrder.includes(key)
          ),
        ],
        // Merge widths
        columnWidths: {
          ...defaults.columnWidths,
          ...parsed.columnWidths,
        },
      };
    }
  } catch (e) {
    console.error('Error loading column preferences:', e);
  }
  return getDefaultPreferences();
};

const savePreferences = (prefs: ColumnPreferences): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Error saving column preferences:', e);
  }
};

export function useColumnPreferences() {
  const [preferences, setPreferences] = useState<ColumnPreferences>(loadPreferences);

  // Save to localStorage when preferences change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  // Toggle column visibility
  const toggleColumnVisibility = useCallback((columnKey: string) => {
    const column = ALL_COLUMNS.find(col => col.key === columnKey);
    // Cannot hide fixed columns (checkbox, actions)
    if (column?.fixed) return;

    setPreferences(prev => {
      const isVisible = prev.visibleColumns.includes(columnKey);
      return {
        ...prev,
        visibleColumns: isVisible
          ? prev.visibleColumns.filter(key => key !== columnKey)
          : [...prev.visibleColumns, columnKey],
      };
    });
  }, []);

  // Set column visibility directly
  const setColumnVisibility = useCallback((columnKey: string, visible: boolean) => {
    const column = ALL_COLUMNS.find(col => col.key === columnKey);
    if (column?.fixed) return;

    setPreferences(prev => ({
      ...prev,
      visibleColumns: visible
        ? prev.visibleColumns.includes(columnKey) 
          ? prev.visibleColumns 
          : [...prev.visibleColumns, columnKey]
        : prev.visibleColumns.filter(key => key !== columnKey),
    }));
  }, []);

  // Reorder columns
  const reorderColumns = useCallback((newOrder: string[]) => {
    setPreferences(prev => ({
      ...prev,
      columnOrder: newOrder,
    }));
  }, []);

  // Update column width
  const setColumnWidth = useCallback((columnKey: string, width: number) => {
    setPreferences(prev => ({
      ...prev,
      columnWidths: {
        ...prev.columnWidths,
        [columnKey]: width,
      },
    }));
  }, []);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultPreferences();
    setPreferences(defaults);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get ordered and visible column definitions
  const getVisibleColumns = useCallback((): ColumnDefinition[] => {
    return preferences.columnOrder
      .filter(key => preferences.visibleColumns.includes(key))
      .map(key => ALL_COLUMNS.find(col => col.key === key)!)
      .filter(Boolean);
  }, [preferences.columnOrder, preferences.visibleColumns]);

  // Get all columns in current order (for config modal)
  const getOrderedColumns = useCallback((): ColumnDefinition[] => {
    return preferences.columnOrder
      .map(key => ALL_COLUMNS.find(col => col.key === key)!)
      .filter(Boolean);
  }, [preferences.columnOrder]);

  // Check if a column is visible
  const isColumnVisible = useCallback((columnKey: string): boolean => {
    return preferences.visibleColumns.includes(columnKey);
  }, [preferences.visibleColumns]);

  // Get width for a column
  const getColumnWidth = useCallback((columnKey: string): number => {
    return preferences.columnWidths[columnKey] || 
           ALL_COLUMNS.find(col => col.key === columnKey)?.defaultWidth || 
           100;
  }, [preferences.columnWidths]);

  // Bulk update visible columns
  const setVisibleColumns = useCallback((columns: string[]) => {
    // Always include fixed columns
    const fixedColumns = ALL_COLUMNS
      .filter(col => col.fixed)
      .map(col => col.key);
    
    const newVisible = [...new Set([...fixedColumns, ...columns])];
    
    setPreferences(prev => ({
      ...prev,
      visibleColumns: newVisible,
    }));
  }, []);

  return {
    preferences,
    visibleColumns: preferences.visibleColumns,
    columnOrder: preferences.columnOrder,
    columnWidths: preferences.columnWidths,
    toggleColumnVisibility,
    setColumnVisibility,
    reorderColumns,
    setColumnWidth,
    setVisibleColumns,
    resetToDefaults,
    getVisibleColumns,
    getOrderedColumns,
    isColumnVisible,
    getColumnWidth,
  };
}

export type UseColumnPreferencesReturn = ReturnType<typeof useColumnPreferences>;
