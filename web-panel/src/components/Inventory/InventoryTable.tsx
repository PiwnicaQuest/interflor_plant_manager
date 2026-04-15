import { useTags, FALLBACK_TAGS } from "../../hooks/useTags";
import { useState, useRef, useCallback, useEffect } from 'react';
import { Product } from '../../types';
import { parsePrice } from '../../utils/priceUtils';
import { api } from '../../services/api';
import type { PriceGroup } from '../../types';
import { ImageModal } from './ImageModal';

// Available tags for product categorization
export const AVAILABLE_TAGS = [
  'Anthurium', 'Bonsai', 'Bromelia', 'Cebulowe', 'Ceramika', 'Cytrusy',
  'Doniczki', 'Dzień Matki', 'Iglaste', 'Kaktus', 'Kolekcjonerskie',
  'Kompozycje', 'Kwitnące', 'Nawozy', 'Ogrodowe', 'Orchidea', 'Owadożerne',
  'Palmy', 'Pnącza', 'Promocja', 'Rośliny Mini', 'Spathiphyllum', 'Sukulenty',
  'Świąteczne', 'Walentynki', 'Wielkanoc', 'Wiszące', 'Zielone', 'Zioła'
] as const;

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
const BASE_URL = API_URL.replace(/\/api$/, '');

const getFullImageUrl = (imageUrl: string | null | undefined) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  const cacheBuster = `?v=${Date.now()}`;
  return `${BASE_URL}${imageUrl}${cacheBuster}`;
};


// Get optimized image URL from new image API
const getOptimizedImageUrl = (barcode: string | null | undefined, size: "thumb" | "medium" | "full"): string | null => {
  if (!barcode) return null;
  return `${API_URL}/images/${encodeURIComponent(barcode)}/${size}?v=${Math.floor(Date.now() / 60000)}`;
};
// Column widths management
type ColumnWidths = { [key: string]: number };

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  checkbox: 40,
  image: 28,
  plantName: 140,
  createdAt: 70,
  potSize: 50,
  plantHeight: 40,
  palletCount: 40,
  unitsPerPallet: 45,
  totalUnits: 45,
  totalSold: 45,
  lastMovement: 110,
  purchasePrice: 50,
  pricePlus: 50,
  basePrice: 50,
  discount10: 42,
  discount12: 42,
  discount15: 42,
  discount20: 42,
  discount25: 42,
  auchan8: 42,
  detal1: 55,
  visible: 36,
  grower: 80,
  passport: 60,
  tags: 80,
  actions: 120,
};

const STORAGE_KEY = 'inventory-column-widths';

const loadColumnWidths = (): ColumnWidths => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
  } catch (e) {}
  return DEFAULT_COLUMN_WIDTHS;
};

const saveColumnWidths = (widths: ColumnWidths) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch (e) {}
};

// Editable columns in order (for keyboard navigation)
const EDITABLE_COLUMNS: (keyof Product)[] = [
  'createdAt',
  'plantName',
  'potSize',
  'plantHeightCm',
  'palletCount',
  'unitsPerPallet',
  'totalUnits',
  'purchasePricePln',
  'pricePlus',
  'basePriceGross',
  'priceDiscount10',
  'priceDiscount12',
  'priceDiscount15',
  'priceDiscount20',
  'priceDiscount25',
  'priceAuchan8',
];

// Column filter values interface
export interface ColumnFilters {
  colPlantName?: string;
  colPotSize?: string;
  colPlantHeight?: string;
  colPalletCount?: string;
  colUnitsPerPallet?: string;
  colTotalUnits?: string;
  colTotalSold?: string;
  colPurchasePrice?: string;
  colPricePlus?: string;
  colBasePrice?: string;
  colVisible?: string;
  colGrower?: string;
  colPassport?: string;
  colCreatedAtFrom?: string;
  colCreatedAtTo?: string;
  colLastMovementFrom?: string;
  colLastMovementTo?: string;
  colTags?: string;
}

interface InventoryTableProps {
  products: Product[];
  isAdmin?: boolean;
  selectedProducts: number[];
  onToggleVisibility: (productId: number) => void;
  onViewDetails: (product: Product) => void;
  onUpdateProduct: (productId: number, field: keyof Product, value: any) => Promise<void>;
  onShowBarcode: (product: Product) => void;
  onSelectProduct: (productId: number) => void;
  onSelectAll: () => void;
  onDeleteProduct?: (product: Product) => void;
  onDuplicateProduct?: (product: Product) => void;
  onArchiveProduct?: (product: Product) => void;
  onRestoreProduct?: (product: Product) => void;
  onReportLoss?: (product: Product) => void;
  onProductFocused?: (product: Product | null) => void;
  onImageUpdated?: (productId: number, imageUrl: string | null) => void;
  isArchiveView?: boolean;
  columnFilters?: ColumnFilters;
  onColumnFilterChange?: (key: keyof ColumnFilters, value: string) => void;
  // Sorting
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  onSort?: (field: string) => void;
  // Column visibility and order configuration
  visibleColumns?: string[];
  columnOrder?: string[];
}

interface EditingCell {
  productId: number;
  field: keyof Product;
}

// Cell that is selected but not yet editing
interface SelectedCell {
  productId: number;
  field: keyof Product;
}

export function InventoryTable({
  products,
  selectedProducts,
  onToggleVisibility,
  onViewDetails,
  onUpdateProduct,
  onShowBarcode,
  onSelectProduct,
  onSelectAll,
  onDeleteProduct,
  onDuplicateProduct,
  onArchiveProduct,
  onRestoreProduct,
  onReportLoss,
  onProductFocused,
  onImageUpdated,
  isArchiveView = false,
  columnFilters = {},
  onColumnFilterChange,
  sortBy,
  sortOrder,
  onSort,
  visibleColumns,
  columnOrder,
  isAdmin = false
}: InventoryTableProps) {
  // Fields restricted to admin only
  const adminOnlyFields: (keyof Product)[] = [
    'purchasePricePln', 'pricePlus', 'basePriceGross',
    'priceDiscount10', 'priceDiscount12', 'priceDiscount15', 'priceDiscount20', 'priceDiscount25',
    'priceAuchan8', 'vatRate',
    'palletCount', 'unitsPerPallet', 'totalUnits'
  ];

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [hoveredImage, setHoveredImage] = useState<{ url: string; name: string } | null>(null);
  const [showDateRangeModal, setShowDateRangeModal] = useState(false);
  const [dateFrom, setDateFrom] = useState(columnFilters.colCreatedAtFrom || '');
  const [dateTo, setDateTo] = useState(columnFilters.colCreatedAtTo || '');
  const [dateModalPos, setDateModalPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [showLastMovementDateModal, setShowLastMovementDateModal] = useState(false);
  const [lastMovementFrom, setLastMovementFrom] = useState(columnFilters.colLastMovementFrom || '');
  const [lastMovementTo, setLastMovementTo] = useState(columnFilters.colLastMovementTo || '');
  const [lastMovementModalPos, setLastMovementModalPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(loadColumnWidths);
  const [resizing, setResizing] = useState<string | null>(null);
  const [resizePreviewX, setResizePreviewX] = useState<number | null>(null);
  const [editingTags, setEditingTags] = useState<number | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<Record<number, string[]>>({});
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());
  const [imageModalProduct, setImageModalProduct] = useState<Product | null>(null);
  const [showTagFilterDropdown, setShowTagFilterDropdown] = useState(false);
  const tagFilterRef = useRef<HTMLDivElement>(null);
  // Use dynamic tags from API
  const { tags: dynamicTags } = useTags();
  const availableTags = dynamicTags.length > 0 ? dynamicTags : FALLBACK_TAGS;

  // Fetch tag suggestions for products with empty tags
  useEffect(() => {
    const fetchSuggestions = async () => {
      const emptyTagProducts = products.filter(
        p => (!p.tags || p.tags.length === 0) && !acceptedSuggestions.has(p.id) && !suggestedTags[p.id]
      );
      if (emptyTagProducts.length === 0) return;

      const newSuggestions: Record<number, string[]> = {};
      for (const product of emptyTagProducts) {
        try {
          const result = await api.suggestTags(product.plantName, product.potSize || undefined);
          if (result.suggestedTags && result.suggestedTags.length > 0) {
            newSuggestions[product.id] = result.suggestedTags;
          }
        } catch (err) {
          // ignore errors for individual products
        }
      }
      if (Object.keys(newSuggestions).length > 0) {
        setSuggestedTags(prev => ({ ...prev, ...newSuggestions }));
      }
    };
    fetchSuggestions();
  }, [products.length]);

  const handleAcceptSuggestions = async (product: Product, tagsToAccept: string[]) => {
    try {
      await api.updateProduct(product.id, { tags: tagsToAccept } as any);
      await onUpdateProduct(product.id, 'tags' as any, tagsToAccept);
      setAcceptedSuggestions(prev => new Set([...prev, product.id]));
      setSuggestedTags(prev => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch (error) {
      console.error('Error accepting suggested tags:', error);
    }
  };

  const handleRejectSuggestions = (productId: number) => {
    setAcceptedSuggestions(prev => new Set([...prev, productId]));
    setSuggestedTags(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };
  const rafRef = useRef<number | null>(null);

  // Close tag filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) {
        setShowTagFilterDropdown(false);
      }
    };
    if (showTagFilterDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTagFilterDropdown]);
  const pendingWidth = useRef<number>(0);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const tableRef = useRef<HTMLTableElement>(null);

  // Column visibility helper
  const isColumnVisible = useCallback((columnKey: string): boolean => {
    // If no visibleColumns provided, show all columns
    if (!visibleColumns || visibleColumns.length === 0) return true;
    // Always show checkbox and actions columns
    if (columnKey === 'checkbox' || columnKey === 'actions') return true;
    return visibleColumns.includes(columnKey);
  }, [visibleColumns]);

  // Get column style (for hiding columns)
  const getColumnStyle = useCallback((columnKey: string) => {
    if (!isColumnVisible(columnKey)) {
      return { display: 'none' as const };
    }
    // Width is controlled by explicit style - return empty for visible
    return {};
  }, [isColumnVisible]);

  // Save widths when they change
  useEffect(() => {
    saveColumnWidths(columnWidths);
  }, [columnWidths]);

  // Notify parent when product is focused/selected
  useEffect(() => {
    if (onProductFocused) {
      if (selectedCell) {
        const product = products.find(p => p.id === selectedCell.productId);
        onProductFocused(product || null);
      } else {
        onProductFocused(null);
      }
    }
  }, [selectedCell, products, onProductFocused]);

  // Column resize handlers - improved with requestAnimationFrame
  const handleMouseDown = useCallback((e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(columnKey);
    startX.current = e.clientX;
    startWidth.current = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey];
    pendingWidth.current = startWidth.current;
    setResizePreviewX(e.clientX);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [columnWidths]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizing) return;
    
    // Update preview line position
    setResizePreviewX(e.clientX);
    
    const diff = e.clientX - startX.current;
    const minWidth = DEFAULT_COLUMN_WIDTHS[resizing] ? Math.max(30, DEFAULT_COLUMN_WIDTHS[resizing] * 0.5) : 30;
    const newWidth = Math.max(minWidth, Math.min(500, startWidth.current + diff));
    pendingWidth.current = newWidth;
    
    // Use requestAnimationFrame for smooth updates
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      setColumnWidths(prev => ({ ...prev, [resizing]: pendingWidth.current }));
    });
  }, [resizing]);

  const handleMouseUp = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    // Apply final width
    if (resizing) {
      setColumnWidths(prev => ({ ...prev, [resizing]: pendingWidth.current }));
    }
    setResizing(null);
    setResizePreviewX(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [resizing]);

  useEffect(() => {
    if (resizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [resizing, handleMouseMove, handleMouseUp]);


  // Reset column widths
  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Get adjacent cell for navigation
  const getAdjacentCell = useCallback((
    currentProductId: number,
    currentField: keyof Product,
    direction: 'up' | 'down' | 'left' | 'right'
  ): { productId: number; field: keyof Product } | null => {
    const currentRowIndex = products.findIndex(p => p.id === currentProductId);
    const currentColIndex = EDITABLE_COLUMNS.indexOf(currentField);

    if (currentRowIndex === -1 || currentColIndex === -1) return null;

    let newRowIndex = currentRowIndex;
    let newColIndex = currentColIndex;

    switch (direction) {
      case 'up':
        newRowIndex = currentRowIndex - 1;
        break;
      case 'down':
        newRowIndex = currentRowIndex + 1;
        break;
      case 'left':
        newColIndex = currentColIndex - 1;
        break;
      case 'right':
        newColIndex = currentColIndex + 1;
        break;
    }

    // Check bounds
    if (newRowIndex < 0 || newRowIndex >= products.length) return null;
    if (newColIndex < 0 || newColIndex >= EDITABLE_COLUMNS.length) return null;

    return {
      productId: products[newRowIndex].id,
      field: EDITABLE_COLUMNS[newColIndex],
    };
  }, [products]);

  // Handle keyboard navigation when cell is selected (not editing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if we have a selected cell and are NOT editing
      if (!selectedCell || editingCell) return;

      const { key } = e;

      // Arrow keys for navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        e.preventDefault();
        const direction = key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
        const nextCell = getAdjacentCell(selectedCell.productId, selectedCell.field, direction);
        if (nextCell) {
          setSelectedCell(nextCell);
        }
      }
      // Enter to start editing
      else if (key === 'Enter') {
        e.preventDefault();
        const product = products.find(p => p.id === selectedCell.productId);
        if (product) {
          setEditingCell(selectedCell);
          const value = product[selectedCell.field];
          setEditValue(value !== null && value !== undefined ? String(value) : '');
        }
      }
      // Escape to deselect
      else if (key === 'Escape') {
        setSelectedCell(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, editingCell, products, getAdjacentCell]);

  // Default column order (moved before early return to respect React hooks rules)
  const DEFAULT_COLUMN_ORDER = [
    "checkbox", "createdAt", "visible", "image", "plantName", "tags",
    "palletCount", "unitsPerPallet", "totalUnits", "potSize", "plantHeight",
    "purchasePrice", "pricePlus", "basePrice", "detal1",
    "totalSold", "grower", "passport", "actions",
    "lastMovement", "discount10", "discount12", "discount15", "discount20", "discount25", "auchan8"
  ];

  // Get sorted column keys based on columnOrder prop
  const getSortedColumnKeys = useCallback(() => {
    if (!columnOrder || columnOrder.length === 0) {
      return DEFAULT_COLUMN_ORDER;
    }
    const orderedKeys = [...columnOrder];
    DEFAULT_COLUMN_ORDER.forEach(key => {
      if (!orderedKeys.includes(key)) {
        orderedKeys.push(key);
      }
    });
    return orderedKeys;
  }, [columnOrder]);

  const sortedColumnKeys = getSortedColumnKeys();

  // Calculate total table width from all visible column widths
  const calculateTableMinWidth = useCallback(() => {
    return sortedColumnKeys.reduce((total, columnKey) => {
      const width = columnKey === "image" ? 28 : (columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 60);
      return total + width;
    }, 0);
  }, [sortedColumnKeys, columnWidths]);

  // Render filter cell content based on column type
  const renderFilterCell = useCallback((columnKey: string) => {
    if (!onColumnFilterChange) return null;

    const inputClass = "w-full px-0 py-px text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500";
    const selectClass = "w-full px-0 py-px text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500";

    switch (columnKey) {
      case 'visible':
        return (
          <select
            value={columnFilters.colVisible || ''}
            onChange={(e) => onColumnFilterChange('colVisible', e.target.value)}
            className={selectClass}
          >
            <option value="">Wszystkie</option>
            <option value="true">Tak</option>
            <option value="false">Nie</option>
          </select>
        );
      case 'plantName':
        return (
          <input
            type="text"
            placeholder="Szukaj..."
            value={columnFilters.colPlantName || ''}
            onChange={(e) => onColumnFilterChange('colPlantName', e.target.value)}
            className={inputClass}
          />
        );
      case 'palletCount':
        return (
          <input
            type="text"
            placeholder="Palety"
            value={columnFilters.colPalletCount || ''}
            onChange={(e) => onColumnFilterChange('colPalletCount', e.target.value)}
            className={inputClass}
          />
        );
      case 'unitsPerPallet':
        return (
          <input
            type="text"
            placeholder="Szt/pal"
            value={columnFilters.colUnitsPerPallet || ''}
            onChange={(e) => onColumnFilterChange('colUnitsPerPallet', e.target.value)}
            className={inputClass}
          />
        );
      case 'totalUnits':
        return (
          <input
            type="text"
            placeholder="Suma"
            value={columnFilters.colTotalUnits || ''}
            onChange={(e) => onColumnFilterChange('colTotalUnits', e.target.value)}
            className={inputClass}
          />
        );
      case 'potSize':
        return (
          <input
            type="text"
            placeholder="Rozmiar"
            value={columnFilters.colPotSize || ''}
            onChange={(e) => onColumnFilterChange('colPotSize', e.target.value)}
            className={inputClass}
          />
        );
      case 'plantHeight':
        return (
          <input
            type="text"
            placeholder="Wys."
            value={columnFilters.colPlantHeight || ''}
            onChange={(e) => onColumnFilterChange('colPlantHeight', e.target.value)}
            className={inputClass}
          />
        );
      case 'purchasePrice':
        return (
          <input
            type="text"
            placeholder="Zakup"
            value={columnFilters.colPurchasePrice || ''}
            onChange={(e) => onColumnFilterChange('colPurchasePrice', e.target.value)}
            className={inputClass}
          />
        );
      case 'pricePlus':
        return (
          <input
            type="text"
            placeholder="Cena+(VAT)"
            value={columnFilters.colPricePlus || ''}
            onChange={(e) => onColumnFilterChange('colPricePlus', e.target.value)}
            className={inputClass}
          />
        );
      case 'basePrice':
        return (
          <input
            type="text"
            placeholder="Podst."
            value={columnFilters.colBasePrice || ''}
            onChange={(e) => onColumnFilterChange('colBasePrice', e.target.value)}
            className={inputClass}
          />
        );
      case 'totalSold':
        return (
          <input
            type="text"
            placeholder="Sprz."
            value={columnFilters.colTotalSold || ''}
            onChange={(e) => onColumnFilterChange('colTotalSold', e.target.value)}
            className={inputClass}
          />
        );
      case 'grower':
        return (
          <input
            type="text"
            placeholder="Ogrodnik"
            value={columnFilters.colGrower || ''}
            onChange={(e) => onColumnFilterChange('colGrower', e.target.value)}
            className={inputClass}
          />
        );
      case 'passport':
        return (
          <input
            type="text"
            placeholder="Paszport"
            value={columnFilters.colPassport || ''}
            onChange={(e) => onColumnFilterChange('colPassport', e.target.value)}
            className={inputClass}
          />
        );
      case 'lastMovement': {
        const hasLMFilter = columnFilters.colLastMovementFrom || columnFilters.colLastMovementTo;
        return (
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setLastMovementModalPos({ top: rect.bottom + 4, left: rect.left });
              setLastMovementFrom(columnFilters.colLastMovementFrom || '');
              setLastMovementTo(columnFilters.colLastMovementTo || '');
              setShowLastMovementDateModal(true);
            }}
            className={`w-full px-0 py-px text-xs border rounded text-left truncate ${hasLMFilter ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-gray-300 text-gray-400'}`}
          >
            {hasLMFilter
              ? `${columnFilters.colLastMovementFrom || '...'} - ${columnFilters.colLastMovementTo || '...'}`
              : 'Daty...'}
          </button>
        );
      }
      case 'createdAt': {
        const hasDateFilter = columnFilters.colCreatedAtFrom || columnFilters.colCreatedAtTo;
        return (
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setDateModalPos({ top: rect.bottom + 4, left: rect.left });
              setDateFrom(columnFilters.colCreatedAtFrom || '');
              setDateTo(columnFilters.colCreatedAtTo || '');
              setShowDateRangeModal(true);
            }}
            className={`w-full px-0 py-px text-xs border rounded text-left truncate ${hasDateFilter ? 'border-cyan-400 bg-cyan-50 text-cyan-700 font-medium' : 'border-gray-300 text-gray-400'}`}
          >
            {hasDateFilter
              ? `${columnFilters.colCreatedAtFrom || '...'} - ${columnFilters.colCreatedAtTo || '...'}`
              : 'Daty...'}
          </button>
        );
      }
      case 'tags': {
        const selectedTags = columnFilters.colTags ? columnFilters.colTags.split(',').filter(Boolean) : [];
        const hasFilter = selectedTags.length > 0;
        return (
          <div className="relative" ref={tagFilterRef}>
            <button
              onClick={() => setShowTagFilterDropdown(!showTagFilterDropdown)}
              className={`w-full px-0 py-px text-xs border rounded text-left truncate ${
                hasFilter
                  ? 'border-pink-400 bg-pink-50 text-pink-700 font-medium'
                  : 'border-gray-300 text-gray-400'
              }`}
            >
              {hasFilter ? `${selectedTags.length} tag${selectedTags.length > 1 ? 'ów' : ''}` : 'Tagi...'}
            </button>
            {showTagFilterDropdown && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-pink-300 rounded-lg shadow-lg p-2 w-56 max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {availableTags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          const newTags = isSelected
                            ? selectedTags.filter(t => t !== tag)
                            : [...selectedTags, tag];
                          onColumnFilterChange('colTags', newTags.join(','));
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          isSelected
                            ? 'bg-pink-500 text-white border-pink-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-pink-50'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {hasFilter && (
                  <button
                    onClick={() => {
                      onColumnFilterChange('colTags', '');
                      setShowTagFilterDropdown(false);
                    }}
                    className="mt-2 w-full text-xs text-gray-500 hover:text-gray-700"
                  >
                    Wyczyść filtry
                  </button>
                )}
              </div>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }, [columnFilters, onColumnFilterChange, showTagFilterDropdown, availableTags]);

  // Click on cell - first click selects, second click (or double click) edits
  // Helper to format date value for date input (YYYY-MM-DD format)
  const formatDateForInput = (value: any): string => {
    if (!value) return '';
    try {
      const date = new Date(value);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const handleCellClick = (product: Product, field: keyof Product) => {
    setFocusedRowId(product.id);
    // Admin-only fields check
    if (!isAdmin && adminOnlyFields.includes(field)) {
      setSelectedCell({ productId: product.id, field });
      return;
    }
    // Immediately enter edit mode on click
    setSelectedCell({ productId: product.id, field });
    setEditingCell({ productId: product.id, field });
    const value = product[field];
    // Format date for date input
    if (field === 'createdAt') {
      setEditValue(formatDateForInput(value));
    } else if (field === 'plantPassport') {
      const idValue = product.plantPassport || '';
      setEditValue(idValue);
    } else {
      setEditValue(value !== null && value !== undefined ? String(value) : '');
    }
  };

  // Double click to immediately edit
  const handleCellDoubleClick = (product: Product, field: keyof Product, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent row onDoubleClick from firing
    // Admin-only fields check
    if (!isAdmin && adminOnlyFields.includes(field)) {
      setSelectedCell({ productId: product.id, field });
      return;
    }
    setSelectedCell({ productId: product.id, field });
    setEditingCell({ productId: product.id, field });
    const value = product[field];
    // Format date for date input
    if (field === 'createdAt') {
      setEditValue(formatDateForInput(value));
    } else if (field === 'plantPassport') {
      const idValue = product.plantPassport || '';
      setEditValue(idValue);
    } else {
      setEditValue(value !== null && value !== undefined ? String(value) : '');
    }
  };

  const handleCellBlur = async () => {
    if (editingCell) {
      const product = products.find(p => p.id === editingCell.productId);
      const lockableFields = ['priceDiscount10', 'priceDiscount12', 'priceDiscount15', 'priceDiscount20', 'priceDiscount25', 'priceAuchan8'];
      const isLockableField = lockableFields.includes(editingCell.field as string);
      let originalValue: string;
      if (editingCell.field === 'plantPassport') {
        originalValue = product?.plantPassport || '';
      } else if (editingCell.field === 'pricePlusVat') {
        const vr = product?.vatRate ?? 8;
        const grossVal = product?.pricePlus ? Math.round(product.pricePlus * (1 + vr / 100) * 100) / 100 : 0;
        originalValue = String(grossVal);
      } else {
        originalValue = String(product?.[editingCell.field] ?? '');
      }
      if (product && originalValue !== editValue) {
        let finalValue: any = editValue;
        const numericFields = ['palletCount', 'unitsPerPallet', 'plantHeightCm', 'purchasePricePln',
          'pricePlus', 'basePriceGross', 'priceDiscount10', 'priceDiscount12', 'priceDiscount15', 'priceDiscount20',
          'priceDiscount25',
  'priceAuchan8', 'vatRate', 'totalUnits', 'pricePlusVat'];
        // Handle date field - convert YYYY-MM-DD to ISO date string
        if (editingCell.field === 'createdAt') {
          if (editValue) {
            finalValue = new Date(editValue).toISOString();
          } else {
            finalValue = null;
          }
        } else if (numericFields.includes(editingCell.field as string)) {
          finalValue = parsePrice(editValue);
        }
        // pricePlusVat -> convert to net pricePlus before saving
        if (editingCell.field === 'pricePlusVat') {
          const vatRate = product.vatRate ?? 8;
          const netValue = Math.round((finalValue / (1 + vatRate / 100)) * 100) / 100;
          await onUpdateProduct(editingCell.productId, 'pricePlus' as any, netValue);
        } else {
          await onUpdateProduct(editingCell.productId, editingCell.field, finalValue);
        }
      }
      setEditingCell(null);
      // Keep cell selected after editing
    }
  };

  const handleInputKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handleCellBlur();
      // Move down after Enter and activate editing
      if (selectedCell) {
        const nextCell = getAdjacentCell(selectedCell.productId, selectedCell.field, 'down');
        if (nextCell) {
          setSelectedCell(nextCell);
          setEditingCell(nextCell);
          const nextProduct = products.find(p => p.id === nextCell.productId);
          if (nextProduct) {
            const val = nextProduct[nextCell.field];
            setEditValue(val !== null && val !== undefined ? String(val) : '');
          }
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    } else if (e.key === ' ') {
      // Space on locked price field = unlock
      if (editingCell) {
        const lockableFields = ['priceDiscount10', 'priceDiscount12', 'priceDiscount15', 'priceDiscount20', 'priceDiscount25', 'priceAuchan8'];
        if (lockableFields.includes(editingCell.field as string)) {
          const product = products.find(p => p.id === editingCell.productId);
          if ((product as any)?.priceLocks?.[editingCell.field as string]) {
            e.preventDefault();
            setEditingCell(null);
            await handleUnlockPrice(editingCell.productId, editingCell.field as string);
            return;
          }
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      await handleCellBlur();
      // Move right/left after Tab and activate editing
      if (selectedCell) {
        const direction = e.shiftKey ? 'left' : 'right';
        const nextCell = getAdjacentCell(selectedCell.productId, selectedCell.field, direction);
        if (nextCell) {
          setSelectedCell(nextCell);
          setEditingCell(nextCell);
          const nextProduct = products.find(p => p.id === nextCell.productId);
          if (nextProduct) {
            const val = nextProduct[nextCell.field];
            setEditValue(val !== null && val !== undefined ? String(val) : '');
          }
        }
      }
    }
  };

  const isEditing = (productId: number, field: keyof Product) => {
    return editingCell?.productId === productId && editingCell?.field === field;
  };

  const isSelected = (productId: number, field: keyof Product) => {
    return selectedCell?.productId === productId && selectedCell?.field === field;
  };

  const renderEditableCell = (product: Product, field: keyof Product, displayValue: string | number, className: string = '') => {
    const cellSelected = isSelected(product.id, field);
    const cellEditing = isEditing(product.id, field);

    // Check if it's a date field
    const isDateField = field === 'createdAt';

    if (cellEditing) {
      if (isDateField) {
        // For date fields, render date input
        return (
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={handleInputKeyDown}
            className={`w-full px-0 py-0 border border-primary-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${className}`}
            autoFocus
          />
        );
      }
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={handleInputKeyDown}
          onFocus={(e) => e.target.select()}
          className={`w-full px-0 py-px border border-primary-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${className}`}
          autoFocus
        />
      );
    }
    return (
      <span
        onClick={() => handleCellClick(product, field)}
        onDoubleClick={(e) => handleCellDoubleClick(product, field, e)}
        className={`cursor-pointer px-0 py-px rounded inline-block w-full truncate transition-colors ${
          cellSelected
            ? 'bg-blue-200 ring-2 ring-blue-400'
            : 'hover:bg-white/50'
        }`}
        title={String(displayValue)}
      >
        {displayValue}
      </span>
    );
  };

  const [unlockMenu, setUnlockMenu] = useState<{productId: number; field: string; x: number; y: number} | null>(null);

  // Detal 1 price multiplier from price group settings
  const [detal1Multiplier, setDetal1Multiplier] = useState<number>(1.30);

  useEffect(() => {
    const loadDetal1Group = async () => {
      try {
        const result = await api.getPriceGroups();
        const detal1Group = result.priceGroups?.find((pg: PriceGroup) => pg.name.toUpperCase().includes('DETAL 1') || pg.name.toUpperCase() === 'DETAL1');
        if (detal1Group) {
          setDetal1Multiplier(1 - (Number(detal1Group.discountPercentage) / 100));
        }
      } catch (err) {
        console.error('Error loading detal1 price group:', err);
      }
    };
    loadDetal1Group();
  }, []);

  const handleUnlockPrice = async (productId: number, field: string) => {
    setUnlockMenu(null);
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const locks = { ...(product.priceLocks || {}) };
    delete locks[field];
    // Calculate auto price from basePriceGross
    const base = product.basePriceGross || 0;
    const multipliers: Record<string, number> = {
      priceDiscount10: 0.90, priceDiscount12: 0.88, priceDiscount15: 0.85,
      priceDiscount20: 0.80, priceDiscount25: 0.75, priceAuchan8: 1.00,
    };
    const autoPrice = Math.round(base * (multipliers[field] || 1) * 100) / 100;
    try {
      await onUpdateProduct(productId, field as any, autoPrice);
      // Also update locks
      await onUpdateProduct(productId, 'priceLocks' as any, locks);
    } catch (err) {
      console.error('Unlock price error:', err);
    }
  };

  const renderLockedPriceCell = (product: Product, field: keyof Product, displayValue: string | number) => {
    const isLocked = product.priceLocks?.[field as string];
    const cellSelected = isSelected(product.id, field);
    const cellEditing = isEditing(product.id, field);

    if (cellEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={handleInputKeyDown}
          onFocus={(e) => e.target.select()}
          className="w-full px-0 py-px border border-primary-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
          autoFocus
        />
      );
    }
    return (
      <span
        onClick={() => handleCellClick(product, field)}
        onDoubleClick={(e) => handleCellDoubleClick(product, field, e)}
        onContextMenu={(e) => {
          if (isLocked) {
            e.preventDefault();
            setUnlockMenu({ productId: product.id, field: field as string, x: e.clientX, y: e.clientY });
          }
        }}
        className={`cursor-pointer px-0 py-px rounded inline-block w-full truncate transition-colors ${
          isLocked
            ? 'bg-orange-400 text-white font-semibold'
            : cellSelected
            ? 'bg-blue-200 ring-2 ring-blue-400'
            : 'hover:bg-white/50'
        }`}
        title={isLocked ? `Cena zablokowana (PPM aby odblokować)` : String(displayValue)}
      >
        {displayValue}
      </span>
    );
  };

  const allSelected = products.length > 0 && selectedProducts.length === products.length;
  const someSelected = selectedProducts.length > 0 && selectedProducts.length < products.length;

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleToggleTag = async (product: Product, tag: string) => {
    const currentTags = product.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];

    try {
      await api.updateProduct(product.id, { tags: newTags } as any);
      await onUpdateProduct(product.id, 'tags' as any, newTags);
    } catch (error) {
      console.error('Error updating tags:', error);
    }
  };

  const colStyles = {
    checkbox: 'bg-white',
    image: 'bg-white',
    info: 'bg-slate-50',
    date: 'bg-cyan-50',
    inventory: 'bg-amber-50',
    purchase: 'bg-blue-50',
    pricePlus: 'bg-yellow-100',
    detal1: 'bg-rose-100',
    basePrice: 'bg-green-200',
    discounts: 'bg-purple-50',
    status: 'bg-orange-50',
    grower: 'bg-teal-50',
    tags: 'bg-pink-50',
    actions: 'bg-white',
  };

  const headerStyles = {
    checkbox: 'bg-gray-100',
    image: 'bg-gray-100',
    info: 'bg-slate-200',
    date: 'bg-cyan-200',
    inventory: 'bg-amber-200',
    purchase: 'bg-blue-200',
    pricePlus: 'bg-yellow-300',
    detal1: 'bg-rose-300',
    basePrice: 'bg-green-400',
    discounts: 'bg-purple-200',
    status: 'bg-orange-200',
    grower: 'bg-teal-200',
    tags: 'bg-pink-200',
    actions: 'bg-gray-100',
  };

  // Header configurations for dynamic rendering
  const headerConfigs: Record<string, { label: string; style: string; title?: string; borderClass?: string }> = {
    checkbox: { label: "", style: headerStyles.checkbox, borderClass: "border-b-2 border-gray-300" },
    image: { label: "📷", style: headerStyles.image, title: "Zdjęcie", borderClass: "border-b-2 border-gray-300" },
    plantName: { label: "Nazwa", style: headerStyles.info, title: "Nazwa rośliny", borderClass: "border-b-2 border-slate-400 border-l border-slate-300" },
    createdAt: { label: "Data dostawy", style: headerStyles.date, title: "Data dostawy", borderClass: "border-b-2 border-cyan-400 border-l border-cyan-300" },
    potSize: { label: "Średnica", style: headerStyles.info, title: "Średnica doniczki", borderClass: "border-b-2 border-slate-400 border-l border-slate-300" },
    plantHeight: { label: "Wysokość", style: headerStyles.info, title: "Wysokość rośliny", borderClass: "border-b-2 border-slate-400" },
    palletCount: { label: "Palety", style: headerStyles.inventory, title: "Liczba palet", borderClass: "border-b-2 border-amber-400 border-l border-amber-300" },
    unitsPerPallet: { label: "Szt./pal.", style: headerStyles.inventory, title: "Sztuk na palecie", borderClass: "border-b-2 border-amber-400" },
    totalUnits: { label: "Łącznie", style: headerStyles.inventory, title: "Suma sztuk (edytowalne)", borderClass: "border-b-2 border-amber-400" },
    totalSold: { label: "Sprzedane", style: headerStyles.inventory, title: "Sprzedane", borderClass: "border-b-2 border-amber-400" },
    purchasePrice: { label: "Cena zakupu", style: headerStyles.purchase, title: "Cena zakupu", borderClass: "border-b-2 border-blue-400 border-l border-blue-300" },
    pricePlus: { label: "Cena+(VAT)", style: headerStyles.pricePlus, title: "Cena+ z VAT (zakup + koszty + VAT)", borderClass: "border-b-2 border-yellow-500 border-l border-yellow-400 font-bold" },
    basePrice: { label: "Bazowa", style: headerStyles.basePrice, title: "Cena podstawowa (edytowalne)", borderClass: "border-b-2 border-green-500 border-l border-green-400 font-bold" },
    detal1: { label: "Detal 1", style: headerStyles.detal1, title: "Cena Detal 1 (narzut z grupy cenowej)", borderClass: "border-b-2 border-rose-400 border-l border-rose-300 font-bold" },
    discount10: { label: "10", style: headerStyles.discounts, title: "Rabat -10%", borderClass: "border-b-2 border-purple-400 border-l border-purple-300" },
    discount12: { label: "12", style: headerStyles.discounts, title: "Rabat -12%", borderClass: "border-b-2 border-purple-400" },
    discount15: { label: "15", style: headerStyles.discounts, title: "Rabat -15%", borderClass: "border-b-2 border-purple-400" },
    discount20: { label: "20", style: headerStyles.discounts, title: "Rabat -20%", borderClass: "border-b-2 border-purple-400" },
    discount25: { label: "25", style: headerStyles.discounts, title: "Rabat -25%", borderClass: "border-b-2 border-purple-400" },
    auchan8: { label: "A8", style: headerStyles.discounts, title: "Auchan (cena podstawowa)", borderClass: "border-b-2 border-purple-400" },
    lastMovement: { label: "Ost.ruch", style: headerStyles.inventory, title: "Ostatni ruch magazynowy", borderClass: "border-b-2 border-amber-400" },
    visible: { label: "Sklep", style: headerStyles.status, title: "Widoczność w sklepie", borderClass: "border-b-2 border-orange-400" },
    grower: { label: "Ogrodnik", style: headerStyles.grower, title: "Ogrodnik/Producent", borderClass: "border-b-2 border-teal-400 border-l border-teal-300" },
    passport: { label: "Paszport", style: headerStyles.grower, title: "Paszport ogrodnika", borderClass: "border-b-2 border-teal-400" },
    tags: { label: "Tagi", style: headerStyles.tags, title: "Tagi/Kategorie", borderClass: "border-b-2 border-pink-400 border-l border-pink-300" },
    actions: { label: "Akcje", style: headerStyles.actions, title: "Akcje", borderClass: "border-b-2 border-gray-300 border-l border-gray-200" },
  };

  // Render header content based on column key
  const renderHeaderContent = (columnKey: string) => {
    if (columnKey === "checkbox") {
      return (
        <div className="flex justify-center items-center w-full">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={onSelectAll}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
          />
        </div>
      );
    }
    return headerConfigs[columnKey]?.label || "";
  };

  // Sort field mapping: columnKey -> sortField used in InventoryPage
  const columnSortField: Record<string, string> = {
    plantName: 'plant_name',
    createdAt: 'created_at',
    potSize: 'pot_size',
    plantHeight: 'plant_height',
    palletCount: 'pallet_count',
    unitsPerPallet: 'units_per_pallet',
    totalUnits: 'total_units',
    totalSold: 'total_sold',
    purchasePrice: 'purchase_price',
    pricePlus: 'price_plus',
    basePrice: 'base_price_gross',
    detal1: 'base_price_gross',
    discount10: 'discount_10',
    discount12: 'discount_12',
    discount15: 'discount_15',
    discount20: 'discount_20',
    discount25: 'discount_25',
    auchan8: 'auchan_8',
    grower: 'grower',
    passport: 'passport',
    tags: 'tags',
    lastMovement: 'last_movement_at',
  };

  const handleHeaderClick = (columnKey: string) => {
    const field = columnSortField[columnKey];
    if (!field || !onSort) return;
    onSort(field);
  };

  const getSortIndicator = (columnKey: string) => {
    const field = columnSortField[columnKey];
    if (!field || sortBy !== field) return null;
    return sortOrder === 'ASC' ? ' ▲' : ' ▼';
  };

  // Cell configurations for dynamic rendering - styles and border classes
  const cellConfigs: Record<string, { styleKey: string; borderClass: string; extraClass?: string }> = {
    checkbox: { styleKey: "checkbox", borderClass: "border-b border-gray-200" },
    image: { styleKey: "image", borderClass: "border-b border-gray-200", extraClass: "!px-0 !py-px flex items-center justify-center" },
    plantName: { styleKey: "info", borderClass: "border-b border-slate-200 border-l border-slate-200", extraClass: "text-xs" },
    createdAt: { styleKey: "date", borderClass: "border-b border-cyan-200 border-l border-cyan-200", extraClass: "text-center text-xs text-gray-600" },
    potSize: { styleKey: "info", borderClass: "border-b border-slate-200 border-l border-slate-200", extraClass: "text-center text-xs" },
    plantHeight: { styleKey: "info", borderClass: "border-b border-slate-200", extraClass: "text-center text-xs" },
    palletCount: { styleKey: "inventory", borderClass: "border-b border-amber-200 border-l border-amber-200", extraClass: "text-center text-xs" },
    unitsPerPallet: { styleKey: "inventory", borderClass: "border-b border-amber-200", extraClass: "text-center text-xs" },
    totalUnits: { styleKey: "inventory", borderClass: "border-b border-amber-200", extraClass: "text-center font-bold text-amber-800 text-xs" },
    totalSold: { styleKey: "inventory", borderClass: "border-b border-amber-200", extraClass: "text-center font-semibold text-amber-700 text-xs" },
    purchasePrice: { styleKey: "purchase", borderClass: "border-b border-blue-200 border-l border-blue-200", extraClass: "text-center text-xs" },
    pricePlus: { styleKey: "pricePlus", borderClass: "border-b border-yellow-300 border-l border-yellow-300", extraClass: "text-center font-bold text-yellow-900 text-xs" },
    basePrice: { styleKey: "basePrice", borderClass: "border-b border-green-400 border-l border-green-400", extraClass: "text-center font-bold text-green-800 text-xs" },
    detal1: { styleKey: "detal1", borderClass: "border-b border-rose-300 border-l border-rose-300", extraClass: "text-center font-bold text-rose-800 text-xs" },
    discount10: { styleKey: "discounts", borderClass: "border-b border-purple-200 border-l border-purple-200", extraClass: "text-center text-xs" },
    discount12: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    discount15: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    discount20: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    discount25: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    auchan8: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs font-medium text-purple-700" },
    lastMovement: { styleKey: "inventory", borderClass: "border-b border-amber-200", extraClass: "text-center text-xs text-gray-600" },
    visible: { styleKey: "status", borderClass: "border-b border-orange-200", extraClass: "text-center" },
    grower: { styleKey: "grower", borderClass: "border-b border-teal-200 border-l border-teal-200", extraClass: "text-center text-xs text-gray-700 truncate" },
    passport: { styleKey: "grower", borderClass: "border-b border-teal-200", extraClass: "text-center text-xs text-teal-700 font-medium truncate" },
    tags: { styleKey: "tags", borderClass: "border-b border-pink-200 border-l border-pink-200", extraClass: "text-xs relative" },
    actions: { styleKey: "actions", borderClass: "border-b border-gray-200 border-l border-gray-200" },
  };

  // Get cell title for tooltips
  const getCellTitle = (columnKey: string, product: Product) => {
    switch (columnKey) {

      case "createdAt":
        return product.createdAt ? new Date(product.createdAt).toLocaleString("pl-PL") : "";
      case "lastMovement":
        return product.lastMovementAt ? new Date(product.lastMovementAt).toLocaleString("pl-PL") : "";
      case "grower":
        return product.grower || product.grower || "";
      case "passport":
        return product.growerPassport || product.plantPassport || "";
      default:
        return undefined;
    }
  };

  // Render cell content based on column key and product
  const renderCellContent = (columnKey: string, product: Product, isRowSelected: boolean, imageUrl: string | null) => {
    switch (columnKey) {
      case "checkbox":
        return (
          <div className="flex justify-center items-center w-full"><input type="checkbox" checked={isRowSelected} onChange={() => onSelectProduct(product.id)} className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" /></div>
        );
      case "image": {
        // Use optimized image URLs if barcode is available, otherwise fallback to original
        const thumbUrl = product.barcode ? getOptimizedImageUrl(product.barcode, "thumb") : imageUrl;
        return product.imageUrl ? (
          <div
            className="relative cursor-pointer inline-block w-6 h-6"
            onClick={(e) => { e.stopPropagation(); setImageModalProduct(product); setHoveredImage(null); }}
            onMouseEnter={() => {
              const mediumUrl = product.barcode ? getOptimizedImageUrl(product.barcode, "full") : imageUrl;
              mediumUrl && setHoveredImage({ url: mediumUrl, name: product.plantName });
            }}
            onMouseLeave={() => setHoveredImage(null)}
          >
            <img src={thumbUrl || ""} alt={product.plantName} className="w-6 h-6 object-cover rounded transition-transform hover:scale-110" />
          </div>
        ) : (
          <div
            className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-sm cursor-pointer hover:bg-gray-200 transition-colors"
            onClick={(e) => { e.stopPropagation(); setImageModalProduct(product); }}
          >🌿</div>
        );
      }
      case "plantName":
        return renderEditableCell(product, "plantName", product.plantName);
      case "createdAt":
        return renderEditableCell(product, "createdAt", formatDate(product.createdAt));
      case "potSize":
        return renderEditableCell(product, "potSize", product.potSize || "-");
      case "plantHeight":
        return renderEditableCell(product, "plantHeightCm", product.plantHeightCm || "-");
      case "palletCount":
        return renderEditableCell(product, "palletCount", product.palletCount, "text-center");
      case "unitsPerPallet":
        return renderEditableCell(product, "unitsPerPallet", product.unitsPerPallet, "text-center");
      case "totalUnits":
        return renderEditableCell(product, "totalUnits", product.totalUnits, "text-center font-bold");
      case "totalSold":
        return product.totalSold || 0;
      case "lastMovement": {
        if (!product.lastMovementAt) return '-';
        const d = new Date(product.lastMovementAt);
        return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      case "purchasePrice":
        return renderEditableCell(product, "purchasePricePln", product.purchasePricePln ? `${product.purchasePricePln.toFixed(2)} zł` : "-");
      case "pricePlus": {
        const vatRate = product.vatRate ?? 8;
        const pricePlusVat = product.pricePlus ? Math.round(product.pricePlus * (1 + vatRate / 100) * 100) / 100 : 0;
        return renderEditableCell(product, "pricePlusVat" as any, pricePlusVat ? `${pricePlusVat.toFixed(2)} zł` : "-", "font-bold");
      }
      case "basePrice":
        return renderEditableCell(product, "basePriceGross", product.basePriceGross ? `${product.basePriceGross.toFixed(2)} zł` : "-");
      case "detal1": {
        const detal1Price = product.basePriceGross ? Math.ceil(product.basePriceGross * detal1Multiplier) : 0;
        return detal1Price ? `${detal1Price} zł` : "-";
      }
      case "discount10":
        return renderLockedPriceCell(product, "priceDiscount10", product.priceDiscount10 ? `${product.priceDiscount10.toFixed(2)} zł` : "-");
      case "discount12":
        return renderLockedPriceCell(product, "priceDiscount12", product.priceDiscount12 ? `${product.priceDiscount12.toFixed(2)} zł` : "-");
      case "discount15":
        return renderLockedPriceCell(product, "priceDiscount15", product.priceDiscount15 ? `${product.priceDiscount15.toFixed(2)} zł` : "-");
      case "discount20":
        return renderLockedPriceCell(product, "priceDiscount20", product.priceDiscount20 ? `${product.priceDiscount20.toFixed(2)} zł` : "-");
      case "discount25":
        return renderLockedPriceCell(product, "priceDiscount25", product.priceDiscount25 ? `${product.priceDiscount25.toFixed(2)} zł` : "-");
      case "auchan8":
        // Auchan - edytowalna cena, domyslnie cena podstawowa
        const auchan8Value = product.priceAuchan8 
          ? `${parseFloat(String(product.priceAuchan8)).toFixed(2)} zł` 
          : (product.basePriceGross ? `${product.basePriceGross.toFixed(2)} zł` : "-");
        return renderLockedPriceCell(product, "priceAuchan8", auchan8Value);
      case "visible":
        return (
          <button onClick={() => onToggleVisibility(product.id)} className={`px-1.5 py-0.5 rounded text-xs font-medium ${product.visibleInShop ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
            {product.visibleInShop ? "Tak" : "Nie"}
          </button>
        );
      case "grower":
        return product.grower || product.grower || "-";
      case "passport":
        return renderEditableCell(product, "plantPassport" as keyof Product, product.growerPassport || product.plantPassport || "-", "text-center");
      case "tags": {
        const hasTags = product.tags && product.tags.length > 0;
        const suggestions = suggestedTags[product.id];
        const hasSuggestions = !hasTags && suggestions && suggestions.length > 0;

        return (
          <>
            {hasTags ? (
              <div className="flex flex-wrap gap-0.5 items-center">
                {(product.tags || []).slice(0, 2).map(tag => (
                  <span key={tag} className="bg-pink-200 text-pink-800 px-1 py-0.5 rounded text-[10px] truncate max-w-[50px]" title={tag}>
                    {tag}
                  </span>
                ))}
                {(product.tags || []).length > 2 && (
                  <span className="text-pink-600 text-[10px]">+{(product.tags || []).length - 2}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingTags(editingTags === product.id ? null : product.id); }}
                  className="ml-1 text-pink-600 hover:text-pink-800 text-xs hover:bg-pink-100 rounded px-1 flex-shrink-0"
                  title="Edytuj tagi"
                >
                  ✏️
                </button>
              </div>
            ) : hasSuggestions ? (
              <div className="flex flex-wrap gap-0.5 items-center">
                {suggestions.slice(0, 2).map(tag => (
                  <span key={tag} className="bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded text-[10px] truncate max-w-[50px] border border-dashed border-yellow-400" title={`Sugerowany: ${tag}`}>
                    {tag}
                  </span>
                ))}
                {suggestions.length > 2 && (
                  <span className="text-yellow-600 text-[10px]">+{suggestions.length - 2}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleAcceptSuggestions(product, suggestions); }}
                  className="ml-0.5 text-green-600 hover:text-green-800 text-sm hover:bg-green-50 rounded px-0.5 flex-shrink-0"
                  title="Zaakceptuj sugerowane tagi"
                >
                  ✅
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingTags(editingTags === product.id ? null : product.id); }}
                  className="text-pink-600 hover:text-pink-800 text-xs hover:bg-pink-100 rounded px-0.5 flex-shrink-0"
                  title="Edytuj tagi"
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRejectSuggestions(product.id); }}
                  className="text-gray-400 hover:text-gray-600 text-sm hover:bg-gray-50 rounded px-0.5 flex-shrink-0"
                  title="Odrzucć sugestie"
                >
                  ✖
                </button>
              </div>
            ) : (
              <div className="flex items-center">
                <span className="text-gray-400 text-[10px]">brak</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingTags(editingTags === product.id ? null : product.id); }}
                  className="ml-1 text-pink-600 hover:text-pink-800 text-xs hover:bg-pink-100 rounded px-1 flex-shrink-0"
                  title="Edytuj tagi"
                >
                  ✏️
                </button>
              </div>
            )}
            {editingTags === product.id && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-pink-300 rounded-lg shadow-lg p-2 w-64 max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {availableTags.map(tag => {
                    const isActive = (product.tags || []).includes(tag);
                    const isSuggested = suggestions && suggestions.includes(tag) && !isActive;
                    return (
                      <button
                        key={tag}
                        onClick={(e) => { e.stopPropagation(); handleToggleTag(product, tag); }}
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          isActive
                            ? "bg-pink-500 text-white border-pink-600"
                            : isSuggested
                              ? "bg-yellow-100 text-yellow-800 border-yellow-400 border-dashed hover:bg-yellow-200"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-pink-50"
                        }`}
                      >
                        {isSuggested ? "☆ " : ""}{tag}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingTags(null); }}
                  className="mt-2 w-full text-xs text-gray-500 hover:text-gray-700"
                >
                  Zamknij
                </button>
              </div>
            )}
          </>
        );
      }
      case "actions":
        return (
          <div className="flex gap-0.5 flex-nowrap">
            <button onClick={() => onShowBarcode(product)} className="text-[10px] px-1 py-0.5 w-10 text-center bg-gray-500 hover:bg-gray-600 text-white rounded whitespace-nowrap" title={product.barcode ? `Kod: ${product.barcode}` : "Generuj kod"}>
              {product.barcode ? "Kod" : "+Kod"}
            </button>
            {onDuplicateProduct && (
              <button onClick={() => onDuplicateProduct(product)} className="text-[10px] px-1 py-0.5 w-10 text-center bg-blue-500 hover:bg-blue-600 text-white rounded whitespace-nowrap">Kopiuj</button>
            )}
            {!product.isArchived && onReportLoss && (
              <button onClick={() => onReportLoss(product)} className="text-[10px] px-1 py-0.5 w-10 text-center bg-orange-500 hover:bg-orange-600 text-white rounded whitespace-nowrap">Strata</button>
            )}

            {product.isArchived && onRestoreProduct && (
              <button onClick={() => onRestoreProduct(product)} className="text-[10px] px-1 py-0.5 w-10 text-center bg-green-500 hover:bg-green-600 text-white rounded whitespace-nowrap">Przywroc</button>
            )}
            {onDeleteProduct && (
              <button onClick={() => onDeleteProduct(product)} className="text-[10px] px-1 py-0.5 w-10 text-center bg-red-500 hover:bg-red-600 text-white rounded whitespace-nowrap">Usun</button>
            )}
          </div>
        );
      default:
        return null;
    }
  };





  // Resizable header cell component
  const ResizableHeader = ({ columnKey, children, className, title, onClick }: { columnKey: string; children: React.ReactNode; className: string; title?: string; onClick?: () => void }) => {
    const isVisible = isColumnVisible(columnKey);
    if (!isVisible) return null;
    return (
      <th
        className={`${className} relative select-none bg-white`}
        style={{
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          ...(columnKey === "image" ? { padding: "1px" } : {})
        }}
        title={title}
      >
        <div className="truncate pr-1 text-center" onClick={onClick}>{children}</div>
        <div
          className="absolute right-[-6px] top-0 h-full w-4 cursor-col-resize group z-10"
          onMouseDown={(e) => handleMouseDown(e, columnKey)}
        >
          <div className="absolute right-[5px] top-0 w-[2px] h-full bg-transparent group-hover:bg-blue-400 group-active:bg-blue-600 transition-colors" />
        </div>
      </th>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Resize preview line */}
      {resizing && resizePreviewX !== null && (
        <div
          className="fixed top-0 bottom-0 w-0.5 bg-blue-500 z-50 pointer-events-none shadow-lg"
          style={{ left: resizePreviewX }}
        />
      )}

      {hoveredImage && (
        <div className="fixed z-50 pointer-events-none" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
          <div className="bg-white rounded-lg shadow-2xl p-2 border border-gray-200">
            <img src={hoveredImage.url} alt={hoveredImage.name} className="max-w-[512px] max-h-[512px] object-contain rounded" />
            <p className="text-center text-sm text-gray-600 mt-2 font-medium">{hoveredImage.name}</p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table ref={tableRef} className="table border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {sortedColumnKeys.filter(k => isColumnVisible(k)).map((columnKey) => {
                const width = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 60;
                return <col key={columnKey} style={{ width, minWidth: width, maxWidth: width }} />;
              })}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                {sortedColumnKeys.map((columnKey) => {
                  const config = headerConfigs[columnKey];
                  if (!config) return null;
                  return (
                    <ResizableHeader
                      key={columnKey}
                      columnKey={columnKey}
                      className={`${config.style} ${config.borderClass || ""} ${columnSortField[columnKey] && onSort ? 'cursor-pointer select-none' : ''}`}
                      title={config.title}
                      onClick={() => handleHeaderClick(columnKey)}
                    >
                      {renderHeaderContent(columnKey)}{getSortIndicator(columnKey)}
                    </ResizableHeader>
                  );
                })}

              </tr>
              {/* Filter row - sticky with headers - dynamically rendered based on sortedColumnKeys */}
              {onColumnFilterChange && (
                <tr className="bg-gray-100">
                  {sortedColumnKeys.map((columnKey) => {
                    const config = headerConfigs[columnKey];
                    // Extract border-l class from headerConfigs borderClass (for left borders)
                    const borderClass = config?.borderClass || "";
                    const leftBorderMatch = borderClass.match(/border-l\s+border-\w+-\d+/);
                    const leftBorder = leftBorderMatch ? leftBorderMatch[0] : "";
                    return (
                      <th
                        key={columnKey}
                        className={`p-px border-b border-gray-300 ${leftBorder} ${!isColumnVisible(columnKey) ? 'hidden' : ''}`}
                      style={{ overflow: columnKey === 'tags' ? 'visible' : 'hidden' }}
                      >
                        {renderFilterCell(columnKey)}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={sortedColumnKeys.length} className="text-center py-8 text-gray-500">
                    Brak produktów spełniających kryteria filtrowania
                  </td>
                </tr>
              ) : (
                products.map((product, rowIndex) => {
                  const isRowSelected = selectedProducts.includes(product.id);
                  const isRowFocused = focusedRowId === product.id;
                  const rowBg = isRowFocused ? 'bg-sky-100' : isRowSelected ? 'bg-primary-100' : (rowIndex % 2 === 0 ? '' : 'bg-gray-50/30');
                  const imageUrl = getFullImageUrl(product.imageUrl);

                  return (
                    <tr key={product.id} className={`${rowBg} cursor-pointer group transition-colors`} onClick={() => setFocusedRowId(focusedRowId === product.id ? null : product.id)} onDoubleClick={() => onViewDetails(product)} title="Kliknij dwukrotnie aby otworzyć szczegóły">
                      {sortedColumnKeys.map((columnKey) => {
                        const config = cellConfigs[columnKey];
                        if (!config) return null;
                        const colStyle = colStyles[config.styleKey as keyof typeof colStyles];
                        return (
                          <td
                            key={columnKey}
                            className={`${isRowSelected ? "" : colStyle} ${config.borderClass} ${config.extraClass || ""} group-hover:!bg-blue-200 ${!isColumnVisible(columnKey) ? 'hidden' : ''}`}
                            style={{
                              ...(columnKey !== 'tags' && columnKey !== 'actions' ? { 
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              } : {}),
                              ...(columnKey === "image" ? { padding: "1px" } : {})
                            }}
                            title={getCellTitle(columnKey, product)}
                          >
                            {renderCellContent(columnKey, product, isRowSelected, imageUrl)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-1.5 bg-gray-50 border-t text-xs text-gray-500 flex justify-between items-center">
          <span>Kliknij pole aby zaznaczyć, strzałki do nawigacji, Enter aby edytować</span>
          <button onClick={resetColumnWidths} className="text-blue-600 hover:text-blue-800 hover:underline">Resetuj szerokości</button>
        </div>
      </div>

      {/* Date range modal */}
      {showDateRangeModal && (
        <div className="fixed inset-0 z-50" onClick={() => setShowDateRangeModal(false)}>
          <div className="absolute bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72"
            style={{ top: dateModalPos.top, left: dateModalPos.left }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Zakres dat dodania</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Od</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Do</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  if (onColumnFilterChange) {
                    onColumnFilterChange('colCreatedAtFrom', dateFrom);
                    onColumnFilterChange('colCreatedAtTo', dateTo);
                  }
                  setShowDateRangeModal(false);
                }}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium py-2 rounded transition-colors"
              >
                Zastosuj
              </button>
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  if (onColumnFilterChange) {
                    onColumnFilterChange('colCreatedAtFrom', '');
                    onColumnFilterChange('colCreatedAtTo', '');
                  }
                  setShowDateRangeModal(false);
                }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded transition-colors"
              >
                Wyczysc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Last movement date range modal */}
      {showLastMovementDateModal && (
        <div className="fixed inset-0 z-50" onClick={() => setShowLastMovementDateModal(false)}>
          <div className="absolute bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72"
            style={{ top: lastMovementModalPos.top, left: lastMovementModalPos.left }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Zakres dat ostatniego ruchu</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Od</label>
                <input
                  type="date"
                  value={lastMovementFrom}
                  onChange={(e) => setLastMovementFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Do</label>
                <input
                  type="date"
                  value={lastMovementTo}
                  onChange={(e) => setLastMovementTo(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  if (onColumnFilterChange) {
                    onColumnFilterChange('colLastMovementFrom', lastMovementFrom);
                    onColumnFilterChange('colLastMovementTo', lastMovementTo);
                  }
                  setShowLastMovementDateModal(false);
                }}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-2 rounded transition-colors"
              >
                Zastosuj
              </button>
              <button
                onClick={() => {
                  setLastMovementFrom('');
                  setLastMovementTo('');
                  if (onColumnFilterChange) {
                    onColumnFilterChange('colLastMovementFrom', '');
                    onColumnFilterChange('colLastMovementTo', '');
                  }
                  setShowLastMovementDateModal(false);
                }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded transition-colors"
              >
                Wyczysc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image modal */}
      {imageModalProduct && (
        <ImageModal
          product={imageModalProduct}
          onClose={() => setImageModalProduct(null)}
          onImageUpdated={(productId, newImageUrl) => {
            if (onImageUpdated) onImageUpdated(productId, newImageUrl);
            setImageModalProduct(null);
          }}
        />
      )}

      {/* Unlock price context menu */}
      {unlockMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setUnlockMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]"
            style={{ left: unlockMenu.x, top: unlockMenu.y }}
          >
            <button
              onClick={() => handleUnlockPrice(unlockMenu.productId, unlockMenu.field)}
              className="w-full text-left px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              Odblokuj cenę (przywróć auto)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
