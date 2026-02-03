import { useState, useEffect, useMemo } from 'react';
import { ExcelExportModal } from '../components/Inventory/ExcelExportModal';
import { api } from '../services/api';
import { Product, InventoryMovement } from '../types';
import { InventoryTable, ColumnFilters } from '../components/Inventory/InventoryTable';
import { ProductDetails } from '../components/Inventory/ProductDetails';
import { ProductForm } from '../components/Inventory/ProductForm';
import { CSVImportModal } from '../components/Inventory/CSVImportModal';
import { ExcelImportModal } from '../components/Inventory/ExcelImportModal';
import { BarcodeModal } from '../components/Inventory/BarcodeModal';
import { BatchBarcodeModal } from '../components/Inventory/BatchBarcodeModal';
import { InventoryFilters, InventoryFilterValues } from '../components/Inventory/InventoryFilters';
import { ProductDistributionPanel } from '../components/Inventory/ProductDistributionPanel';
import { SimilarProductsModal } from '../components/Inventory/SimilarProductsModal';
import { BulkTagsModal } from '../components/Inventory/BulkTagsModal';
import { useColumnPreferences } from '../hooks/useColumnPreferences';
import { ColumnConfigModal } from '../components/Inventory/ColumnConfigModal';

export function InventoryPage() {
  const isAdmin = (() => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return false;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.role === "admin";
    } catch { return false; }
  })();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<InventoryFilterValues>(() => {
    const saved = localStorage.getItem("inventorySortPreferences");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          sortBy: parsed.sortBy || "plant_name",
          sortOrder: parsed.sortOrder || "ASC",
        };
      } catch {
        return { sortBy: "plant_name", sortOrder: "ASC" };
      }
    }
    return { sortBy: "plant_name", sortOrder: "ASC" };
  });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const [showExcelExportModal, setShowExcelExportModal] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [showBatchBarcodeModal, setShowBatchBarcodeModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'all'>('active');
  const [counts, setCounts] = useState<{ active: number; archived: number }>({ active: 0, archived: 0 });
  const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);
  const [distributionPanelEnabled, setDistributionPanelEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('distributionPanelEnabled');
    return saved !== null ? saved === 'true' : true; // domyślnie włączony
  });
  const [showSimilarProductsModal, setShowSimilarProductsModal] = useState(false);
  const [showBulkTagsModal, setShowBulkTagsModal] = useState(false);
  const [lossProduct, setLossProduct] = useState<Product | null>(null);
  const [lossQuantity, setLossQuantity] = useState<string>("");
  const [lossNotes, setLossNotes] = useState<string>("");
  const [submittingLoss, setSubmittingLoss] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Pagination state
  const ITEMS_PER_PAGE = 200;
  const [currentPage, setCurrentPage] = useState(1);

  // Column preferences hook
  const {
    visibleColumns,
    columnOrder,
    toggleColumnVisibility,
    reorderColumns,
    resetToDefaults,
  } = useColumnPreferences();

  // Hide purchase price and price+ columns for non-admins
  const filteredVisibleColumns = isAdmin
    ? visibleColumns
    : visibleColumns.filter(col => col !== "purchasePrice" && col !== "pricePlus");

  // Zapisz ustawienie do localStorage
  useEffect(() => {
    localStorage.setItem('distributionPanelEnabled', String(distributionPanelEnabled));
  }, [distributionPanelEnabled]);

  // Handle column filter change
  const handleColumnFilterChange = (key: keyof ColumnFilters, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  // Handle column header sort click
  const handleSort = (field: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'ASC' ? 'DESC' : 'ASC',
    }));
  };

  // Zapisz preferencje sortowania do localStorage
  useEffect(() => {
    localStorage.setItem('inventorySortPreferences', JSON.stringify({
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }));
  }, [filters.sortBy, filters.sortOrder]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      // 'all' shows everything, 'archived' shows archived, 'active' shows active
      const isArchivedParam = activeTab === 'all' ? 'all' : activeTab === 'archived';
      const data = await api.getInventory({ isArchived: isArchivedParam });
      setAllProducts(data.products);
      if (data.counts) {
        setCounts(data.counts);
      }
      setSelectedProducts([]);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [activeTab]);

  // Client-side filtering and sorting
  const filteredProducts = useMemo(() => {
    let result = [...allProducts];

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(p =>
        (p.plantName && p.plantName.toLowerCase().includes(searchLower)) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(searchLower))
      );
    }

    if (filters.status) {
      result = result.filter(p => p.inventoryStatus === filters.status);
    }

    if (filters.grower) {
      result = result.filter(p => p.grower === filters.grower);
    }

    if (filters.potSize) {
      result = result.filter(p => p.potSize === filters.potSize);
    }

    if (filters.visibleInShop !== undefined && filters.visibleInShop !== '') {
      const isVisible = filters.visibleInShop === 'true';
      result = result.filter(p => p.visibleInShop === isVisible);
    }

    if (filters.hasBarcode !== undefined && filters.hasBarcode !== '') {
      const hasBarcode = filters.hasBarcode === 'true';
      result = result.filter(p => hasBarcode ? !!p.barcode : !p.barcode);
    }

    if (filters.priceMin !== undefined) {
      result = result.filter(p => (p.basePriceGross || 0) >= filters.priceMin!);
    }
    if (filters.priceMax !== undefined) {
      result = result.filter(p => (p.basePriceGross || 0) <= filters.priceMax!);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      result = result.filter(p => {
        const productDate = new Date(p.createdAt);
        return productDate >= fromDate;
      });
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(p => {
        const productDate = new Date(p.createdAt);
        return productDate <= toDate;
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      result = result.filter(p => {
        const productTags = p.tags || [];
        return filters.tags!.some(tag => productTags.includes(tag));
      });
    }

    // Column filters
    if (columnFilters.colPlantName) {
      const searchLower = columnFilters.colPlantName.toLowerCase();
      result = result.filter(p => p.plantName?.toLowerCase().includes(searchLower));
    }
    if (columnFilters.colPotSize) {
      const searchLower = columnFilters.colPotSize.toLowerCase();
      result = result.filter(p => String(p.potSize || '').toLowerCase().includes(searchLower));
    }
    if (columnFilters.colPlantHeight) {
      const filterVal = Number(columnFilters.colPlantHeight);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.plantHeightCm ?? 0) === filterVal);
      }
    }
    if (columnFilters.colPalletCount) {
      const filterVal = Number(columnFilters.colPalletCount);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.palletCount ?? 0) === filterVal);
      }
    }
    if (columnFilters.colUnitsPerPallet) {
      const filterVal = Number(columnFilters.colUnitsPerPallet);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.unitsPerPallet ?? 0) === filterVal);
      }
    }
    if (columnFilters.colTotalUnits) {
      const filterVal = Number(columnFilters.colTotalUnits);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.totalUnits ?? 0) === filterVal);
      }
    }
    if (columnFilters.colTotalSold) {
      const filterVal = Number(columnFilters.colTotalSold);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.totalSold ?? 0) === filterVal);
      }
    }
    if (columnFilters.colPurchasePrice) {
      const filterVal = Number(columnFilters.colPurchasePrice);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.purchasePricePln ?? 0) === filterVal);
      }
    }
    if (columnFilters.colPricePlus) {
      const filterVal = Number(columnFilters.colPricePlus);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.pricePlus ?? 0) === filterVal);
      }
    }
    if (columnFilters.colBasePrice) {
      const filterVal = Number(columnFilters.colBasePrice);
      if (!isNaN(filterVal)) {
        result = result.filter(p => Number(p.basePriceGross ?? 0) === filterVal);
      }
    }
    if (columnFilters.colVisible) {
      const isVisible = columnFilters.colVisible === 'true';
      result = result.filter(p => p.visibleInShop === isVisible);
    }
    if (columnFilters.colGrower) {
      const searchLower = columnFilters.colGrower.toLowerCase();
      result = result.filter(p => 
        String(p.grower || '').toLowerCase().includes(searchLower)
      );
    }
    if (columnFilters.colPassport) {
      const searchLower = columnFilters.colPassport.toLowerCase();
      result = result.filter(p => String(p.growerPassport || '').toLowerCase().includes(searchLower));
    }

    // Column date range filter
    if (columnFilters.colCreatedAtFrom) {
      const fromDate = new Date(columnFilters.colCreatedAtFrom);
      fromDate.setHours(0, 0, 0, 0);
      result = result.filter(p => new Date(p.createdAt) >= fromDate);
    }
    if (columnFilters.colCreatedAtTo) {
      const toDate = new Date(columnFilters.colCreatedAtTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(p => new Date(p.createdAt) <= toDate);
    }

    // Column tag filter
    if (columnFilters.colTags) {
      const selectedTags = columnFilters.colTags.split(',').filter(Boolean);
      if (selectedTags.length > 0) {
        result = result.filter(p => {
          const productTags = p.tags || [];
          return selectedTags.some(tag => productTags.includes(tag));
        });
      }
    }

    const sortField = filters.sortBy || 'plant_name';
    const sortOrder = filters.sortOrder || 'ASC';
    const sortMultiplier = sortOrder === 'ASC' ? 1 : -1;

    result.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'plant_name':
          aVal = String(a.plantName || '').toLowerCase();
          bVal = String(b.plantName || '').toLowerCase();
          break;
        case 'grower':
          aVal = String(a.grower || '').toLowerCase();
          bVal = String(b.grower || '').toLowerCase();
          break;
        case 'pot_size':
          aVal = parseInt(a.potSize || '0') || 0;
          bVal = parseInt(b.potSize || '0') || 0;
          break;
        case 'base_price_gross':
          aVal = a.basePriceGross || 0;
          bVal = b.basePriceGross || 0;
          break;
        case 'total_units':
          aVal = a.totalUnits || 0;
          bVal = b.totalUnits || 0;
          break;
        case 'total_sold':
          aVal = a.totalSold || 0;
          bVal = b.totalSold || 0;
          break;
        case 'pallet_count':
          aVal = a.palletCount || 0;
          bVal = b.palletCount || 0;
          break;
        case 'units_per_pallet':
          aVal = a.unitsPerPallet || 0;
          bVal = b.unitsPerPallet || 0;
          break;
        case 'plant_height':
          aVal = a.plantHeightCm || 0;
          bVal = b.plantHeightCm || 0;
          break;
        case 'purchase_price':
          aVal = a.purchasePricePln || 0;
          bVal = b.purchasePricePln || 0;
          break;
        case 'price_plus':
          aVal = a.pricePlus || 0;
          bVal = b.pricePlus || 0;
          break;
        case 'discount_10':
          aVal = a.priceDiscount10 || 0;
          bVal = b.priceDiscount10 || 0;
          break;
        case 'discount_12':
          aVal = a.priceDiscount12 || 0;
          bVal = b.priceDiscount12 || 0;
          break;
        case 'discount_15':
          aVal = a.priceDiscount15 || 0;
          bVal = b.priceDiscount15 || 0;
          break;
        case 'discount_20':
          aVal = a.priceDiscount20 || 0;
          bVal = b.priceDiscount20 || 0;
          break;
        case 'discount_25':
          aVal = a.priceDiscount25 || 0;
          bVal = b.priceDiscount25 || 0;
          break;
        case 'auchan_8':
          aVal = a.priceAuchan8 || 0;
          bVal = b.priceAuchan8 || 0;
          break;
        case 'passport':
          aVal = String(a.growerPassport || '').toLowerCase();
          bVal = String(b.growerPassport || '').toLowerCase();
          break;
        case 'created_at':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'tags':
          aVal = (a.tags && a.tags.length > 0) ? a.tags[0].toLowerCase() : 'zzzzz';
          bVal = (b.tags && b.tags.length > 0) ? b.tags[0].toLowerCase() : 'zzzzz';
          break;
        case 'tags_count':
          aVal = a.tags ? a.tags.length : 0;
          bVal = b.tags ? b.tags.length : 0;
          break;
        case 'updated_at':
          aVal = new Date(a.updatedAt).getTime();
          bVal = new Date(b.updatedAt).getTime();
          break;
        default:
          aVal = (a.plantName || '').toLowerCase();
          bVal = (b.plantName || '').toLowerCase();
      }

      if (aVal < bVal) return -1 * sortMultiplier;
      if (aVal > bVal) return 1 * sortMultiplier;
      return 0;
    });

    return result;
  }, [allProducts, filters, columnFilters]);

  // Paginated products - show only current page
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredProducts.slice(startIndex, endIndex);
  }, [filteredProducts, currentPage, ITEMS_PER_PAGE]);

  // Total pages calculation
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, columnFilters, activeTab]);

  const handleToggleVisibility = async (productId: number) => {
    try {
      setAllProducts(prevProducts =>
        prevProducts.map(product =>
          product.id === productId
            ? { ...product, visibleInShop: !product.visibleInShop }
            : product
        )
      );
      await api.toggleProductVisibility(productId);
    } catch (error) {
      console.error('Error toggling visibility:', error);
      fetchProducts();
    }
  };

  const handleUpdateProduct = async (productId: number, field: keyof Product, value: any) => {
    try {
      const product = allProducts.find(p => p.id === productId);
      if (!product) return;

      let updateData: Partial<Product>;
      let optimisticUpdates: Partial<Product>;

      const directEditFields = [
        'totalUnits', 'basePriceGross',
        'priceDiscount10', 'priceDiscount12', 'priceDiscount15',
        'priceDiscount20', 'priceDiscount25'
      ];

      if (field === 'pricePlus' && typeof value === 'number') {
        // Tylko wysyłamy pricePlus - backend sam przeliczy pozostałe ceny
        // wedlug wzoru: basePriceGross = pricePlus * 1.08 * (1 + marza%)
        updateData = { pricePlus: value };
        optimisticUpdates = { pricePlus: value };

        setAllProducts(prevProducts =>
          prevProducts.map(p =>
            p.id === productId ? { ...p, ...optimisticUpdates } : p
          )
        );
      } else if (directEditFields.includes(field as string)) {
        updateData = { [field]: value };
        optimisticUpdates = { [field]: value };

        if (field === 'totalUnits' && typeof value === 'number') {
          const newPalletCount = Math.floor(value / product.unitsPerPallet);
          optimisticUpdates.palletCount = newPalletCount;
        }

        setAllProducts(prevProducts =>
          prevProducts.map(p =>
            p.id === productId ? { ...p, ...optimisticUpdates } : p
          )
        );
      } else {
        updateData = { [field]: value };

        setAllProducts(prevProducts =>
          prevProducts.map(p =>
            p.id === productId ? { ...p, [field]: value } : p
          )
        );
      }

      await api.updateProduct(productId, updateData as any);

      // Fetch only the updated product to get calculated values from database
      // This avoids resetting scroll position by not reloading the entire list
      try {
        const data = await api.getProduct(productId);
        setAllProducts(prevProducts =>
          prevProducts.map(p =>
            p.id === productId ? data.product : p
          )
        );
      } catch (refreshError) {
        console.error('Error fetching updated product:', refreshError);
      }
    } catch (error) {
      console.error('Error updating product:', error);
      // Revert on error - fetch only this product if possible
      try {
        const data = await api.getProduct(productId);
        setAllProducts(prevProducts =>
          prevProducts.map(p =>
            p.id === productId ? data.product : p
          )
        );
      } catch (revertError) {
        // If single product fetch fails, do full refresh as last resort
        fetchProducts();
      }
    }
  };

  const handleViewDetails = async (product: Product) => {
    try {
      const data = await api.getProduct(product.id);
      setSelectedProduct(data.product);
      setMovements(data.movements);
    } catch (error) {
      console.error('Error fetching product details:', error);
    }
  };

  const handleCloseDetails = () => {
    setSelectedProduct(null);
    setMovements([]);
  };

  const handleCreateProduct = async (data: Partial<Product>) => {
    try {
      const result = await api.createProduct(data);
      await fetchProducts();
      setShowAddForm(false);
      setEditingProduct(null);
      return { productId: result.productId };
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  };

  const handleDuplicateProduct = async (product: Product) => {
    const duplicateData: Partial<Product> = {
      plantName: `${product.plantName} (kopia)`,
      potSize: product.potSize,
      plantHeightCm: product.plantHeightCm,
      palletCount: product.palletCount,
      unitsPerPallet: product.unitsPerPallet,
      totalUnits: product.totalUnits,
      purchasePricePln: product.purchasePricePln,
      pricePlus: product.pricePlus,
      basePriceGross: product.basePriceGross,
      priceDiscount10: product.priceDiscount10,
      priceDiscount12: product.priceDiscount12,
      priceDiscount15: product.priceDiscount15,
      priceDiscount20: product.priceDiscount20,
      priceDiscount25: product.priceDiscount25,
      vatRate: product.vatRate,
      grower: product.grower,
      growerPassport: product.growerPassport,
      visibleInShop: false,
      inventoryStatus: product.inventoryStatus,
    };

    setEditingProduct(duplicateData as Product);
    setShowAddForm(true);
  };

  const handleShowBarcode = (product: Product) => {
    setBarcodeProduct(product);
  };

  const handleSaveBarcode = async (productId: number, barcode: string) => {
    try {
      await api.updateProduct(productId, { barcode } as any);
      await fetchProducts();
    } catch (error) {
      console.error('Error saving barcode:', error);
      throw error;
    }
  };

  const handleSelectProduct = (productId: number) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  const handleBatchPrint = () => {
    setShowBatchBarcodeModal(true);
  };

  const getSelectedProductsData = () => {
    return allProducts.filter(p => selectedProducts.includes(p.id));
  };


  const handleDeleteProduct = (product: Product) => {
    setProductToDelete(product);
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedProducts.length === 0) return;

    try {
      setBulkDeleting(true);
      let deleted = 0;
      let failed = 0;

      for (const productId of selectedProducts) {
        try {
          await api.deleteProduct(productId);
          deleted++;
        } catch (error) {
          failed++;
          console.error(`Failed to delete product ${productId}:`, error);
        }
      }

      setAllProducts(prevProducts =>
        prevProducts.filter(p => !selectedProducts.includes(p.id) || failed > 0)
      );

      await fetchProducts();

      setSelectedProducts([]);
      setShowBulkDeleteConfirm(false);

      if (failed > 0) {
        alert(`Usunięto ${deleted} produktów. ${failed} produktów nie udało się usunąć (mogą być używane w zamówieniach).`);
      }
    } catch (error) {
      console.error('Error during bulk delete:', error);
      alert('Wystąpił błąd podczas usuwania produktów.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkVisibilityChange = async (visible: boolean) => {
    if (selectedProducts.length === 0) return;

    try {
      setBulkActionInProgress(true);

      for (const productId of selectedProducts) {
        const product = allProducts.find(p => p.id === productId);
        if (product && product.visibleInShop !== visible) {
          await api.updateProduct(productId, { visibleInShop: visible } as any);
        }
      }

      setAllProducts(prevProducts =>
        prevProducts.map(p =>
          selectedProducts.includes(p.id) ? { ...p, visibleInShop: visible } : p
        )
      );

      setSelectedProducts([]);
    } catch (error) {
      console.error('Error during bulk visibility change:', error);
      alert('Wystąpił błąd podczas zmiany widoczności.');
      fetchProducts();
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      setDeleting(true);
      await api.deleteProduct(productToDelete.id);
      setAllProducts(prevProducts =>
        prevProducts.filter(p => p.id !== productToDelete.id)
      );
      setSelectedProducts(prev =>
        prev.filter(id => id !== productToDelete.id)
      );
      setProductToDelete(null);
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Nie udało się usunąć produktu. Sprawdź czy nie jest używany w zamówieniach.');
    } finally {
      setDeleting(false);
    }
  };

  const handleArchiveProduct = async (product: Product) => {
    try {
      await api.archiveProduct(product.id);
      await fetchProducts();
    } catch (error) {
      console.error('Error archiving product:', error);
      alert('Nie udało się zarchiwizować produktu.');
    }
  };

  const handleRestoreProduct = async (product: Product) => {
    try {
      await api.restoreProduct(product.id);
      await fetchProducts();
    } catch (error) {
      console.error('Error restoring product:', error);
      alert('Nie udało się przywrócić produktu.');
    }
  };

  const handleSubmitLoss = async () => {
    if (!lossProduct) return;
    const qty = parseInt(lossQuantity);
    if (!qty || qty <= 0) {
      alert('Podaj prawidłową ilość');
      return;
    }
    try {
      setSubmittingLoss(true);
      await api.createLoss({
        productId: lossProduct.id,
        quantity: qty,
        notes: lossNotes || undefined,
      });
      setLossProduct(null);
      setLossQuantity('');
      setLossNotes('');
      await fetchProducts();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Błąd podczas rejestrowania straty');
    } finally {
      setSubmittingLoss(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedProducts.length === 0) return;

    try {
      setBulkActionInProgress(true);
      for (const productId of selectedProducts) {
        await api.archiveProduct(productId);
      }
      setSelectedProducts([]);
      await fetchProducts();
    } catch (error) {
      console.error('Error during bulk archive:', error);
      alert('Wystąpił błąd podczas archiwizacji.');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedProducts.length === 0) return;

    try {
      setBulkActionInProgress(true);
      for (const productId of selectedProducts) {
        await api.restoreProduct(productId);
      }
      setSelectedProducts([]);
      await fetchProducts();
    } catch (error) {
      console.error('Error during bulk restore:', error);
      alert('Wystąpił błąd podczas przywracania.');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const handleBulkUpdateTags = async (tags: string[], mode: "add" | "replace" | "remove") => {
    if (selectedProducts.length === 0) return;

    try {
      setBulkActionInProgress(true);
      const result = await api.bulkUpdateTags(selectedProducts, tags, mode);
      if (result.success) {
        setSelectedProducts([]);
        await fetchProducts();
        alert(result.message);
      }
    } catch (error) {
      console.error("Error during bulk tags update:", error);
      alert("Wystąpił błąd podczas aktualizacji tagów.");
    } finally {
      setBulkActionInProgress(false);
    }
  };

  // Handle quick add to order from distribution panel
  const handleAddToOrder = async (product: Product, quantity: number, customerId: number) => {
    try {
      await api.createOrder({
        customerId,
        items: [{ productId: product.id, quantity }],
        customerNotes: `Szybkie zamówienie z magazynu`
      });
      // Refresh products to update stock
      await fetchProducts();
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  };

  // Handle adding product to existing order
  const handleAddToExistingOrder = async (product: Product, quantity: number, orderId: number) => {
    try {
      // First get current order items
      const orderData = await api.getOrder(orderId);
      const currentItems = orderData.order.items || [];

      // Check if product already exists in order
      const existingItemIndex = currentItems.findIndex((item: any) => item.productId === product.id);

      let newItems;
      if (existingItemIndex >= 0) {
        // Update quantity of existing item
        newItems = currentItems.map((item: any, index: number) =>
          index === existingItemIndex
            ? { productId: item.productId, quantity: item.quantity + quantity }
            : { productId: item.productId, quantity: item.quantity }
        );
      } else {
        // Add new item
        newItems = [
          ...currentItems.map((item: any) => ({ productId: item.productId, quantity: item.quantity })),
          { productId: product.id, quantity }
        ];
      }

      // Update order with new items
      await api.updateOrder(orderId, { items: newItems });

      // Refresh products to update stock
      await fetchProducts();
    } catch (error) {
      console.error('Error adding to existing order:', error);
      throw error;
    }
  };

  return (
    <div className={`h-full flex flex-col ${focusedProduct && distributionPanelEnabled ? 'pb-80' : ''}`}>
      {/* Sticky Header, Tabs and Filters */}
      <div className="flex-shrink-0 z-30 bg-white px-6 pt-2 pb-2 shadow-sm border-b border-gray-100">
        {/* Header */}
        <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Magazyn</h1>
          <p className="text-xs text-gray-500">
            {filteredProducts.length} z {allProducts.length} produktów
            {totalPages > 1 && ` (strona ${currentPage} z ${totalPages})`}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Toggle dla panelu dystrybucji */}
          <label className="flex items-center gap-2 cursor-pointer bg-gray-100 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors">
            <span className="text-sm text-gray-700">Panel dystrybucji</span>
            <button
              onClick={() => setDistributionPanelEnabled(!distributionPanelEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                distributionPanelEnabled ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  distributionPanelEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
          {selectedProducts.length > 0 && (
            <button
              className="btn btn-secondary flex items-center gap-2"
              onClick={handleBatchPrint}
            >
              <span>🖨️</span>
              Drukuj kody ({selectedProducts.length})
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm flex items-center gap-1"
            onClick={() => setShowColumnConfig(true)}
            title="Konfiguracja kolumn"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Kolumny
          </button>
          {/* Dropdown Więcej akcji */}
          <div className="relative">
            <button
              className="btn btn-secondary btn-sm flex items-center gap-1"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              onBlur={() => setTimeout(() => setShowMoreMenu(false), 150)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              Więcej
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${showMoreMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => { setShowSimilarProductsModal(true); setShowMoreMenu(false); }}
                >
                  Połącz podobne
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => { setShowImportModal(true); setShowMoreMenu(false); }}
                >
                  Import CSV
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => { setShowExcelImportModal(true); setShowMoreMenu(false); }}
                >
                  Import Excel
                </button>
                <hr className="my-1 border-gray-200" />
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-green-50 text-green-700 flex items-center gap-2 font-medium"
                  onClick={() => { setShowExcelExportModal(true); setShowMoreMenu(false); }}
                >
                  📥 Eksport oferty (Excel)
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setEditingProduct(null);
              setShowAddForm(true);
            }}
          >
            + Dodaj roślinę
          </button>
        </div>
        </div>

        {/* Tabs for Active/Archived/All */}
        <div className="border-b border-gray-200 mt-2">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('active')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'active'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Aktywne produkty
            <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${
              activeTab === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-900'
            }`}>
              {counts.active}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'archived'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Archiwum
            <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${
              activeTab === 'archived' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-900'
            }`}>
              {counts.archived}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Wszystko
            <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${
              activeTab === 'all' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-900'
            }`}>
              {counts.active + counts.archived}
            </span>
          </button>
        </nav>
      </div>

        {/* Filters */}
        <InventoryFilters
          filters={filters}
          onChange={setFilters}
        />
      </div>

      {/* Selection info bar with bulk actions */}
      {selectedProducts.length > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3">
          <div className="flex justify-between items-center">
            <span className="text-primary-800">
              Zaznaczono <strong>{selectedProducts.length}</strong> z {filteredProducts.length} produktów
            </span>
            <button
              onClick={() => setSelectedProducts([])}
              className="text-primary-600 hover:text-primary-800 text-sm font-medium"
            >
              Odznacz wszystkie
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-primary-200">
            <span className="text-sm text-primary-700 font-medium mr-2 self-center">Akcje masowe:</span>

            <button
              onClick={handleBatchPrint}
              disabled={bulkActionInProgress}
              className="btn btn-secondary text-sm py-1 px-3 flex items-center gap-1"
            >
              🖨️ Drukuj kody
            </button>

            <button
              onClick={() => handleBulkVisibilityChange(true)}
              disabled={bulkActionInProgress}
              className="btn btn-secondary text-sm py-1 px-3 flex items-center gap-1 bg-green-100 hover:bg-green-200 text-green-800 border-green-300"
            >
              👁️ Pokaż w sklepie
            </button>

            <button
              onClick={() => handleBulkVisibilityChange(false)}
              disabled={bulkActionInProgress}
              className="btn btn-secondary text-sm py-1 px-3 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300"
            >
              🙈 Ukryj w sklepie
            </button>

            {activeTab !== 'archived' && (
              <button
                onClick={handleBulkArchive}
                disabled={bulkActionInProgress}
                className="btn text-sm py-1 px-3 flex items-center gap-1 bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300"
              >
                📦 Archiwizuj zaznaczone
              </button>
            )}
            {activeTab !== 'active' && (
              <button
                onClick={handleBulkRestore}
                disabled={bulkActionInProgress}
                className="btn text-sm py-1 px-3 flex items-center gap-1 bg-green-100 hover:bg-green-200 text-green-800 border border-green-300"
              >
                ♻️ Przywróć zaznaczone
              </button>
            )}


            <button
              onClick={() => setShowBulkTagsModal(true)}
              disabled={bulkActionInProgress}
              className="btn text-sm py-1 px-3 flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300"
            >
              🏷️ Tagi
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkActionInProgress}
              className="btn text-sm py-1 px-3 flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300"
            >
              🗑️ Usuń zaznaczone
            </button>

            {bulkActionInProgress && (
              <span className="text-sm text-primary-600 self-center ml-2">
                Przetwarzanie...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Products Table - Scrollable Area */}
      <div className="flex-1 overflow-auto min-h-0 px-6">
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Ładowanie...</p>
        </div>
      ) : (
        <InventoryTable
          products={paginatedProducts}
          selectedProducts={selectedProducts}
          onToggleVisibility={handleToggleVisibility}
          onViewDetails={handleViewDetails}
          onUpdateProduct={handleUpdateProduct}
          onShowBarcode={handleShowBarcode}
          onSelectProduct={handleSelectProduct}
          onSelectAll={handleSelectAll}
          onDeleteProduct={handleDeleteProduct}
          onDuplicateProduct={handleDuplicateProduct}
          onArchiveProduct={handleArchiveProduct}
          onReportLoss={(product) => setLossProduct(product)}
          onRestoreProduct={handleRestoreProduct}
          onProductFocused={distributionPanelEnabled ? setFocusedProduct : undefined}
          isArchiveView={activeTab === 'archived'}
          columnFilters={columnFilters}
          onColumnFilterChange={handleColumnFilterChange}
          sortBy={filters.sortBy}
          sortOrder={filters.sortOrder as 'ASC' | 'DESC'}
          onSort={handleSort}
          visibleColumns={filteredVisibleColumns}
          isAdmin={isAdmin}
        />
      )}

      </div>

      {/* Pagination Controls - Fixed at bottom */}
      {!loading && totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between mx-6 px-4 py-3 bg-white border-t border-gray-200 rounded-b-lg">
          <div className="text-sm text-gray-700">
            Pokazuję {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} z {filteredProducts.length} produktów
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              « Pierwsza
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ‹ Poprzednia
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // Show first, last, current, and pages around current
                  return page === 1 ||
                         page === totalPages ||
                         Math.abs(page - currentPage) <= 1;
                })
                .map((page, idx, arr) => (
                  <span key={page} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== page - 1 && (
                      <span className="px-1 text-gray-400">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                        page === currentPage
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  </span>
                ))
              }
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Następna ›
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ostatnia »
            </button>
          </div>
        </div>
      )}

      {/* Product Distribution Panel - tylko gdy włączony */}
      {distributionPanelEnabled && (
        <ProductDistributionPanel
          product={focusedProduct}
          onClose={() => setFocusedProduct(null)}
          onAddToOrder={handleAddToOrder}
          onAddToExistingOrder={handleAddToExistingOrder}
        />
      )}

      {/* Product Details Modal */}
      {selectedProduct && (
        <ProductDetails
          product={selectedProduct}
          movements={movements}
          onClose={handleCloseDetails}
          
          onImageUpdated={(productId, imageUrl) => {
            setAllProducts(prevProducts =>
              prevProducts.map(product =>
                product.id === productId ? { ...product, imageUrl: imageUrl || undefined } : product
              )
            );
            if (selectedProduct && selectedProduct.id === productId) {
              setSelectedProduct(prev => prev ? { ...prev, imageUrl: imageUrl || undefined } : null);
            }
          }}
          onUpdateProduct={async (productId, field, value) => {
            await handleUpdateProduct(productId, field, value);
            // Refresh selected product data after update
            try {
              const data = await api.getProduct(productId);
              setSelectedProduct(data.product);
            } catch (error) {
              console.error("Error refreshing product details:", error);
            }
          }}
        />
      )}

      {/* Add Product Form */}
      {showAddForm && (
        <ProductForm
          onClose={() => {
            setShowAddForm(false);
            setEditingProduct(null);
          }}
          onSubmit={handleCreateProduct}
          initialData={editingProduct || undefined}
          isAdmin={isAdmin}
        />
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <CSVImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            fetchProducts();
            setShowImportModal(false);
          }}
        />
      )}

      {/* Excel Import Modal */}
      {showExcelImportModal && (
        <ExcelImportModal
          onClose={() => setShowExcelImportModal(false)}
          onSuccess={() => {
            fetchProducts();
            setShowExcelImportModal(false);
          }}
        />
      )}

      {/* Excel Export Modal */}
      <ExcelExportModal
        isOpen={showExcelExportModal}
        onClose={() => setShowExcelExportModal(false)}
        products={filteredProducts}
      />

      {/* Barcode Modal */}
      {barcodeProduct && (
        <BarcodeModal
          product={barcodeProduct}
          onClose={() => setBarcodeProduct(null)}
          onGenerate={handleSaveBarcode}
        />
      )}

      {/* Batch Barcode Modal */}
      {showBatchBarcodeModal && (
        <BatchBarcodeModal
          products={getSelectedProductsData()}
          onClose={() => setShowBatchBarcodeModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Potwierdź usunięcie
            </h3>
            <p className="text-gray-600 mb-2">
              Czy na pewno chcesz usunąć produkt:
            </p>
            <p className="font-medium text-gray-900 mb-4">
              "{productToDelete.plantName}"
            </p>
            <p className="text-sm text-red-600 mb-6">
              Ta operacja jest nieodwracalna. Produkt zostanie trwale usunięty z magazynu.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setProductToDelete(null)}
                disabled={deleting}
                className="btn btn-secondary"
              >
                Anuluj
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="btn bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
              >
                {deleting ? 'Usuwanie...' : 'Usuń produkt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Potwierdź masowe usuwanie
            </h3>
            <p className="text-gray-600 mb-2">
              Czy na pewno chcesz usunąć <strong>{selectedProducts.length}</strong> {selectedProducts.length === 1 ? 'produkt' : (selectedProducts.length < 5 ? 'produkty' : 'produktów')}?
            </p>
            <p className="text-sm text-red-600 mb-6">
              Ta operacja jest nieodwracalna. Wszystkie zaznaczone produkty zostaną trwale usunięte z magazynu.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="btn btn-secondary"
              >
                Anuluj
              </button>
              <button
                onClick={confirmBulkDelete}
                disabled={bulkDeleting}
                className="btn bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
              >
                {bulkDeleting ? 'Usuwanie...' : `Usuń ${selectedProducts.length} produktów`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Similar Products Modal */}
      <SimilarProductsModal
        isOpen={showSimilarProductsModal}
        onClose={() => setShowSimilarProductsModal(false)}
        onMergeComplete={fetchProducts}
      />

      {/* Bulk Tags Modal */}
      {showBulkTagsModal && (
        <BulkTagsModal
          selectedCount={selectedProducts.length}
          onClose={() => setShowBulkTagsModal(false)}
          onSubmit={handleBulkUpdateTags}
        />
      )}

      {/* Loss Modal */}
      {lossProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Zglos strate</h2>
              <button onClick={() => setLossProduct(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <div className="mb-4 p-3 bg-blue-50 rounded-md">
              <div className="font-medium">{lossProduct.plantName}</div>
              <div className="text-sm text-gray-600">{lossProduct.potSize} | Kod: {lossProduct.barcode}</div>
              <div className="text-sm text-gray-600">Stan: {lossProduct.totalUnits || 0} szt.</div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ilość (sztuk)</label>
              <input
                type="number"
                min="1"
                max={lossProduct.totalUnits || 0}
                value={lossQuantity}
                onChange={(e) => setLossQuantity(e.target.value)}
                placeholder="Podaj ilość"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notatki (opcjonalnie)</label>
              <textarea
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                placeholder="Dodatkowe informacje..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setLossProduct(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Anuluj
              </button>
              <button
                onClick={handleSubmitLoss}
                disabled={submittingLoss || !lossQuantity}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {submittingLoss ? 'Zapisywanie...' : 'Zglos strate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Config Modal */}
      {showColumnConfig && (
        <ColumnConfigModal
          isOpen={showColumnConfig}
          onClose={() => setShowColumnConfig(false)}
          visibleColumns={filteredVisibleColumns}
          columnOrder={columnOrder}
          onReorder={reorderColumns}
          onToggleVisibility={toggleColumnVisibility}
          onReset={resetToDefaults}
          hiddenColumns={isAdmin ? [] : ['purchasePrice', 'pricePlus']}
        />
      )}
    </div>
  );
}
