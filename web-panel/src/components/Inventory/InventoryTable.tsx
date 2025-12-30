import { useState, useRef, useCallback, useEffect } from 'react';
import { Product } from '../../types';
import { parsePrice } from '../../utils/priceUtils';
import { api } from '../../services/api';

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

// Column widths management
type ColumnWidths = { [key: string]: number };

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  checkbox: 32,
  image: 36,
  plantName: 140,
  createdAt: 70,
  potSize: 50,
  plantHeight: 40,
  palletCount: 40,
  unitsPerPallet: 45,
  totalUnits: 45,
  totalSold: 45,
  purchasePrice: 50,
  pricePlus: 50,
  basePrice: 50,
  discount10: 42,
  discount12: 42,
  discount15: 42,
  discount20: 42,
  discount25: 42,
  auchan8: 42,
  visible: 36,
  grower: 80,
  passport: 60,
  tags: 80,
  actions: 70,
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
}

interface InventoryTableProps {
  products: Product[];
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
  isArchiveView?: boolean;
  columnFilters?: ColumnFilters;
  onColumnFilterChange?: (key: keyof ColumnFilters, value: string) => void;
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
  isArchiveView = false,
  columnFilters = {},
  onColumnFilterChange,
  visibleColumns,
  columnOrder
}: InventoryTableProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [hoveredImage, setHoveredImage] = useState<{ url: string; name: string } | null>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(loadColumnWidths);
  const [resizing, setResizing] = useState<string | null>(null);
  const [resizePreviewX, setResizePreviewX] = useState<number | null>(null);
  const [editingTags, setEditingTags] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
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
  const getColumnStyle = useCallback((columnKey: string, baseWidth?: number) => {
    const width = baseWidth ?? columnWidths[columnKey] ?? DEFAULT_COLUMN_WIDTHS[columnKey];
    if (!isColumnVisible(columnKey)) {
      return { display: 'none' as const };
    }
    return { width };
  }, [columnWidths, isColumnVisible]);

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
    "purchasePrice", "pricePlus", "basePrice",
    "discount10", "discount12", "discount15", "discount20", "discount25", "auchan8",
    "totalSold", "grower", "passport", "actions"
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
    // Immediately enter edit mode on click
    setSelectedCell({ productId: product.id, field });
    setEditingCell({ productId: product.id, field });
    const value = product[field];
    // Format date for date input
    if (field === 'createdAt') {
      setEditValue(formatDateForInput(value));
    } else {
      setEditValue(value !== null && value !== undefined ? String(value) : '');
    }
  };

  // Double click to immediately edit
  const handleCellDoubleClick = (product: Product, field: keyof Product, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent row onDoubleClick from firing
    setSelectedCell({ productId: product.id, field });
    setEditingCell({ productId: product.id, field });
    const value = product[field];
    // Format date for date input
    if (field === 'createdAt') {
      setEditValue(formatDateForInput(value));
    } else {
      setEditValue(value !== null && value !== undefined ? String(value) : '');
    }
  };

  const handleCellBlur = async () => {
    if (editingCell) {
      const product = products.find(p => p.id === editingCell.productId);
      if (product && String(product[editingCell.field]) !== editValue) {
        let finalValue: any = editValue;
        const numericFields = ['palletCount', 'unitsPerPallet', 'plantHeightCm', 'purchasePricePln',
          'pricePlus', 'basePriceGross', 'priceDiscount10', 'priceDiscount12', 'priceDiscount15', 'priceDiscount20',
          'priceDiscount25',
  'priceAuchan8', 'vatRate', 'totalUnits'];
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
        await onUpdateProduct(editingCell.productId, editingCell.field, finalValue);
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
            className={`w-full px-0.5 py-0 border border-primary-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${className}`}
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
          className={`w-full px-1 py-0.5 border border-primary-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${className}`}
          autoFocus
        />
      );
    }
    return (
      <span
        onClick={() => handleCellClick(product, field)}
        onDoubleClick={(e) => handleCellDoubleClick(product, field, e)}
        className={`cursor-pointer px-1 py-0.5 rounded inline-block w-full truncate transition-colors ${
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
    pricePlus: 'bg-green-100',
    basePrice: 'bg-emerald-50',
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
    pricePlus: 'bg-green-300',
    basePrice: 'bg-emerald-200',
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
    createdAt: { label: "📅", style: headerStyles.date, title: "Data dodania", borderClass: "border-b-2 border-cyan-400 border-l border-cyan-300" },
    potSize: { label: "⌀", style: headerStyles.info, title: "Rozmiar doniczki", borderClass: "border-b-2 border-slate-400 border-l border-slate-300" },
    plantHeight: { label: "↕", style: headerStyles.info, title: "Wysokość rośliny", borderClass: "border-b-2 border-slate-400" },
    palletCount: { label: "🎨", style: headerStyles.inventory, title: "Liczba palet", borderClass: "border-b-2 border-amber-400 border-l border-amber-300" },
    unitsPerPallet: { label: "szt/p", style: headerStyles.inventory, title: "Sztuk na palecie", borderClass: "border-b-2 border-amber-400" },
    totalUnits: { label: "Σ", style: headerStyles.inventory, title: "Suma sztuk (edytowalne)", borderClass: "border-b-2 border-amber-400" },
    totalSold: { label: "📦", style: headerStyles.inventory, title: "Sprzedane", borderClass: "border-b-2 border-amber-400" },
    purchasePrice: { label: "Zak", style: headerStyles.purchase, title: "Cena zakupu", borderClass: "border-b-2 border-blue-400 border-l border-blue-300" },
    pricePlus: { label: "C+", style: headerStyles.pricePlus, title: "Cena+ (zakup + marża)", borderClass: "border-b-2 border-green-500 border-l border-green-400 font-bold" },
    basePrice: { label: "Baz", style: headerStyles.basePrice, title: "Cena podstawowa (edytowalne)", borderClass: "border-b-2 border-emerald-400 border-l border-emerald-300" },
    discount10: { label: "10", style: headerStyles.discounts, title: "Rabat -10%", borderClass: "border-b-2 border-purple-400 border-l border-purple-300" },
    discount12: { label: "12", style: headerStyles.discounts, title: "Rabat -12%", borderClass: "border-b-2 border-purple-400" },
    discount15: { label: "15", style: headerStyles.discounts, title: "Rabat -15%", borderClass: "border-b-2 border-purple-400" },
    discount20: { label: "20", style: headerStyles.discounts, title: "Rabat -20%", borderClass: "border-b-2 border-purple-400" },
    discount25: { label: "25", style: headerStyles.discounts, title: "Rabat -25%", borderClass: "border-b-2 border-purple-400" },
    auchan8: { label: "A8", style: headerStyles.discounts, title: "Auchan (cena podstawowa)", borderClass: "border-b-2 border-purple-400" },
    visible: { label: "👁", style: headerStyles.status, title: "Widoczność w sklepie", borderClass: "border-b-2 border-orange-400" },
    grower: { label: "🌱", style: headerStyles.grower, title: "Ogrodnik/Producent", borderClass: "border-b-2 border-teal-400 border-l border-teal-300" },
    passport: { label: "ID", style: headerStyles.grower, title: "Paszport ogrodnika", borderClass: "border-b-2 border-teal-400" },
    tags: { label: "🏷", style: headerStyles.tags, title: "Tagi/Kategorie", borderClass: "border-b-2 border-pink-400 border-l border-pink-300" },
    actions: { label: "⚙", style: headerStyles.actions, title: "Akcje", borderClass: "border-b-2 border-gray-300 border-l border-gray-200" },
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

  // Cell configurations for dynamic rendering - styles and border classes
  const cellConfigs: Record<string, { styleKey: string; borderClass: string; extraClass?: string }> = {
    checkbox: { styleKey: "checkbox", borderClass: "border-b border-gray-200" },
    image: { styleKey: "image", borderClass: "border-b border-gray-200" },
    plantName: { styleKey: "info", borderClass: "border-b border-slate-200 border-l border-slate-200", extraClass: "text-xs" },
    createdAt: { styleKey: "date", borderClass: "border-b border-cyan-200 border-l border-cyan-200", extraClass: "text-center text-xs text-gray-600" },
    potSize: { styleKey: "info", borderClass: "border-b border-slate-200 border-l border-slate-200", extraClass: "text-center text-xs" },
    plantHeight: { styleKey: "info", borderClass: "border-b border-slate-200", extraClass: "text-center text-xs" },
    palletCount: { styleKey: "inventory", borderClass: "border-b border-amber-200 border-l border-amber-200", extraClass: "text-center text-xs" },
    unitsPerPallet: { styleKey: "inventory", borderClass: "border-b border-amber-200", extraClass: "text-center text-xs" },
    totalUnits: { styleKey: "inventory", borderClass: "border-b border-amber-200", extraClass: "text-center font-bold text-amber-800 text-xs" },
    totalSold: { styleKey: "inventory", borderClass: "border-b border-amber-200", extraClass: "text-center font-semibold text-amber-700 text-xs" },
    purchasePrice: { styleKey: "purchase", borderClass: "border-b border-blue-200 border-l border-blue-200", extraClass: "text-center text-xs" },
    pricePlus: { styleKey: "pricePlus", borderClass: "border-b border-green-300 border-l border-green-300", extraClass: "text-center font-bold text-green-800 text-xs" },
    basePrice: { styleKey: "basePrice", borderClass: "border-b border-emerald-200 border-l border-emerald-200", extraClass: "text-center text-xs" },
    discount10: { styleKey: "discounts", borderClass: "border-b border-purple-200 border-l border-purple-200", extraClass: "text-center text-xs" },
    discount12: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    discount15: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    discount20: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    discount25: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs" },
    auchan8: { styleKey: "discounts", borderClass: "border-b border-purple-200", extraClass: "text-center text-xs font-medium text-purple-700" },
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
      case "grower":
        return product.grower || product.grower || "";
      case "passport":
        return product.growerPassport || "";
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
      case "image":
        return product.imageUrl ? (
          <div className="relative cursor-zoom-in" onMouseEnter={() => imageUrl && setHoveredImage({ url: imageUrl, name: product.plantName })} onMouseLeave={() => setHoveredImage(null)}>
            <img src={imageUrl || ""} alt={product.plantName} className="w-8 h-8 object-cover rounded transition-transform hover:scale-110" />
          </div>
        ) : (
          <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-sm">🌿</div>
        );
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
      case "purchasePrice":
        return renderEditableCell(product, "purchasePricePln", product.purchasePricePln?.toFixed(2) || "-");
      case "pricePlus":
        return renderEditableCell(product, "pricePlus", product.pricePlus?.toFixed(2) || "-", "font-bold");
      case "basePrice":
        return renderEditableCell(product, "basePriceGross", product.basePriceGross?.toFixed(2) || "-");
      case "discount10":
        return renderEditableCell(product, "priceDiscount10", product.priceDiscount10?.toFixed(2) || "-");
      case "discount12":
        return renderEditableCell(product, "priceDiscount12", product.priceDiscount12?.toFixed(2) || "-");
      case "discount15":
        return renderEditableCell(product, "priceDiscount15", product.priceDiscount15?.toFixed(2) || "-");
      case "discount20":
        return renderEditableCell(product, "priceDiscount20", product.priceDiscount20?.toFixed(2) || "-");
      case "discount25":
        return renderEditableCell(product, "priceDiscount25", product.priceDiscount25?.toFixed(2) || "-");
      case "auchan8":
        // Auchan - edytowalna cena, domyslnie cena podstawowa
        const auchan8Value = product.priceAuchan8 
          ? parseFloat(String(product.priceAuchan8)).toFixed(2) 
          : (product.basePriceGross ? product.basePriceGross.toFixed(2) : "-");
        return renderEditableCell(product, "priceAuchan8", auchan8Value);
      case "visible":
        return (
          <button onClick={() => onToggleVisibility(product.id)} className={`px-1.5 py-0.5 rounded text-xs font-medium ${product.visibleInShop ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"}`}>
            {product.visibleInShop ? "Tak" : "Nie"}
          </button>
        );
      case "grower":
        return product.grower || product.grower || "-";
      case "passport":
        return product.growerPassport || "-";
      case "tags":
        return (
          <>
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
                onClick={() => setEditingTags(editingTags === product.id ? null : product.id)}
                className="ml-auto text-pink-600 hover:text-pink-800 text-xs hover:bg-pink-100 rounded px-1"
                title="Edytuj tagi"
              >
                ✏️
              </button>
            </div>
            {editingTags === product.id && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-pink-300 rounded-lg shadow-lg p-2 w-64 max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {AVAILABLE_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => handleToggleTag(product, tag)}
                      className={`px-1.5 py-0.5 rounded text-[10px] border ${
                        (product.tags || []).includes(tag)
                          ? "bg-pink-500 text-white border-pink-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-pink-50"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setEditingTags(null)}
                  className="mt-2 w-full text-xs text-gray-500 hover:text-gray-700"
                >
                  Zamknij
                </button>
              </div>
            )}
          </>
        );
      case "actions":
        return (
          <div className="flex gap-0.5 flex-nowrap">
            <button onClick={() => onShowBarcode(product)} className="text-gray-600 hover:text-gray-800 text-xs px-0.5 hover:bg-gray-100 rounded" title={product.barcode ? `Kod: ${product.barcode}` : "Generuj kod"}>
              {product.barcode ? "📊" : "➕"}
            </button>
            {onDuplicateProduct && (
              <button onClick={() => onDuplicateProduct(product)} className="text-blue-600 hover:text-blue-800 text-xs px-0.5 hover:bg-blue-50 rounded" title="Kopiuj">📋</button>
            )}
            {!product.isArchived && onReportLoss && (
              <button onClick={() => onReportLoss(product)} className="text-red-600 hover:text-red-800 text-xs px-0.5 hover:bg-red-50 rounded" title="Zglos strate">⚠️</button>
            )}
            {!product.isArchived && onArchiveProduct && (
              <button onClick={() => onArchiveProduct(product)} className="text-yellow-600 hover:text-yellow-800 text-xs px-0.5 hover:bg-yellow-50 rounded" title="Archiwizuj">📦</button>
            )}
            {product.isArchived && onRestoreProduct && (
              <button onClick={() => onRestoreProduct(product)} className="text-green-600 hover:text-green-800 text-xs px-0.5 hover:bg-green-50 rounded" title="Przywroc">↩️</button>
            )}
            {onDeleteProduct && (
              <button onClick={() => onDeleteProduct(product)} className="text-red-600 hover:text-red-800 text-xs px-0.5 hover:bg-red-50 rounded" title="Usuń">🗑️</button>
            )}
          </div>
        );
      default:
        return null;
    }
  };





  // Resizable header cell component
  const ResizableHeader = ({ columnKey, children, className, title }: { columnKey: string; children: React.ReactNode; className: string; title?: string }) => (
    <th
      className={`${className} relative select-none bg-white`}
      style={{ ...getColumnStyle(columnKey), minWidth: isColumnVisible(columnKey) ? 30 : 0 }}
      title={title}
    >
      <div className="truncate pr-2">{children}</div>
      <div
        className="absolute right-[-6px] top-0 h-full w-4 cursor-col-resize group z-10"
        onMouseDown={(e) => handleMouseDown(e, columnKey)}
      >
        <div className="absolute right-[5px] top-0 w-[2px] h-full bg-transparent group-hover:bg-blue-400 group-active:bg-blue-600 transition-colors" />
      </div>
    </th>
  );

  return (
    <>
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
            <img src={hoveredImage.url} alt={hoveredImage.name} className="max-w-[400px] max-h-[400px] object-contain rounded" />
            <p className="text-center text-sm text-gray-600 mt-2 font-medium">{hoveredImage.name}</p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden" style={{ maxHeight: "calc(100vh - 280px)" }}>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <table ref={tableRef} className="table border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                {sortedColumnKeys.map((columnKey) => {
                  const config = headerConfigs[columnKey];
                  if (!config) return null;
                  return (
                    <ResizableHeader
                      key={columnKey}
                      columnKey={columnKey}
                      className={`${config.style} ${config.borderClass || ""}`}
                      title={config.title}
                    >
                      {renderHeaderContent(columnKey)}
                    </ResizableHeader>
                  );
                })}

              </tr>
              {/* Filter row - sticky with headers */}
              {onColumnFilterChange && (
                <tr className="bg-gray-100">
                  {/* 1. checkbox */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('checkbox')}></th>
                  {/* 2. createdAt */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-cyan-300" style={getColumnStyle('createdAt')}></th>
                  {/* 3. visible */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('visible')}>
                    <select
                      value={columnFilters.colVisible || ''}
                      onChange={(e) => onColumnFilterChange('colVisible', e.target.value)}
                      className="w-full px-0.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">Wszystkie</option>
                      <option value="true">Tak</option>
                      <option value="false">Nie</option>
                    </select>
                  </th>
                  {/* 3. image */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('image')}></th>
                  {/* 4. plantName */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-slate-300" style={getColumnStyle('plantName')}>
                    <input
                      type="text"
                      placeholder="Szukaj..."
                      value={columnFilters.colPlantName || ''}
                      onChange={(e) => onColumnFilterChange('colPlantName', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 5. tags */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-pink-300" style={getColumnStyle('tags')}></th>
                  {/* 6. palletCount */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-amber-300" style={getColumnStyle('palletCount')}>
                    <input
                      type="text"
                      placeholder="Palety"
                      value={columnFilters.colPalletCount || ''}
                      onChange={(e) => onColumnFilterChange('colPalletCount', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 7. unitsPerPallet */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('unitsPerPallet')}>
                    <input
                      type="text"
                      placeholder="Szt/pal"
                      value={columnFilters.colUnitsPerPallet || ''}
                      onChange={(e) => onColumnFilterChange('colUnitsPerPallet', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 8. totalUnits */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('totalUnits')}>
                    <input
                      type="text"
                      placeholder="Suma"
                      value={columnFilters.colTotalUnits || ''}
                      onChange={(e) => onColumnFilterChange('colTotalUnits', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 9. potSize */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-slate-300" style={getColumnStyle('potSize')}>
                    <input
                      type="text"
                      placeholder="Rozmiar"
                      value={columnFilters.colPotSize || ''}
                      onChange={(e) => onColumnFilterChange('colPotSize', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 10. plantHeight */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('plantHeight')}>
                    <input
                      type="text"
                      placeholder="Wys."
                      value={columnFilters.colPlantHeight || ''}
                      onChange={(e) => onColumnFilterChange('colPlantHeight', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 11. purchasePrice */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-blue-300" style={getColumnStyle('purchasePrice')}>
                    <input
                      type="text"
                      placeholder="Zakup"
                      value={columnFilters.colPurchasePrice || ''}
                      onChange={(e) => onColumnFilterChange('colPurchasePrice', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 12. pricePlus */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-green-400" style={getColumnStyle('pricePlus')}>
                    <input
                      type="text"
                      placeholder="Cena+"
                      value={columnFilters.colPricePlus || ''}
                      onChange={(e) => onColumnFilterChange('colPricePlus', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 13. basePrice */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-emerald-300" style={getColumnStyle('basePrice')}>
                    <input
                      type="text"
                      placeholder="Podst."
                      value={columnFilters.colBasePrice || ''}
                      onChange={(e) => onColumnFilterChange('colBasePrice', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 14-18. Discount columns - no filter */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-purple-300" style={getColumnStyle('discount10')}></th>
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('discount12')}></th>
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('discount15')}></th>
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('discount20')}></th>
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('discount25')}></th>
                  {/* 19. auchan8 */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('auchan8')}></th>
                  {/* 19. totalSold */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('totalSold')}>
                    <input
                      type="text"
                      placeholder="Sprz."
                      value={columnFilters.colTotalSold || ''}
                      onChange={(e) => onColumnFilterChange('colTotalSold', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 20. grower */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-teal-300" style={getColumnStyle('grower')}>
                    <input
                      type="text"
                      placeholder="Ogrodnik"
                      value={columnFilters.colGrower || ''}
                      onChange={(e) => onColumnFilterChange('colGrower', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 21. passport */}
                  <th className="p-0.5 border-b border-gray-300" style={getColumnStyle('passport')}>
                    <input
                      type="text"
                      placeholder="Paszport"
                      value={columnFilters.colPassport || ''}
                      onChange={(e) => onColumnFilterChange('colPassport', e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </th>
                  {/* 24. actions */}
                  <th className="p-0.5 border-b border-gray-300 border-l border-gray-200" style={getColumnStyle('actions')}></th>
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
                            className={`${isRowSelected ? "" : colStyle} ${config.borderClass} ${config.extraClass || ""} group-hover:!bg-blue-200`}
                            style={getColumnStyle(columnKey)}
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
    </>
  );
}
