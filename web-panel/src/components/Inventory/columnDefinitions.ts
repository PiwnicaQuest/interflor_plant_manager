// Column Definitions for Inventory Table
// Centralized configuration for all columns

export type ColumnGroup = 
  | 'system'    // checkbox, image
  | 'info'      // plantName, potSize, plantHeight
  | 'date'      // createdAt
  | 'inventory' // palletCount, unitsPerPallet, totalUnits, totalSold
  | 'purchase'  // purchasePrice
  | 'pricePlus' // pricePlus
  | 'basePrice' // basePrice
  | 'detal1'    // detal1
  | 'discounts' // discount10-25
  | 'status'    // inventoryStatus, visibleInShop
  | 'grower'    // grower, growerPassport
  | 'tags'      // tags
  | 'actions';  // actions

export interface ColumnDefinition {
  key: string;
  label: string;
  shortLabel?: string;    // For narrow columns
  group: ColumnGroup;
  defaultWidth: number;
  minWidth: number;
  editable: boolean;
  filterable: boolean;
  fixed?: boolean;        // Cannot be hidden (checkbox, actions)
  sortable?: boolean;
  description?: string;   // Tooltip
}

export const ALL_COLUMNS: ColumnDefinition[] = [
  // System columns
  {
    key: 'checkbox',
    label: '',
    group: 'system',
    defaultWidth: 32,
    minWidth: 28,
    editable: false,
    filterable: false,
    fixed: true,
  },
  {
    key: 'image',
    label: 'Zdjęcie',
    group: 'system',
    defaultWidth: 24,
    minWidth: 20,
    editable: false,
    filterable: false,
  },
  
  // Info columns
  {
    key: 'plantName',
    label: 'Nazwa',
    group: 'info',
    defaultWidth: 180,
    minWidth: 100,
    editable: true,
    filterable: true,
  },
  
  // Date columns

  {
    key: 'createdAt',
    label: 'Data dostawy',
    shortLabel: 'Data dost.',
    group: 'date',
    defaultWidth: 85,
    minWidth: 70,
    editable: true,
    filterable: false,
    description: 'Data importu/dodania produktu',
  },
  
  // Info columns continued
  {
    key: 'potSize',
    label: 'Średnica',
    group: 'info',
    defaultWidth: 65,
    minWidth: 50,
    editable: true,
    filterable: true,
  },
  {
    key: 'plantHeight',
    label: 'Wysokość',
    shortLabel: 'Wys.',
    group: 'info',
    defaultWidth: 55,
    minWidth: 45,
    editable: true,
    filterable: true,
  },
  
  // Inventory columns
  {
    key: 'palletCount',
    label: 'Palety',
    group: 'inventory',
    defaultWidth: 55,
    minWidth: 45,
    editable: true,
    filterable: true,
  },
  {
    key: 'unitsPerPallet',
    label: 'Szt./pal.',
    shortLabel: 'Szt./pal.',
    group: 'inventory',
    defaultWidth: 55,
    minWidth: 45,
    editable: true,
    filterable: true,
  },
  {
    key: 'totalUnits',
    label: 'Łącznie',
    shortLabel: 'Łącznie',
    group: 'inventory',
    defaultWidth: 55,
    minWidth: 45,
    editable: true,
    filterable: true,
    description: 'Edytowalne',
  },
  {
    key: 'totalSold',
    label: 'Sprzedane',
    shortLabel: 'Sprzedane',
    group: 'inventory',
    defaultWidth: 55,
    minWidth: 45,
    editable: false,
    filterable: true,
    description: 'Sprzedane sztuki',
  },
  
  // Purchase column
  {
    key: 'purchasePrice',
    label: 'Cena zakupu',
    shortLabel: 'Zakup',
    group: 'purchase',
    defaultWidth: 60,
    minWidth: 50,
    editable: true,
    filterable: true,
  },
  
  // Price+ column
  {
    key: 'pricePlus',
    label: 'Cena+',
    group: 'pricePlus',
    defaultWidth: 60,
    minWidth: 50,
    editable: true,
    filterable: true,
  },
  
  // Base price column
  {
    key: 'basePrice',
    label: 'Bazowa',
    shortLabel: 'Bazowa',
    group: 'basePrice',
    defaultWidth: 60,
    minWidth: 50,
    editable: true,
    filterable: true,
    description: 'Edytowalne',
  },

  // VAT rate column
  {
    key: 'vatRate',
    label: 'Stawka VAT',
    shortLabel: 'VAT',
    group: 'basePrice',
    defaultWidth: 32,
    minWidth: 35,
    editable: true,
    filterable: false,
    description: 'Stawka VAT (%)',
  },
  

  // Detal 1 price column (calculated from base price + price group markup)
  {
    key: 'detal1',
    label: 'Detal 1',
    shortLabel: 'Det.1',
    group: 'detal1',
    defaultWidth: 60,
    minWidth: 50,
    editable: false,
    filterable: false,
    description: 'Cena Detal 1 (cena podstawowa + narzut z grupy cenowej)',
  },

  // Status columns
  {
    key: 'status',
    label: 'Status',
    group: 'status',
    defaultWidth: 55,
    minWidth: 50,
    editable: false,
    filterable: true,
  },
  {
    key: 'visible',
    label: 'Widoczny w sklepie',
    shortLabel: 'Sklep',
    group: 'status',
    defaultWidth: 28,
    minWidth: 45,
    editable: false,
    filterable: true,
  },
  
  // Grower columns
  {
    key: 'grower',
    label: 'Ogrodnik',
    group: 'grower',
    defaultWidth: 110,
    minWidth: 80,
    editable: false,
    filterable: true,
  },
  {
    key: 'passport',
    label: 'Paszport',
    shortLabel: 'Paszport',
    group: 'grower',
    defaultWidth: 75,
    minWidth: 60,
    editable: false,
    filterable: true,
    description: 'Paszport ogrodnika',
  },
  
  // Tags column
  {
    key: 'tags',
    label: 'Tagi',
    group: 'tags',
    defaultWidth: 120,
    minWidth: 80,
    editable: true,
    filterable: false,
    description: 'Kategorie produktu',
  },
  
  // Actions column
  {
    key: 'actions',
    label: 'Akcje',
    group: 'actions',
    defaultWidth: 115,
    minWidth: 100,
    editable: false,
    filterable: false,
    fixed: true,
  },
];

// Default column order (keys)
export const DEFAULT_COLUMN_ORDER: string[] = ALL_COLUMNS.map(col => col.key);

// Default visible columns (all by default)
export const DEFAULT_VISIBLE_COLUMNS: string[] = ALL_COLUMNS.map(col => col.key);

// Get column by key
export function getColumnByKey(key: string): ColumnDefinition | undefined {
  return ALL_COLUMNS.find(col => col.key === key);
}

// Get default widths object
export function getDefaultWidths(): Record<string, number> {
  return ALL_COLUMNS.reduce((acc, col) => {
    acc[col.key] = col.defaultWidth;
    return acc;
  }, {} as Record<string, number>);
}

// Column group colors for header
export const COLUMN_GROUP_HEADER_COLORS: Record<ColumnGroup, string> = {
  system: 'bg-gray-100',
  info: 'bg-slate-200',
  date: 'bg-cyan-200',
  inventory: 'bg-amber-200',
  purchase: 'bg-blue-200',
  pricePlus: 'bg-green-300',
  basePrice: 'bg-emerald-200',
  detal1: 'bg-rose-200',
  discounts: 'bg-purple-200',
  status: 'bg-orange-200',
  grower: 'bg-teal-200',
  tags: 'bg-pink-200',
  actions: 'bg-gray-100',
};

// Column group colors for cells
export const COLUMN_GROUP_CELL_COLORS: Record<ColumnGroup, string> = {
  system: 'bg-white',
  info: 'bg-slate-50',
  date: 'bg-cyan-50',
  inventory: 'bg-amber-50',
  purchase: 'bg-blue-50',
  pricePlus: 'bg-green-100',
  basePrice: 'bg-emerald-50',
  detal1: 'bg-rose-50',
  discounts: 'bg-purple-50',
  status: 'bg-orange-50',
  grower: 'bg-teal-50',
  tags: 'bg-pink-50',
  actions: 'bg-white',
};
