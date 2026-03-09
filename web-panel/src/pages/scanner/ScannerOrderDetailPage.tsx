import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API } from '../../services/api';
import type { OrderWithItems, Product, OrderStatus, PriceGroup } from '../../types';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Oczekujące',
  ready_for_pickup: 'Do odbióru',
  completed: 'Zakonczone',
  cancelled: 'Anulowane',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ready_for_pickup: 'bg-purple-100 text-purple-800 border-purple-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_ICONS: Record<string, JSX.Element> = {
  pending: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ready_for_pickup: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  completed: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  cancelled: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// Define valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['pending', 'cancelled'],
  completed: [], // Cannot change from completed
  cancelled: [], // Cannot change from cancelled
};

type QuantityMode = 'pallets' | 'units';

interface EditedItem {
  productId: number;
  quantityMode: QuantityMode; // Tryb: paletki lub sztuki
  inputValue: number; // Wartość wpisana przez użytkownika
  unitsPerPallet: number;
  productName: string;
  unitPrice: number;
  imageUrl?: string;
  // New fields for individual save functionality
  orderItemId?: number; // ID of the saved order item
  isSaved: boolean; // Whether item is saved to backend
  isModified: boolean; // Whether saved item has been modified
  originalInputValue?: number; // Original value before modification (for saved items)
  originalUnitPrice?: number; // Original price before modification
  availableStock?: number; // Current available stock for this product
}

// Helper function to get correct price based on customer's price group
const getCustomerPrice = (product: Product, priceGroupName?: string, priceGroupDiscount?: number): number => {
  if (!priceGroupName) return product.basePriceGross || 0;

  switch (priceGroupName.toLowerCase()) {
    case 'rabat_10':
      return product.priceDiscount10 || product.basePriceGross || 0;
    case 'rabat_12':
      return product.priceDiscount12 || product.basePriceGross || 0;
    case 'rabat_15':
      return product.priceDiscount15 || product.basePriceGross || 0;
    case 'rabat_20':
      return product.priceDiscount20 || product.basePriceGross || 0;
    case 'rabat_25':
      return product.priceDiscount25 || product.basePriceGross || 0;
    case 'auchan_8':
      return product.priceAuchan8 || product.basePriceGross || 0;
    case 'hurt':
      return product.pricePlus || product.basePriceGross || 0;
    case 'podstawowa':
      return product.basePriceGross || 0;
    default: {
      // Dynamic calculation using discount_percentage from price group
      const base = product.basePriceGross || 0;
      if (priceGroupDiscount !== undefined && priceGroupDiscount !== 0) {
        const multiplier = 1 - (priceGroupDiscount / 100);
        return Math.ceil(base * multiplier);
      }
      return base;
    }
  }
};

export function ScannerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Price groups for dynamic price calculation
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<EditedItem[]>([]);

  useEffect(() => {
    API.getPriceGroups().then(r => setPriceGroups(r.priceGroups || [])).catch(() => {});
  }, []);

  // Single item saving state
  const [savingItemIndex, setSavingItemIndex] = useState<number | null>(null);

  // Status change
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Image preview modal
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  // Scanning in edit mode
  const [scanInput, setScanInput] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [lastAddedProduct, setLastAddedProduct] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Product search
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Product orders modal
  const [showProductOrdersModal, setShowProductOrdersModal] = useState(false);
  const [productOrdersData, setProductOrdersData] = useState<{ productName: string; orders: any[] } | null>(null);
  const [loadingProductOrders, setLoadingProductOrders] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Check if there are unsaved items
  const hasUnsavedItems = useCallback(() => {
    return editedItems.some(item => !item.isSaved || item.isModified);
  }, [editedItems]);

  // Warning when leaving page with unsaved items
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (editMode && hasUnsavedItems()) {
        e.preventDefault();
        e.returnValue = 'Masz niezapisane produkty. Czy na pewno chcesz wyjść?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editMode, hasUnsavedItems]);

  useEffect(() => {
    if (id) {
      loadOrder();
    }
  }, [id]);

  // Focus scan input when entering edit mode
  useEffect(() => {
    if (editMode && scanInputRef.current) {
    }
  }, [editMode]);

  // Clear last added product message after 2 seconds
  useEffect(() => {
    if (lastAddedProduct) {
      const timer = setTimeout(() => setLastAddedProduct(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [lastAddedProduct]);

  const loadOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await API.getOrder(Number(id));
      setOrder(result.order);
      
      // Get unique product IDs to fetch current stock
      const uniqueProductIds = [...new Set(result.order.items.map(item => item.productId).filter(Boolean))] as number[];
      
      // Fetch current stock for all products in parallel
      const stockMap = new Map<number, number>();
      if (uniqueProductIds.length > 0) {
        const stockPromises = uniqueProductIds.map(async (productId) => {
          try {
            const productData = await API.getProduct(productId);
            return { productId, stock: productData.product.totalUnits ?? 0 };
          } catch {
            return { productId, stock: 0 };
          }
        });
        const stockResults = await Promise.all(stockPromises);
        stockResults.forEach(({ productId, stock }) => stockMap.set(productId, stock));
      }
      
      setEditedItems(result.order.items.map(item => {
        const unitsPerPallet = item.unitsPerPallet || item.productSnapshot?.unitsPerPallet || 1;
        // Używamy rzeczywistej ilości palet (ułamkowej) aby zachować dokładną ilość sztuk
        const actualPalletCount = item.quantity / unitsPerPallet;
        return {
          productId: item.productId ?? 0,
          quantityMode: 'pallets' as QuantityMode,
          inputValue: actualPalletCount,
          unitsPerPallet,
          productName: item.productSnapshot?.plantName || item.productName || 'Produkt',
          unitPrice: item.unitPriceGross || 0,
          imageUrl: item.productSnapshot?.imageUrl,
          // Mark existing items as saved
          orderItemId: item.id,
          isSaved: true,
          isModified: false,
          originalInputValue: actualPalletCount,
          originalUnitPrice: item.unitPriceGross || 0,
          availableStock: stockMap.get(item.productId ?? 0) ?? 0,
        };
      }));
      // Auto-enable edit mode for empty orders
      if (result.order.items.length === 0 && result.order.status === 'pending') {
        setEditMode(true);
      }
    } catch (err: any) {
      setError('Nie udało się pobrać zamówienia');
    } finally {
      setLoading(false);
    }
  };

  // Save single item to backend

  // Helper function to update stock for a product across all items
  const updateStockForProduct = (productId: number, quantityChange: number) => {
    setEditedItems(prevItems => 
      prevItems.map(item => 
        item.productId === productId 
          ? { ...item, availableStock: Math.max(0, (item.availableStock ?? 0) - quantityChange) }
          : item
      )
    );
  };

  const handleSaveItem = async (index: number) => {
    if (!order) return;

    const item = editedItems[index];
    if (item.isSaved && !item.isModified) return; // Already saved and not modified

    setSavingItemIndex(index);
    setError(null);

    try {
      if (item.isSaved && item.orderItemId) {
        // Update existing item
        await API.updateOrderItem(order.id, item.orderItemId, {
          quantity: getItemUnits(item),
          palletCount: Math.ceil(getItemPallets(item)),
          unitsPerPallet: item.unitsPerPallet,
        });
      } else {
        // Add new item
        const result = await API.addOrderItem(order.id, {
          productId: item.productId,
          quantity: getItemUnits(item),
          unitPriceGross: item.unitPrice,
          palletCount: Math.ceil(getItemPallets(item)),
          unitsPerPallet: item.unitsPerPallet,
        });

        // Update the item with the returned orderItemId
        const newItems = [...editedItems];
        newItems[index] = {
          ...newItems[index],
          orderItemId: result.item?.id || result.id,
          isSaved: true,
          isModified: false,
          originalInputValue: item.inputValue,
          originalUnitPrice: item.unitPrice,
        };
        setEditedItems(newItems);
        setSavingItemIndex(null);
        // Update stock for this product across all items
        updateStockForProduct(item.productId, getItemUnits(item));
        return;
      }

      // Update local state for existing item update
      const newItems = [...editedItems];
      newItems[index] = {
        ...newItems[index],
        isSaved: true,
        isModified: false,
        originalInputValue: item.inputValue,
        originalUnitPrice: item.unitPrice,
      };
      setEditedItems(newItems);
      // Update stock based on quantity difference
      const originalUnits = (item.originalInputValue ?? 0) * item.unitsPerPallet;
      const newUnits = getItemUnits(item);
      const quantityDiff = newUnits - originalUnits;
      if (quantityDiff !== 0) {
        updateStockForProduct(item.productId, quantityDiff);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udało się zapisać produktu');
    } finally {
      setSavingItemIndex(null);
    }
  };

  // Auto-save unsaved items before adding new product
  // This function saves all unsaved items in a batch and updates state once
  const autoSaveUnsavedItems = async () => {
    if (!order) return;

    // Get all unsaved items with their current data
    const unsavedItems = editedItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.isSaved);

    if (unsavedItems.length === 0) return;

    // Save all unsaved items and collect results
    const saveResults: { index: number; orderItemId: number }[] = [];

    for (const { item, index } of unsavedItems) {
      try {
        const result = await API.addOrderItem(order.id, {
          productId: item.productId,
          quantity: getItemUnits(item),
          unitPriceGross: item.unitPrice,
          palletCount: Math.ceil(getItemPallets(item)),
          unitsPerPallet: item.unitsPerPallet,
        });
        saveResults.push({
          index,
          orderItemId: result.item?.id || result.id
        });
      } catch (err: any) {
        console.error('Auto-save error for item', index, err);
        // Continue with other items even if one fails
      }
    }

    // Update state once with all saved items using functional update
    if (saveResults.length > 0) {
      setEditedItems(prevItems => {
        const newItems = [...prevItems];
        for (const { index, orderItemId } of saveResults) {
          if (newItems[index]) {
            newItems[index] = {
              ...newItems[index],
              orderItemId,
              isSaved: true,
              isModified: false,
              originalInputValue: newItems[index].inputValue,
              originalUnitPrice: newItems[index].unitPrice,
            };
          }
        }
        return newItems;
      });
    }
  };

  // Handle barcode scan (Enter key press or long number input)
  const handleScanInput = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Only process on Enter key
    if (e.key !== 'Enter') return;

    const barcode = scanInput.trim();
    if (!barcode || barcode.length < 8) {
      setScanInput('');
      return;
    }

    setScanLoading(true);
    setError(null);

    try {
      // Auto-save unsaved items first
      await autoSaveUnsavedItems();

      const result = await API.scanBarcode(barcode);
      if (result.product) {
        handleAddProduct(result.product);
        setLastAddedProduct(result.product.plantName);
      } else {
        setError('Produkt nie znaleziony');
      }
    } catch (err: any) {
      setError('Produkt nie znaleziony');
    } finally {
      setScanLoading(false);
      setScanInput('');
      // Re-focus the input for next scan
      }
  };

  // Obsługa skanera kodów kreskowych z prefiksem [barcode]
  const handleDirectBarcodeScan = useCallback(async (barcode: string) => {
    if (!editMode) return; // Tylko w trybie edycji

    setScanLoading(true);
    setError(null);

    try {
      // Auto-save unsaved items first
      await autoSaveUnsavedItems();

      const result = await API.scanBarcode(barcode);
      if (result.product) {
        handleAddProduct(result.product);
        setLastAddedProduct(result.product.plantName);
      } else {
        setError('Produkt nie znaleziony: ' + barcode);
      }
    } catch (err: any) {
      setError('Produkt nie znaleziony: ' + barcode);
    } finally {
      setScanLoading(false);
      setScanInput('');
    }
  }, [editMode]);

  useBarcodeScanner({ onScan: handleDirectBarcodeScan, enabled: editMode });

  // Search products by name (debounced)
  const handleSearchProducts = async (query: string) => {
    // Clear previous timeout
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // If query is too short or looks like a barcode, don't search
    if (query.length < 2 || /^\d{8,}$/.test(query)) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    // Debounce search
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const result = await API.getInventory({
          search: query,
          isArchived: false
        });
        setSearchResults(result.products.slice(0, 20)); // Max 20 results
        setShowSearchDropdown(result.products.length > 0);
      } catch (err) {
        console.error('Search error:', err);
        setSearchResults([]);
        setShowSearchDropdown(false);
      }
    }, 300);
  };

  // Handle selecting a product from search results
  const handleSelectSearchResult = async (product: Product) => {
    // Auto-save unsaved items first
    await autoSaveUnsavedItems();

    handleAddProduct(product);
    setLastAddedProduct(product.plantName);
    setScanInput('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  // Handle input change - search or prepare for barcode
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setScanInput(value);

    // If input contains letters, trigger search
    if (/[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(value)) {
      handleSearchProducts(value);
    } else {
      // Pure numbers - likely barcode, hide search dropdown
      setShowSearchDropdown(false);
      setSearchResults([]);
    }
  };

  const handleAddProduct = (product: Product) => {
    // Block products with zero stock
    if ((product.totalUnits ?? 0) <= 0) {
      setError(`Produkt "${product.plantName}" jest niedostępny (stan: 0)`);
      return;
    }

    // Use functional update to ensure we work with latest state
    setEditedItems(prevItems => {
      const existingIndex = prevItems.findIndex(item => item.productId === product.id);
      if (existingIndex >= 0) {
        // Increase value by 1 and move to top of list
        const existingItem = prevItems[existingIndex];
        const updatedItem = {
          ...existingItem,
          inputValue: existingItem.inputValue + 1,
          isModified: existingItem.isSaved ? true : existingItem.isModified, // Mark as modified if saved
          availableStock: product.totalUnits, // Refresh stock from scanned product
        };
        const otherItems = prevItems.filter((_, i) => i !== existingIndex);
        return [updatedItem, ...otherItems];
      } else {
        // Add new (unsaved)
        return [{
          productId: product.id,
          quantityMode: 'pallets' as QuantityMode,
          inputValue: 1,
          unitsPerPallet: product.unitsPerPallet || 1,
          productName: product.plantName,
          unitPrice: getCustomerPrice(product, order?.customerPriceGroupName, priceGroups.find(pg => pg.name === order?.customerPriceGroupName)?.discountPercentage),
          imageUrl: product.imageUrl,
          isSaved: false,
          availableStock: product.totalUnits,
          isModified: false,
        }, ...prevItems];
      }
    });
  };

  // Toggle quantity mode
  const toggleQuantityMode = (index: number) => {
    const newItems = [...editedItems];
    const item = newItems[index];
    if (item.quantityMode === 'pallets') {
      // Switch from pallets to units
      newItems[index] = {
        ...item,
        quantityMode: 'units',
        inputValue: item.inputValue * item.unitsPerPallet,
      };
    } else {
      // Switch from units to pallets
      const pallets = Math.max(1, Math.round(item.inputValue / item.unitsPerPallet));
      newItems[index] = {
        ...item,
        quantityMode: 'pallets',
        inputValue: pallets,
      };
    }
    setEditedItems(newItems);
  };

  const handleInputValueChange = (index: number, value: string) => {
    const newItems = [...editedItems];
    const item = newItems[index];
    const newValue = item.quantityMode === "pallets" ? (parseFloat(value) || 0) : (parseInt(value) || 0);
    newItems[index] = {
      ...item,
      inputValue: Math.max(0, newValue),
      isModified: item.isSaved ? true : item.isModified, // Mark as modified if saved
    };
    setEditedItems(newItems);
  };

  const handleQuantityChange = (index: number, delta: number) => {
    const newItems = [...editedItems];
    const item = newItems[index];
    const newValue = Math.max(1, item.inputValue + delta);
    newItems[index] = {
      ...item,
      inputValue: newValue,
      isModified: item.isSaved ? true : item.isModified, // Mark as modified if saved
    };
    setEditedItems(newItems);
  };

  const handlePriceChange = (index: number, value: string) => {
    const newItems = [...editedItems];
    const item = newItems[index];
    const newPrice = parseFloat(value) || 0;
    newItems[index] = {
      ...item,
      unitPrice: Math.max(0, newPrice),
      isModified: item.isSaved ? true : item.isModified, // Mark as modified if saved
    };
    setEditedItems(newItems);
  };

  const handleRemoveItem = async (index: number) => {
    const item = editedItems[index];

    // If item is saved, delete from backend
    if (item.isSaved && item.orderItemId && order) {
      try {
        await API.deleteOrderItem(order.id, item.orderItemId);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Nie udało się usunąć produktu');
        return;
      }
    }

    const newItems = [...editedItems];
    newItems.splice(index, 1);
    setEditedItems(newItems);
  };

  // Calculate total units for an item

  // Show orders containing this product
  const handleShowProductOrders = async (productId: number, productName: string) => {
    setLoadingProductOrders(true);
    setShowProductOrdersModal(true);
    setProductOrdersData({ productName, orders: [] });
    try {
      const result = await API.getOrdersByProduct(productId, 20);
      // Filter out current order
      const filteredOrders = result.orders.filter(o => o.id !== order?.id);
      setProductOrdersData({ productName, orders: filteredOrders });
    } catch (err) {
      setProductOrdersData({ productName, orders: [] });
    } finally {
      setLoadingProductOrders(false);
    }
  };
  const getItemUnits = (item: EditedItem) => {
    if (item.quantityMode === 'pallets') {
      return Math.round(item.inputValue * item.unitsPerPallet);
    }
    return item.inputValue;
  };

  // Calculate pallet count for an item
  const getItemPallets = (item: EditedItem) => {
    if (item.quantityMode === 'pallets') {
      return item.inputValue;
    }
    return item.inputValue / item.unitsPerPallet;
  };

  // Calculate pallet price
  const getPalletPrice = (item: EditedItem) => item.unitPrice * item.unitsPerPallet;

  // Calculate item total
  const getItemTotal = (item: EditedItem) => item.unitPrice * getItemUnits(item);

  const handleSave = async () => {
    if (!order) return;

    // Validate all items have quantity > 0
    const invalidItems = editedItems.filter(item => getItemUnits(item) <= 0);
    if (invalidItems.length > 0) {
      setError('Wszystkie produkty muszą mieć ilość większą niż 0');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await API.updateOrder(order.id, {
        items: editedItems.map(item => ({
          productId: item.productId ?? 0,
          quantity: getItemUnits(item), // Send total units
          palletCount: Math.ceil(getItemPallets(item)),
          unitsPerPallet: item.unitsPerPallet,
          unitPriceGross: item.unitPrice,
        })),
      });
      await loadOrder();
      setEditMode(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udało się zapisać zmian');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Check for unsaved items
    if (hasUnsavedItems()) {
      if (!window.confirm('Masz niezapisane produkty. Czy na pewno chcesz anulować?')) {
        return;
      }
    }

    if (!order) return;
    setEditedItems(order.items.map(item => {
      const unitsPerPallet = item.unitsPerPallet || item.productSnapshot?.unitsPerPallet || 1;
      // Używamy rzeczywistej ilości palet (ułamkowej) aby zachować dokładną ilość sztuk
        const actualPalletCount = item.quantity / unitsPerPallet;
      return {
        productId: item.productId ?? 0,
        quantityMode: 'pallets' as QuantityMode,
        inputValue: actualPalletCount,
        unitsPerPallet,
        productName: item.productSnapshot?.plantName || item.productName || 'Produkt',
        unitPrice: item.unitPriceGross || 0,
        imageUrl: item.productSnapshot?.imageUrl,
        orderItemId: item.id,
        isSaved: true,
        isModified: false,
        originalInputValue: actualPalletCount,
        originalUnitPrice: item.unitPriceGross || 0,
      };
    }));
    setEditMode(false);
    setScanInput('');
  };

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!order) return;

    setChangingStatus(true);
    setError(null);
    try {
      await API.updateOrderStatus(order.id, newStatus);
      await loadOrder();
      setShowStatusModal(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udało się zmienić statusu');
    } finally {
      setChangingStatus(false);
    }
  };

  // Proper order cancellation with stock restoration
  const handleCancelOrder = async () => {
    if (!order) return;

    setChangingStatus(true);
    setError(null);
    try {
      await API.cancelOrder(order.id, 'Anulowano przez aplikację skanera');
      await loadOrder();
      setShowStatusModal(false);
      setShowCancelConfirm(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udało się anulować zamówienia');
    } finally {
      setChangingStatus(false);
    }
  };

  // Handle navigation back with unsaved items warning
  const handleNavigateBack = () => {
    if (editMode && hasUnsavedItems()) {
      if (!window.confirm('Masz niezapisane produkty. Czy na pewno chcesz wyjść?')) {
        return;
      }
    }
    navigate('/scanner/orders');
  };

  const calculateTotal = () => {
    return editedItems.reduce((sum, item) => sum + getItemTotal(item), 0);
  };

  const getTotalUnits = () => {
    return editedItems.reduce((sum, item) => sum + getItemUnits(item), 0);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-3">
        <div className="text-red-500 mb-3 text-sm">{error}</div>
        <button
          onClick={() => navigate('/scanner/orders')}
          className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm"
        >
          Wroc do listy
        </button>
      </div>
    );
  }

  if (!order) return null;

  const isEditable = order.status === 'pending';
  const availableTransitions = STATUS_TRANSITIONS[order.status] || [];
  const canChangeStatus = availableTransitions.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header - Compact */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleNavigateBack}
              className="p-1 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">#{order.orderNumber}</h1>
              <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
            </div>
          </div>
          <button
            onClick={() => canChangeStatus && setShowStatusModal(true)}
            disabled={!canChangeStatus}
            className={`px-2 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${STATUS_COLORS[order.status]} ${canChangeStatus ? 'cursor-pointer active:opacity-80' : 'cursor-default'}`}
          >
            {STATUS_ICONS[order.status]}
            {STATUS_LABELS[order.status]}
            {canChangeStatus && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>
        {order.customerName && (
          <p className="text-xs font-medium text-gray-700 mt-1 ml-7">{order.customerCode ? `[${order.customerCode}] ${order.customerName}` : order.customerName}</p>
        )}
      </div>

      {/* Scan Input - Compact */}
      {editMode && (
        <div className="bg-green-50 border-b border-green-200 px-3 py-2">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <input
              ref={scanInputRef}
              type="text"
              inputMode="text"
              value={scanInput}
              onChange={handleInputChange}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
              onKeyDown={handleScanInput}
              placeholder="Skanuj kod lub wyszukaj produkt..."
              className="w-full pl-10 pr-10 py-2.5 text-base border border-green-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoComplete="off"
            />
            {scanLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
              </div>
            )}

            {/* Search Results Dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                {searchResults.map((product) => {
                  const isOutOfStock = (product.totalUnits ?? 0) <= 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className={`w-full px-3 py-2 flex items-center gap-3 border-b border-gray-100 last:border-b-0 text-left ${
                        isOutOfStock
                          ? 'bg-gray-50 hover:bg-gray-100'
                          : 'hover:bg-primary-50'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSearchResult(product);
                      }}
                    >
                      {/* Product image */}
                      <div className="relative">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.plantName}
                            className={`w-10 h-10 object-cover rounded ${isOutOfStock ? 'opacity-50' : ''}`}
                          />
                        ) : (
                          <div className={`w-10 h-10 bg-gray-200 rounded flex items-center justify-center ${isOutOfStock ? 'opacity-50' : ''}`}>
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-xs ${isOutOfStock ? 'text-gray-500' : 'text-gray-900'}`}>
                          {product.plantName}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                          {product.potSize && <span>{product.potSize}</span>}
                          {product.potSize && product.plantHeightCm && <span> • </span>}
                          {product.plantHeightCm && <span>{product.plantHeightCm}cm</span>}
                          {(product.potSize || product.plantHeightCm) && <span> • </span>}
                          <span>{product.unitsPerPallet || 1} szt./pal.</span>
                          {product.createdAt && (
                            <>
                              <span> • </span>
                              <span className="text-gray-400">{new Date(product.createdAt).toLocaleDateString('pl-PL')}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Stock indicator and action */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-blue-600">{product.basePriceGross?.toFixed(2) || "0"} PLN</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          isOutOfStock
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-primary-700'
                        }`}>
                          {isOutOfStock ? 'Brak' : `${product.totalUnits} szt.`}
                        </span>
                        {isOutOfStock ? (
                          <div className="text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </div>
                        ) : (
                          <div className="text-primary-600">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Success message - Compact */}
          {lastAddedProduct && (
            <div className="mt-1.5 flex items-center gap-1.5 text-primary-700 bg-green-100 px-2 py-1 rounded text-sm animate-pulse">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium truncate">Dodano: {lastAddedProduct}</span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {error && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Quick Status Actions - Compact */}
        {!editMode && canChangeStatus && (
          <div className="mb-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {availableTransitions.filter(s => s !== 'cancelled').map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status as OrderStatus)}
                  disabled={changingStatus}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-medium text-xs flex items-center gap-1.5 ${
                    status === 'ready_for_pickup' ? 'bg-purple-500 text-white hover:bg-purple-600' :
                    status === 'completed' ? 'bg-primary-500 text-white hover:bg-primary-600' :
                    status === 'pending' ? 'bg-yellow-500 text-white hover:bg-yellow-600' :
                    'bg-gray-500 text-white hover:bg-gray-600'
                  } disabled:opacity-50`}
                >
                  {changingStatus ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                  ) : (
                    STATUS_ICONS[status]
                  )}
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Items - Compact with Images */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-2">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-700 text-sm">Pozycje ({editedItems.length})</h2>
            {isEditable && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="text-xs text-primary-600 font-medium"
              >
                Edytuj
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            {editedItems.map((item, index) => (
              <div
                key={`${item.productId}-${index}`}
                className={`px-3 py-2 ${!item.isSaved ? 'bg-yellow-50' : item.isModified ? 'bg-blue-50' : ''}`}
              >
                <div className="flex gap-3">
                  {/* Image thumbnail + Save button column */}
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => item.imageUrl && setPreviewImage({ url: item.imageUrl, name: item.productName })}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 ${item.imageUrl ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                      disabled={!item.imageUrl}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="w-6 h-6 text-gray-300 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Save/Update button under image - only in edit mode */}
                    {editMode && (!item.isSaved || item.isModified) && (
                      <button
                        onClick={() => handleSaveItem(index)}
                        disabled={savingItemIndex === index || getItemUnits(item) <= 0}
                        className={`w-14 h-14 rounded-lg flex items-center justify-center text-white font-bold text-xl transition-colors disabled:opacity-50 ${
                          item.isModified
                            ? 'bg-blue-500 hover:bg-blue-600'
                            : 'bg-primary-500 hover:bg-primary-600'
                        }`}
                        title={item.isModified ? 'Aktualizuj' : 'Zapisz'}
                      >
                        {savingItemIndex === index ? (
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                        ) : item.isModified ? (
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Saved indicator */}
                    {editMode && item.isSaved && !item.isModified && (
                      <div className="w-14 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Item details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-xs font-medium text-gray-900">{item.productName}</div>
                          {/* Status badges */}
                          {!item.isSaved && (
                            <span className="px-1.5 py-0.5 bg-yellow-200 text-yellow-800 text-[10px] font-medium rounded">
                              Nowy
                            </span>
                          )}
                          {item.isModified && (
                            <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[10px] font-medium rounded">
                              Zmieniony
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.unitPrice.toFixed(2)} PLN/szt. ({item.unitsPerPallet} szt./pal.)
                        </div>
                        <div className={`text-xs ${(item.availableStock ?? 0) <= 0 ? "text-red-600 font-medium" : (item.availableStock ?? 0) < 50 ? "text-orange-600" : "text-gray-500"}`}>
                          Magazyn: {item.availableStock ?? 0} szt. ({Math.floor((item.availableStock ?? 0) / item.unitsPerPallet)} pal.)
                        </div>
                      </div>


                      {/* Button to view other orders with this product */}
                      <button
                        onClick={() => handleShowProductOrders(item.productId, item.productName)}
                        className="p-1 text-blue-500 hover:bg-blue-50 rounded ml-1"
                        title="Zamówienia z tym produktem"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </button>
                      {editMode && (
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded ml-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {editMode ? (
                      <>
                        {/* Quantity Mode Toggle */}
                        <div className="flex items-center gap-2 mt-2 mb-2">
                          <span className="text-xs text-gray-500">Tryb:</span>
                          <div className="flex rounded-lg overflow-hidden border border-gray-300">
                            <button
                              onClick={() => item.quantityMode !== 'pallets' && toggleQuantityMode(index)}
                              className={`px-2 py-1 text-xs font-medium transition-colors ${
                                item.quantityMode === 'pallets'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Paletki
                            </button>
                            <button
                              onClick={() => item.quantityMode !== 'units' && toggleQuantityMode(index)}
                              className={`px-2 py-1 text-xs font-medium transition-colors ${
                                item.quantityMode === 'units'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Sztuki
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {/* Row 1: Quantity controls + Total */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleQuantityChange(index, -1)}
                                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                </svg>
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                value={item.inputValue}
                                onChange={(e) => handleInputValueChange(index, e.target.value)}
                                className="w-14 h-8 text-center text-base font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              />
                              <span className={`text-xs font-medium ${
                                item.quantityMode === 'pallets' ? 'text-primary-600' : 'text-blue-600'
                              }`}>
                                {item.quantityMode === 'pallets' ? 'pal.' : 'szt.'}
                              </span>
                              <button
                                onClick={() => handleQuantityChange(index, 1)}
                                className="w-8 h-8 bg-green-100 hover:bg-primary-200 text-primary-700 rounded-lg flex items-center justify-center"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </button>
                            </div>
                            <div className="text-right">
                              <div className="text-base font-bold text-primary-600">
                                {getItemTotal(item).toFixed(2)} PLN
                              </div>
                              <div className="text-xs text-gray-500">
                                {item.quantityMode === 'pallets'
                                  ? `= ${getItemUnits(item)} szt.`
                                  : `= ${getItemPallets(item).toFixed(2)} pal.`
                                }
                              </div>
                            </div>
                          </div>
                          {/* Row 2: Price edit */}
                          <div className="flex items-center justify-between bg-blue-50 rounded-lg px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">Cena:</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={item.unitPrice}
                                onChange={(e) => handlePriceChange(index, e.target.value)}
                                className="w-16 h-7 text-center text-sm font-medium border border-blue-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <span className="text-xs text-gray-600">PLN/szt.</span>
                            </div>
                            <span className="text-xs text-blue-600 font-medium">{getPalletPrice(item).toFixed(2)} PLN/pal.</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-gray-600">
                          <span className="font-semibold">{Math.ceil(getItemPallets(item))}</span> pal. x {item.unitsPerPallet} = <span className="font-semibold">{getItemUnits(item)}</span> szt.
                        </div>
                        <div className="text-sm font-bold text-primary-600">
                          {getItemTotal(item).toFixed(2)} PLN
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Empty state when no items */}
            {editedItems.length === 0 && (
              <div className="p-6 text-center text-gray-500">
                <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm">Skanuj produkty aby dodać do zamówienia</p>
              </div>
            )}
          </div>

          {/* Total - Compact */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-semibold text-gray-700 text-sm">Razem</span>
                <span className="text-xs text-gray-500 ml-2">{getTotalUnits()} szt.</span>
              </div>
              <span className="text-lg font-bold text-primary-600">{calculateTotal().toFixed(2)} PLN</span>
            </div>
          </div>
        </div>

        {/* Notes - Compact */}
        {order.customerNotes && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 mb-2">
            <h3 className="font-semibold text-gray-700 text-sm mb-1">Uwagi</h3>
            <p className="text-gray-600 text-sm">{order.customerNotes}</p>
          </div>
        )}
      </div>

      {/* Bottom Actions - Compact */}
      {editMode && (
        <div className="bg-white border-t border-gray-200 px-3 py-2 safe-area-bottom">
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              disabled={saving || editedItems.length === 0}
              className="flex-1 py-2.5 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center text-sm"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                'Zapisz zmiany'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <p className="text-white text-center mt-3 text-sm font-medium">{previewImage.name}</p>
          </div>
        </div>
      )}

      {/* Status Change Modal - Compact */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-sm sm:rounded-xl rounded-t-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Zmien status</h2>
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="p-1 text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-3 space-y-1.5">
              {/* Current status */}
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">Aktualny status:</div>
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                  {STATUS_ICONS[order.status]}
                  {STATUS_LABELS[order.status]}
                </div>
              </div>

              {/* Available transitions */}
              <div className="text-xs text-gray-500 mb-1.5">Zmien na:</div>
              {availableTransitions.map((status) => (
                <button
                  key={status}
                  onClick={() => status === 'cancelled' ? setShowCancelConfirm(true) : handleStatusChange(status as OrderStatus)}
                  disabled={changingStatus}
                  className={`w-full p-2.5 rounded-lg text-left flex items-center gap-2 transition-colors ${
                    status === 'cancelled'
                      ? 'bg-red-50 hover:bg-red-100 border border-red-200'
                      : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                  } disabled:opacity-50`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    status === 'ready_for_pickup' ? 'bg-purple-100 text-purple-600' :
                    status === 'completed' ? 'bg-green-100 text-primary-600' :
                    status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                    status === 'cancelled' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {changingStatus ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                    ) : (
                      STATUS_ICONS[status]
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{STATUS_LABELS[status]}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {status === 'ready_for_pickup' && 'Zamówienie czeka na odbiór'}
                      {status === 'completed' && 'Zamówienie zostało odebrane'}
                      {status === 'pending' && 'Przywroc do oczekujacych'}
                      {status === 'cancelled' && 'Anuluj zamówienie'}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-3 border-t border-gray-200">
              <button
                onClick={() => setShowStatusModal(false)}
                className="w-full py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 text-sm"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full overflow-hidden shadow-xl">
            <div className="p-4 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Anulować zamówienie?</h3>
              <p className="text-gray-600 text-sm mb-2">
                Czy na pewno chcesz anulować to zamówienie?
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-4">
                <p className="text-primary-700 text-xs flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Produkty zostana zwrocone do magazynu
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200"
                >
                  Nie, wroc
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={changingStatus}
                  className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center"
                >
                  {changingStatus ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    'Tak, anuluj'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Orders Modal */}
      {showProductOrdersModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Zamówienia z produktem</h3>
                <p className="text-xs text-gray-500 truncate">{productOrdersData?.productName}</p>
              </div>
              <button
                onClick={() => setShowProductOrdersModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-3">
              {loadingProductOrders ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : productOrdersData?.orders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Brak innych aktywnych zamówień z tym produktem
                </div>
              ) : (
                <div className="space-y-2">
                  {productOrdersData?.orders.map((ord) => (
                    <div key={ord.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-gray-900">{ord.orderNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          ord.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {STATUS_LABELS[ord.status] || ord.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {ord.customerCode ? `[${ord.customerCode}] ` : ''}{ord.customerName || 'Brak klienta'}
                      </div>
                      <div className="flex items-center justify-between mt-1 text-xs">
                        <span className="text-gray-500">
                          {new Date(ord.createdAt).toLocaleDateString('pl-PL')}
                        </span>
                        <span className="font-medium text-primary-600">
                          {ord.productQuantity} szt.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-gray-200">
              <button
                onClick={() => setShowProductOrdersModal(false)}
                className="w-full py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 text-sm"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
