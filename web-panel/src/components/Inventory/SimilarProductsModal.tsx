import { useState, useEffect, useMemo } from 'react';
import { Product, MergeHistoryEntry } from '../../types';
import { API } from '../../services/api';

interface SimilarProductsGroup {
  products: Product[];
  matchCriteria: {
    plantName: string;
    potSize: string;
    heightRange: { min: number; max: number };
    unitsPerPallet?: number;
  };
}

interface SimilarProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMergeComplete?: () => void;
}

type TabType = 'groups' | 'history';

export function SimilarProductsModal({ isOpen, onClose, onMergeComplete }: SimilarProductsModalProps) {
  const [groups, setGroups] = useState<SimilarProductsGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('groups');
  
  // Selection state for individual products
  const [selectedProducts, setSelectedProducts] = useState<Map<number, Set<number>>>(new Map()); // groupIndex -> Set of productIds
  const [selectedMasters, setSelectedMasters] = useState<Map<number, number>>(new Map()); // groupIndex -> masterId
  
  // Groups selected for bulk merge
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewGroupIndex, setPreviewGroupIndex] = useState<number | null>(null);
  
  // History state
  const [history, setHistory] = useState<MergeHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadGroups();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeTab === 'history' && history.length === 0) {
      loadHistory();
    }
  }, [activeTab]);

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await API.getSimilarProducts();
      setGroups(data.groups || []);
      // Initialize selection - select all products in each group by default
      const newSelection = new Map<number, Set<number>>();
      const newMasters = new Map<number, number>();
      data.groups?.forEach((group: SimilarProductsGroup, index: number) => {
        const productIds = new Set(group.products.map(p => p.id));
        newSelection.set(index, productIds);
        // Default master: highest price
        const master = group.products.reduce((best, p) => 
          (p.basePriceGross || 0) > (best.basePriceGross || 0) ? p : best
        , group.products[0]);
        newMasters.set(index, master.id);
      });
      setSelectedProducts(newSelection);
      setSelectedMasters(newMasters);
      setSelectedGroups(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udalo sie zaladowac produktow podobnych');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await API.getMergeHistory(50);
      setHistory(data.history || []);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleProductSelection = (groupIndex: number, productId: number) => {
    setSelectedProducts(prev => {
      const newMap = new Map(prev);
      const groupSelection = new Set(newMap.get(groupIndex) || []);
      if (groupSelection.has(productId)) {
        groupSelection.delete(productId);
        // If we're removing the master, select a new one
        if (selectedMasters.get(groupIndex) === productId) {
          const remaining = Array.from(groupSelection);
          if (remaining.length > 0) {
            setSelectedMasters(m => new Map(m).set(groupIndex, remaining[0]));
          }
        }
      } else {
        groupSelection.add(productId);
      }
      newMap.set(groupIndex, groupSelection);
      return newMap;
    });
  };

  const toggleSelectAll = (groupIndex: number) => {
    const group = groups[groupIndex];
    const currentSelection = selectedProducts.get(groupIndex) || new Set();
    const allSelected = currentSelection.size === group.products.length;
    
    setSelectedProducts(prev => {
      const newMap = new Map(prev);
      if (allSelected) {
        // Deselect all except master
        const masterId = selectedMasters.get(groupIndex);
        newMap.set(groupIndex, masterId ? new Set([masterId]) : new Set());
      } else {
        // Select all
        newMap.set(groupIndex, new Set(group.products.map(p => p.id)));
      }
      return newMap;
    });
  };

  const setMasterProduct = (groupIndex: number, productId: number) => {
    setSelectedMasters(prev => new Map(prev).set(groupIndex, productId));
    // Ensure master is selected
    setSelectedProducts(prev => {
      const newMap = new Map(prev);
      const groupSelection = new Set(newMap.get(groupIndex) || []);
      groupSelection.add(productId);
      newMap.set(groupIndex, groupSelection);
      return newMap;
    });
  };

  const toggleGroupForBulkMerge = (groupIndex: number) => {
    setSelectedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupIndex)) {
        newSet.delete(groupIndex);
      } else {
        newSet.add(groupIndex);
      }
      return newSet;
    });
  };

  const getPreviewData = (groupIndex: number) => {
    const group = groups[groupIndex];
    const selection = selectedProducts.get(groupIndex) || new Set();
    const masterId = selectedMasters.get(groupIndex);
    
    if (!masterId || selection.size < 2) return null;
    
    const master = group.products.find(p => p.id === masterId);
    const toMerge = group.products.filter(p => selection.has(p.id) && p.id !== masterId);
    
    if (!master || toMerge.length === 0) return null;
    
    const totalPallets = (master.palletCount || 0) + toMerge.reduce((sum, p) => sum + (p.palletCount || 0), 0);
    const totalLooseUnits = (master.looseUnits || 0) + toMerge.reduce((sum, p) => sum + (p.looseUnits || 0), 0);
    const totalUnits = (master.totalUnits || 0) + toMerge.reduce((sum, p) => sum + (p.totalUnits || 0), 0);
    const bestPrice = Math.max(master.basePriceGross || 0, ...toMerge.map(p => p.basePriceGross || 0));
    const barcodes = [master.barcode, ...toMerge.map(p => p.barcode)].filter(Boolean) as string[];
    
    return {
      master,
      toMerge,
      result: {
        totalPallets,
        totalLooseUnits,
        totalUnits,
        bestPrice,
        barcodes,
      }
    };
  };

  const handleMergeGroup = async (groupIndex: number) => {
    const selection = selectedProducts.get(groupIndex) || new Set();
    const masterId = selectedMasters.get(groupIndex);
    
    if (!masterId || selection.size < 2) {
      setError('Wybierz co najmniej 2 produkty do polaczenia');
      return;
    }
    
    const productIds = Array.from(selection);
    
    setMerging(true);
    setError(null);
    try {
      await API.mergeProducts(masterId, productIds);
      await loadGroups();
      await loadHistory();
      setShowPreview(false);
      setPreviewGroupIndex(null);
      if (onMergeComplete) onMergeComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udalo sie polaczyc produktow');
    } finally {
      setMerging(false);
    }
  };

  const handleBulkMerge = async () => {
    if (selectedGroups.size === 0) {
      setError('Wybierz co najmniej jedna grupe do polaczenia');
      return;
    }
    
    setMerging(true);
    setError(null);
    let successCount = 0;
    let errorCount = 0;
    
    for (const groupIndex of selectedGroups) {
      const selection = selectedProducts.get(groupIndex) || new Set();
      const masterId = selectedMasters.get(groupIndex);
      
      if (!masterId || selection.size < 2) {
        errorCount++;
        continue;
      }
      
      try {
        await API.mergeProducts(masterId, Array.from(selection));
        successCount++;
      } catch (err) {
        errorCount++;
        console.error('Merge error for group', groupIndex, err);
      }
    }
    
    await loadGroups();
    await loadHistory();
    setSelectedGroups(new Set());
    setMerging(false);
    
    if (errorCount > 0) {
      setError(`Polaczono ${successCount} grup. Bledy: ${errorCount}`);
    }
    
    if (onMergeComplete) onMergeComplete();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
    }).format(price);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Laczenie podobnych produktow</h2>
            <p className="text-sm text-gray-500">
              {activeTab === 'groups' 
                ? `Znaleziono ${groups.length} grup podobnych produktow`
                : `Historia polaczen (${history.length})`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
        </div>

        {/* Tabs */}
        <div className="border-b flex">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-6 py-3 font-medium ${activeTab === 'groups' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'}`}
          >
            Grupy podobnych ({groups.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 font-medium ${activeTab === 'history' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'}`}
          >
            Historia polaczen
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'groups' && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="ml-3">Ladowanie...</span>
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Brak grup podobnych produktow do polaczenia
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Bulk merge bar */}
                  {selectedGroups.size > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
                      <span className="font-medium text-blue-800">
                        Zaznaczono {selectedGroups.size} grup do polaczenia zbiorczego
                      </span>
                      <button
                        onClick={handleBulkMerge}
                        disabled={merging}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {merging ? 'Laczenie...' : 'Polacz zaznaczone grupy'}
                      </button>
                    </div>
                  )}

                  {groups.map((group, groupIndex) => {
                    const selection = selectedProducts.get(groupIndex) || new Set();
                    const masterId = selectedMasters.get(groupIndex);
                    const canMerge = selection.size >= 2 && masterId;
                    const isGroupSelected = selectedGroups.has(groupIndex);
                    
                    return (
                      <div key={groupIndex} className={`border rounded-lg ${isGroupSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                        {/* Group header */}
                        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <input
                              type="checkbox"
                              checked={isGroupSelected}
                              onChange={() => toggleGroupForBulkMerge(groupIndex)}
                              className="w-5 h-5 text-blue-600"
                              title="Zaznacz do polaczenia zbiorczego"
                            />
                            <div>
                              <h3 className="font-bold text-lg">{group.matchCriteria.plantName}</h3>
                              <p className="text-sm text-gray-500">
                                {group.matchCriteria.potSize} | 
                                Wysokosc: {group.matchCriteria.heightRange.min}-{group.matchCriteria.heightRange.max}cm |
                                {group.matchCriteria.unitsPerPallet} szt/paleta |
                                {group.products.length} produktow
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleSelectAll(groupIndex)}
                              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded"
                            >
                              {selection.size === group.products.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                            </button>
                            <button
                              onClick={() => { setPreviewGroupIndex(groupIndex); setShowPreview(true); }}
                              disabled={!canMerge}
                              className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-100 rounded disabled:opacity-50"
                            >
                              Podglad
                            </button>
                            <button
                              onClick={() => handleMergeGroup(groupIndex)}
                              disabled={!canMerge || merging}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              Polacz ({selection.size})
                            </button>
                          </div>
                        </div>

                        {/* Products table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="p-2 text-left w-10">
                                  <span className="sr-only">Wybierz</span>
                                </th>
                                <th className="p-2 text-left w-16">Master</th>
                                <th className="p-2 text-left">Zdjecie</th>
                                <th className="p-2 text-left">ID</th>
                                <th className="p-2 text-left">Kod</th>
                                <th className="p-2 text-right">Wys.</th>
                                <th className="p-2 text-right">Palety</th>
                                <th className="p-2 text-right">Sztuki</th>
                                <th className="p-2 text-right">Cena</th>
                                <th className="p-2 text-left">Hodowca</th>
                                <th className="p-2 text-left">Data</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.products.map((product) => {
                                const isSelected = selection.has(product.id);
                                const isMaster = masterId === product.id;
                                
                                return (
                                  <tr 
                                    key={product.id} 
                                    className={`border-t hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''} ${isMaster ? 'bg-green-50' : ''}`}
                                  >
                                    <td className="p-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleProductSelection(groupIndex, product.id)}
                                        className="w-4 h-4"
                                      />
                                    </td>
                                    <td className="p-2">
                                      <button
                                        onClick={() => setMasterProduct(groupIndex, product.id)}
                                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                          isMaster 
                                            ? 'bg-green-500 border-green-500 text-white' 
                                            : 'border-gray-300 hover:border-green-400'
                                        }`}
                                        title={isMaster ? 'Produkt glowny' : 'Ustaw jako glowny'}
                                      >
                                        {isMaster && '✓'}
                                      </button>
                                    </td>
                                    <td className="p-2">
                                      {product.imageUrl ? (
                                        <img src={product.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                                      ) : (
                                        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-400">?</div>
                                      )}
                                    </td>
                                    <td className="p-2 font-mono text-xs">{product.id}</td>
                                    <td className="p-2 font-mono text-xs">{product.barcode || '-'}</td>
                                    <td className="p-2 text-right">{product.plantHeightCm || '-'}cm</td>
                                    <td className="p-2 text-right font-semibold">{product.palletCount || 0}</td>
                                    <td className="p-2 text-right">{product.totalUnits || 0}</td>
                                    <td className="p-2 text-right font-semibold">{formatPrice(product.basePriceGross || 0)}</td>
                                    <td className="p-2 text-xs">{product.grower || '-'}</td>
                                    <td className="p-2 text-xs">{product.createdAt ? new Date(product.createdAt).toLocaleDateString('pl-PL') : '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="ml-3">Ladowanie historii...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Brak historii polaczen
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold">{entry.masterPlantName || 'Produkt #' + entry.masterProductId}</h4>
                          <p className="text-sm text-gray-500">
                            {entry.masterPotSize} | Kod: {entry.masterBarcode || '-'}
                          </p>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div>{formatDate(entry.createdAt)}</div>
                          <div>{entry.mergedByEmail || 'System'}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Polaczono produktow:</span>
                          <span className="ml-2 font-semibold">{entry.mergedProductIds?.length || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Dodano palet:</span>
                          <span className="ml-2 font-semibold text-green-600">+{entry.totalPalletsAdded}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Dodano sztuk:</span>
                          <span className="ml-2 font-semibold text-green-600">+{entry.totalUnitsAdded}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Cena:</span>
                          <span className="ml-2">{formatPrice(entry.priceBefore)} → {formatPrice(entry.priceAfter)}</span>
                        </div>
                      </div>
                      {entry.mergedBarcodes && entry.mergedBarcodes.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs text-gray-500">Kody: </span>
                          <span className="text-xs font-mono">{entry.mergedBarcodes.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-between">
          <button onClick={loadGroups} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            Odswiez
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            Zamknij
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewGroupIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">Podglad polaczenia</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">x</button>
            </div>
            <div className="p-4">
              {(() => {
                const preview = getPreviewData(previewGroupIndex);
                if (!preview) return <p className="text-gray-500">Brak danych do podgladu</p>;
                
                return (
                  <div className="space-y-4">
                    {/* Master info */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-semibold text-green-800 mb-2">Produkt glowny (zachowuje dane)</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>ID: <span className="font-mono">{preview.master.id}</span></div>
                        <div>Kod: <span className="font-mono">{preview.master.barcode || '-'}</span></div>
                        <div>Palety: {preview.master.palletCount || 0}</div>
                        <div>Sztuki: {preview.master.totalUnits || 0}</div>
                        <div>Cena: {formatPrice(preview.master.basePriceGross || 0)}</div>
                      </div>
                    </div>

                    {/* Products to merge */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-semibold text-yellow-800 mb-2">Produkty do polaczenia ({preview.toMerge.length})</h4>
                      <div className="space-y-2">
                        {preview.toMerge.map(p => (
                          <div key={p.id} className="text-sm flex justify-between">
                            <span>#{p.id} ({p.barcode || 'brak kodu'})</span>
                            <span>{p.palletCount || 0} palet, {p.totalUnits || 0} szt, {formatPrice(p.basePriceGross || 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Result preview */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-800 mb-2">Wynik po polaczeniu</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Laczna liczba palet: <span className="font-bold text-blue-600">{preview.result.totalPallets}</span></div>
                        <div>Laczna liczba sztuk: <span className="font-bold text-blue-600">{preview.result.totalUnits}</span></div>
                        <div>Cena (najwyzsza): <span className="font-bold text-blue-600">{formatPrice(preview.result.bestPrice)}</span></div>
                        <div>Aktywne kody: <span className="font-bold text-blue-600">{preview.result.barcodes.length}</span></div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Kody kreskowe: {preview.result.barcodes.join(', ')}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        onClick={() => setShowPreview(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                        Anuluj
                      </button>
                      <button
                        onClick={() => { handleMergeGroup(previewGroupIndex); }}
                        disabled={merging}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {merging ? 'Laczenie...' : 'Potwierdz polaczenie'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
