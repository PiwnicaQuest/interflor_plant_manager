import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API } from '../../services/api';
import type { OrderWithItems, Product, OrderStatus } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Oczekujace',
  in_progress: 'W realizacji',
  ready_for_pickup: 'Do odbioru',
  completed: 'Zakonczone',
  cancelled: 'Anulowane',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
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
  in_progress: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
  pending: ['in_progress', 'cancelled'],
  in_progress: ['ready_for_pickup', 'pending', 'cancelled'],
  ready_for_pickup: ['completed', 'in_progress', 'cancelled'],
  completed: [], // Cannot change from completed
  cancelled: [], // Cannot change from cancelled
};

interface EditedItem {
  productId: number;
  palletCount: number;
  unitsPerPallet: number;
  productName: string;
  unitPrice: number;
  imageUrl?: string;
}

export function ScannerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<EditedItem[]>([]);

  // Status change
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // Image preview modal
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  // Scanning in edit mode
  const [scanInput, setScanInput] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [lastAddedProduct, setLastAddedProduct] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) {
      loadOrder();
    }
  }, [id]);

  // Focus scan input when entering edit mode
  useEffect(() => {
    if (editMode && scanInputRef.current) {
      scanInputRef.current.focus();
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
      setEditedItems(result.order.items.map(item => {
        const unitsPerPallet = item.unitsPerPallet || item.productSnapshot?.unitsPerPallet || 1;
        const palletCount = item.palletCount || Math.ceil(item.quantity / unitsPerPallet);
        return {
          productId: item.productId ?? 0,
          palletCount,
          unitsPerPallet,
          productName: item.productSnapshot?.plantName || item.productName || 'Produkt',
          unitPrice: item.unitPriceGross || 0,
          imageUrl: item.productSnapshot?.imageUrl,
        };
      }));
    } catch (err: any) {
      setError('Nie udalo sie pobrac zamowienia');
    } finally {
      setLoading(false);
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
      scanInputRef.current?.focus();
    }
  };

  const handleAddProduct = (product: Product) => {
    const existingIndex = editedItems.findIndex(item => item.productId === product.id);
    if (existingIndex >= 0) {
      // Increase pallet count
      const newItems = [...editedItems];
      newItems[existingIndex].palletCount += 1;
      setEditedItems(newItems);
    } else {
      // Add new
      setEditedItems([...editedItems, {
        productId: product.id,
        palletCount: 1,
        unitsPerPallet: product.unitsPerPallet || 1,
        productName: product.plantName,
        unitPrice: product.basePriceGross || 0,
        imageUrl: product.imageUrl,
      }]);
    }
  };

  const handlePalletCountChange = (index: number, value: string) => {
    const newItems = [...editedItems];
    const newCount = parseInt(value) || 0;
    if (newCount >= 0) {
      newItems[index].palletCount = newCount;
      setEditedItems(newItems);
    }
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...editedItems];
    newItems.splice(index, 1);
    setEditedItems(newItems);
  };

  // Calculate total units for an item
  const getItemUnits = (item: EditedItem) => item.palletCount * item.unitsPerPallet;

  // Calculate pallet price
  const getPalletPrice = (item: EditedItem) => item.unitPrice * item.unitsPerPallet;

  // Calculate item total
  const getItemTotal = (item: EditedItem) => getPalletPrice(item) * item.palletCount;

  const handleSave = async () => {
    if (!order) return;

    setSaving(true);
    setError(null);
    try {
      await API.updateOrder(order.id, {
        items: editedItems.map(item => ({
          productId: item.productId ?? 0,
          quantity: getItemUnits(item), // Send total units
          palletCount: item.palletCount,
          unitsPerPallet: item.unitsPerPallet,
        })),
      });
      await loadOrder();
      setEditMode(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udalo sie zapisac zmian');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!order) return;
    setEditedItems(order.items.map(item => {
      const unitsPerPallet = item.unitsPerPallet || item.productSnapshot?.unitsPerPallet || 1;
      const palletCount = item.palletCount || Math.ceil(item.quantity / unitsPerPallet);
      return {
        productId: item.productId ?? 0,
        palletCount,
        unitsPerPallet,
        productName: item.productSnapshot?.plantName || item.productName || 'Produkt',
        unitPrice: item.unitPriceGross || 0,
        imageUrl: item.productSnapshot?.imageUrl,
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
      setError(err.response?.data?.error || 'Nie udalo sie zmienic statusu');
    } finally {
      setChangingStatus(false);
    }
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-3">
        <div className="text-red-500 mb-3 text-sm">{error}</div>
        <button
          onClick={() => navigate('/scanner/orders')}
          className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm"
        >
          Wroc do listy
        </button>
      </div>
    );
  }

  if (!order) return null;

  const isEditable = order.status === 'pending' || order.status === 'in_progress';
  const availableTransitions = STATUS_TRANSITIONS[order.status] || [];
  const canChangeStatus = availableTransitions.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header - Compact */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/scanner/orders')}
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
          <p className="text-xs font-medium text-gray-700 mt-1 ml-7">{order.customerName}</p>
        )}
      </div>

      {/* Scan Input - Compact */}
      {editMode && (
        <div className="bg-green-50 border-b border-green-200 px-3 py-2">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <input
              ref={scanInputRef}
              type="text"
              inputMode="none"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleScanInput}
              placeholder="Skanuj kod kreskowy..."
              className="w-full pl-10 pr-10 py-2.5 text-base border border-green-300 rounded-lg bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
              autoComplete="off"
              autoFocus
            />
            {scanLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600" />
              </div>
            )}
          </div>

          {/* Success message - Compact */}
          {lastAddedProduct && (
            <div className="mt-1.5 flex items-center gap-1.5 text-green-700 bg-green-100 px-2 py-1 rounded text-sm animate-pulse">
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
                    status === 'in_progress' ? 'bg-blue-500 text-white hover:bg-blue-600' :
                    status === 'ready_for_pickup' ? 'bg-purple-500 text-white hover:bg-purple-600' :
                    status === 'completed' ? 'bg-green-500 text-white hover:bg-green-600' :
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
                className="text-xs text-green-600 font-medium"
              >
                Edytuj
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            {editedItems.map((item, index) => (
              <div key={item.productId} className="px-3 py-2">
                <div className="flex gap-3">
                  {/* Image thumbnail */}
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

                  {/* Item details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{item.productName}</div>
                        <div className="text-xs text-gray-500">
                          {getPalletPrice(item).toFixed(2)} PLN/pal. ({item.unitsPerPallet} szt.)
                        </div>
                      </div>

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
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={item.palletCount}
                            onChange={(e) => handlePalletCountChange(index, e.target.value)}
                            className="w-16 h-9 text-center text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                          <span className="text-sm text-gray-500">pal.</span>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold text-green-600">
                            {getItemTotal(item).toFixed(2)} PLN
                          </div>
                          <div className="text-xs text-gray-500">
                            {getItemUnits(item)} szt.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-gray-600">
                          <span className="font-semibold">{item.palletCount}</span> pal. x {item.unitsPerPallet} = <span className="font-semibold">{getItemUnits(item)}</span> szt.
                        </div>
                        <div className="text-sm font-bold text-green-600">
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
                <p className="text-sm">Skanuj produkty aby dodac do zamowienia</p>
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
              <span className="text-lg font-bold text-green-600">{calculateTotal().toFixed(2)} PLN</span>
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
              className="flex-1 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center text-sm"
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
                  onClick={() => handleStatusChange(status as OrderStatus)}
                  disabled={changingStatus}
                  className={`w-full p-2.5 rounded-lg text-left flex items-center gap-2 transition-colors ${
                    status === 'cancelled'
                      ? 'bg-red-50 hover:bg-red-100 border border-red-200'
                      : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                  } disabled:opacity-50`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                    status === 'ready_for_pickup' ? 'bg-purple-100 text-purple-600' :
                    status === 'completed' ? 'bg-green-100 text-green-600' :
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
                      {status === 'in_progress' && 'Zamowienie jest przygotowywane'}
                      {status === 'ready_for_pickup' && 'Zamowienie czeka na odbior'}
                      {status === 'completed' && 'Zamowienie zostalo odebrane'}
                      {status === 'pending' && 'Przywroc do oczekujacych'}
                      {status === 'cancelled' && 'Anuluj zamowienie'}
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
    </div>
  );
}
