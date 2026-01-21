import { useState, useEffect } from 'react';
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

// Helper: automatically select master from products
function selectMasterFromGroup(products: Product[]): { master: Product; reason: string } {
  // Priority 1: Existing master (has mergedProductIds)
  const existingMaster = products.find(p => p.mergedProductIds && p.mergedProductIds.length > 0);
  if (existingMaster) {
    return { master: existingMaster, reason: 'istniejący master (ma wcześniejsze połączenia)' };
  }

  // Priority 2: Highest stock
  const withStock = products.map(p => ({
    product: p,
    totalUnits: (p.palletCount || 0) * (p.unitsPerPallet || 1) + (p.looseUnits || 0)
  }));
  withStock.sort((a, b) => {
    if (b.totalUnits !== a.totalUnits) return b.totalUnits - a.totalUnits;
    return a.product.id - b.product.id;
  });

  return { master: withStock[0].product, reason: 'najwiekszy stan magazynowy' };
}

export function SimilarProductsModal({ isOpen, onClose, onMergeComplete }: SimilarProductsModalProps) {
  const [groups, setGroups] = useState<SimilarProductsGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('groups');
  
  // Selection state for individual products
  const [selectedProducts, setSelectedProducts] = useState<Map<number, Set<number>>>(new Map());
  
  // Groups selected for bulk merge
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  
  // Date selection per group
  const [customDates, setCustomDates] = useState<Map<number, string>>(new Map());
  const [useDateFrom, setUseDateFrom] = useState<Map<number, 'master' | 'custom' | number>>(new Map());
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewGroupIndex, setPreviewGroupIndex] = useState<number | null>(null);
  
  // History state
  const [history, setHistory] = useState<MergeHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Filters state
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchName, setSearchName] = useState<string>("");

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


  // Filtered groups based on date range and search name
  const filteredGroups = groups.map((group, originalIndex) => ({
    ...group,
    originalIndex,
    products: group.products.filter(product => {
      // Date filter
      if (dateFrom || dateTo) {
        const productDate = product.createdAt ? new Date(product.createdAt) : null;
        if (!productDate) return false;
        if (dateFrom && productDate < new Date(dateFrom)) return false;
        if (dateTo && productDate > new Date(dateTo + "T23:59:59")) return false;
      }
      // Name filter
      if (searchName) {
        
        const plantName = (product.plantName || "").toLowerCase();
        const barcode = (product.barcode || "").toLowerCase();
        const search = searchName.toLowerCase();
        if (!plantName.includes(search) && !barcode.includes(search)) return false;
      }
      return true;
    })
  })).filter(group => group.products.length >= 2);

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await API.getSimilarProducts();
      setGroups(data.groups || []);
      const newSelection = new Map<number, Set<number>>();
      const newUseDateFrom = new Map<number, 'master' | 'custom' | number>();
      
      data.groups?.forEach((group: SimilarProductsGroup, index: number) => {
        const productIds = new Set(group.products.map(p => p.id));
        newSelection.set(index, productIds);
        newUseDateFrom.set(index, 'master');
      });
      
      setSelectedProducts(newSelection);
      setSelectedGroups(new Set());
      setUseDateFrom(newUseDateFrom);
      setCustomDates(new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się załadować produktów podobnych');
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
        newMap.set(groupIndex, new Set());
      } else {
        newMap.set(groupIndex, new Set(group.products.map(p => p.id)));
      }
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

  const getMasterForGroup = (groupIndex: number) => {
    const group = groups[groupIndex];
    const selection = selectedProducts.get(groupIndex) || new Set();
    const selectedProductsList = group.products.filter(p => selection.has(p.id));
    
    if (selectedProductsList.length < 2) return null;
    
    return selectMasterFromGroup(selectedProductsList);
  };

  const getDateForMerge = (groupIndex: number): string | null => {
    const dateFrom = useDateFrom.get(groupIndex) || 'master';
    
    if (dateFrom === 'master') {
      return null;
    }
    
    if (dateFrom === 'custom') {
      return customDates.get(groupIndex) || null;
    }
    
    const group = groups[groupIndex];
    const product = group.products.find(p => p.id === dateFrom);
    return product?.createdAt ? new Date(product.createdAt).toISOString().split('T')[0] : null;
  };

  const getPreviewData = (groupIndex: number) => {
    const group = groups[groupIndex];
    const selection = selectedProducts.get(groupIndex) || new Set();
    const selectedProductsList = group.products.filter(p => selection.has(p.id));
    
    if (selectedProductsList.length < 2) return null;
    
    const { master, reason } = selectMasterFromGroup(selectedProductsList);
    const toMerge = selectedProductsList.filter(p => p.id !== master.id);
    
    const totalPallets = selectedProductsList.reduce((sum, p) => sum + (p.palletCount || 0), 0);
    const totalUnits = selectedProductsList.reduce((sum, p) => sum + ((p.palletCount || 0) * (p.unitsPerPallet || 1) + (p.looseUnits || 0)), 0);
    const bestPrice = Math.max(...selectedProductsList.map(p => p.basePriceGross || 0));
    const barcodes = selectedProductsList.map(p => p.barcode).filter(Boolean) as string[];
    
    const dateToUse = getDateForMerge(groupIndex);
    
    return {
      master,
      masterReason: reason,
      toMerge,
      dateToUse,
      result: { totalPallets, totalUnits, bestPrice, barcodes }
    };
  };

  const handleMergeGroup = async (groupIndex: number) => {
    const selection = selectedProducts.get(groupIndex) || new Set();
    
    if (selection.size < 2) {
      setError('Wybierz co najmniej 2 produkty do połączenia');
      return;
    }
    
    const productIds = Array.from(selection);
    const masterDate = getDateForMerge(groupIndex);
    
    setMerging(true);
    setError(null);
    try {
      await API.mergeProducts(productIds, masterDate);
      await loadGroups();
      await loadHistory();
      setShowPreview(false);
      setPreviewGroupIndex(null);
      if (onMergeComplete) onMergeComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się połączyć produktów');
    } finally {
      setMerging(false);
    }
  };

  const handleBulkMerge = async () => {
    if (selectedGroups.size === 0) {
      setError('Wybierz co najmniej jedna grupe do połączenia');
      return;
    }
    
    setMerging(true);
    setError(null);
    let successCount = 0;
    let errorCount = 0;
    
    for (const groupIndex of selectedGroups) {
      const selection = selectedProducts.get(groupIndex) || new Set();
      
      if (selection.size < 2) {
        errorCount++;
        continue;
      }
      
      const productIds = Array.from(selection);
      const masterDate = getDateForMerge(groupIndex);
      
      try {
        await API.mergeProducts(productIds, masterDate);
        successCount++;
      } catch (err) {
        errorCount++;
      }
    }
    
    await loadGroups();
    await loadHistory();
    setSelectedGroups(new Set());
    setMerging(false);
    
    if (errorCount > 0) {
      setError('Połączono ' + successCount + ' grup. Bledy: ' + errorCount);
    }
    
    if (onMergeComplete) onMergeComplete();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-screen overflow-hidden flex flex-col" style={{maxHeight: "90vh"}}>
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Łączenie podobnych produktów</h2>
            <p className="text-sm text-gray-500">
              {activeTab === "groups" ? (searchName || dateFrom || dateTo ? "Wyświetlono " + filteredGroups.length + " z " + groups.length + " grup" : "Znaleziono " + groups.length + " grup podobnych produktów") : "Historia polaczen (" + history.length + ")"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
        </div>

        <div className="border-b flex">
          <button onClick={() => setActiveTab("groups")} className={"px-6 py-3 font-medium " + (activeTab === "groups" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700")}>
            Grupy podobnych ({groups.length})
          </button>
          <button onClick={() => setActiveTab("history")} className={"px-6 py-3 font-medium " + (activeTab === "history" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700")}>
            Historia polaczen
          </button>
        </div>

        {error && <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

        <div className="flex-1 overflow-auto p-4">
          {activeTab === "groups" && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="ml-3">Ładowanie...</span>
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Brak grup podobnych produktów do połączenia</div>
              ) : (
                <div className="space-y-6">
                  {/* Filters */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Szukaj po nazwie</label>
                        <input
                          type="text"
                          value={searchName}
                          onChange={(e) => setSearchName(e.target.value)}
                          placeholder="Wpisz nazwe produktu..."
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data od</label>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data do</label>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      {(searchName || dateFrom || dateTo) && (
                        <button
                          onClick={() => { setSearchName(""); setDateFrom(""); setDateTo(""); }}
                          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                        >
                          Wyczyść filtry
                        </button>
                      )}
                    </div>
                    {(searchName || dateFrom || dateTo) && (
                      <div className="mt-3 pt-3 border-t text-sm text-gray-600">
                        Znaleziono <span className="font-semibold">{filteredGroups.length}</span> grup (z {groups.length}) pasujacych do filtrow
                      </div>
                    )}
                  </div>

                  {selectedGroups.size > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
                      <span className="font-medium text-blue-800">Zaznaczono {selectedGroups.size} grup do połączenia zbiorczego</span>
                      <button onClick={handleBulkMerge} disabled={merging} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {merging ? "Łączenie..." : "Połącz zaznaczone grupy"}
                      </button>
                    </div>
                  )}

                  {filteredGroups.map((group) => {
                    const groupIndex = group.originalIndex;
                    const selection = selectedProducts.get(groupIndex) || new Set();
                    const masterInfo = getMasterForGroup(groupIndex);
                    const canMerge = selection.size >= 2;
                    const isGroupSelected = selectedGroups.has(groupIndex);
                    const currentDateFrom = useDateFrom.get(groupIndex) || "master";
                    
                    return (
                      <div key={groupIndex} className={"border rounded-lg " + (isGroupSelected ? "border-blue-400 bg-blue-50" : "border-gray-200")}>
                        <div className="p-4 bg-gray-50 border-b">
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-4">
                              <input type="checkbox" checked={isGroupSelected} onChange={() => toggleGroupForBulkMerge(groupIndex)} className="w-5 h-5 text-blue-600" />
                              <div>
                                <h3 className="font-bold text-lg">{group.matchCriteria.plantName}</h3>
                                <p className="text-sm text-gray-500">
                                  {group.matchCriteria.potSize} | Wysokość: {group.matchCriteria.heightRange.min}-{group.matchCriteria.heightRange.max}cm | {group.matchCriteria.unitsPerPallet} szt/paleta | {group.products.length} produktów
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleSelectAll(groupIndex)} className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded">
                                {selection.size === group.products.length ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                              </button>
                              <button onClick={() => { setPreviewGroupIndex(groupIndex); setShowPreview(true); }} disabled={!canMerge} className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-100 rounded disabled:opacity-50">
                                Podgląd
                              </button>
                              <button onClick={() => handleMergeGroup(groupIndex)} disabled={!canMerge || merging} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                                Połącz ({selection.size})
                              </button>
                            </div>
                          </div>
                          
                          {canMerge && masterInfo && (
                            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-200">
                              <div className="bg-green-100 px-3 py-2 rounded-lg text-sm">
                                <span className="text-green-800 font-medium">Master: </span>
                                <span className="font-bold">#{masterInfo.master.id}</span>
                                <span className="text-green-600 ml-2">({masterInfo.reason})</span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-600">Data produktu:</span>
                                <select
                                  value={currentDateFrom === "master" ? "master" : currentDateFrom === "custom" ? "custom" : String(currentDateFrom)}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setUseDateFrom(prev => {
                                      const newMap = new Map(prev);
                                      if (val === "master" || val === "custom") {
                                        newMap.set(groupIndex, val);
                                      } else {
                                        newMap.set(groupIndex, parseInt(val));
                                      }
                                      return newMap;
                                    });
                                  }}
                                  className="border rounded px-2 py-1 text-sm"
                                >
                                  <option value="master">Bez zmian (data mastera)</option>
                                  {group.products.filter(p => selection.has(p.id)).map(p => (
                                    <option key={p.id} value={String(p.id)}>
                                      #{p.id}: {p.createdAt ? new Date(p.createdAt).toLocaleDateString("pl-PL") : "brak"}
                                    </option>
                                  ))}
                                  <option value="custom">Wlasna data...</option>
                                </select>
                                
                                {currentDateFrom === "custom" && (
                                  <input
                                    type="date"
                                    value={customDates.get(groupIndex) || ""}
                                    onChange={(e) => setCustomDates(prev => new Map(prev).set(groupIndex, e.target.value))}
                                    className="border rounded px-2 py-1 text-sm"
                                  />
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="p-2 text-left w-10"></th>
                                <th className="p-2 text-left">Zdjecie</th>
                                <th className="p-2 text-left">ID</th>
                                <th className="p-2 text-left">Kod</th>
                                <th className="p-2 text-right">Wys.</th>
                                <th className="p-2 text-right">Palety</th>
                                <th className="p-2 text-right">Sztuki</th>
                                <th className="p-2 text-right">Cena</th>
                                <th className="p-2 text-left">Hodowca</th>
                                <th className="p-2 text-left">Data</th>
                                <th className="p-2 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.products.map((product) => {
                                const isSelected = selection.has(product.id);
                                const isMaster = masterInfo?.master.id === product.id;
                                const isExistingMaster = product.mergedProductIds && product.mergedProductIds.length > 0;
                                const totalUnits = (product.palletCount || 0) * (product.unitsPerPallet || 1) + (product.looseUnits || 0);
                                
                                return (
                                  <tr key={product.id} className={"border-t hover:bg-gray-50 " + (isSelected ? "bg-blue-50 " : "") + (isMaster && isSelected ? "bg-green-50" : "")}>
                                    <td className="p-2">
                                      <input type="checkbox" checked={isSelected} onChange={() => toggleProductSelection(groupIndex, product.id)} className="w-4 h-4" />
                                    </td>
                                    <td className="p-2">
                                      {product.imageUrl ? (
                                        <img src={product.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                                      ) : (
                                        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-400">?</div>
                                      )}
                                    </td>
                                    <td className="p-2 font-mono text-xs">{product.id}</td>
                                    <td className="p-2 font-mono text-xs">{product.barcode || "-"}</td>
                                    <td className="p-2 text-right">{product.plantHeightCm || "-"}cm</td>
                                    <td className="p-2 text-right font-semibold">{product.palletCount || 0}</td>
                                    <td className="p-2 text-right">{totalUnits}</td>
                                    <td className="p-2 text-right font-semibold">{formatPrice(product.basePriceGross || 0)}</td>
                                    <td className="p-2 text-xs">{product.grower || "-"}</td>
                                    <td className="p-2 text-xs">{product.createdAt ? new Date(product.createdAt).toLocaleDateString("pl-PL") : "-"}</td>
                                    <td className="p-2">
                                      {isMaster && isSelected && <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">MASTER</span>}
                                      {isExistingMaster && !isMaster && <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">ma połączenia</span>}
                                    </td>
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

          {activeTab === "history" && (
            <>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="ml-3">Ładowanie historii...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Brak historii polaczen</div>
              ) : (
                <div className="space-y-4">
                  {history.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold">{entry.masterPlantName || "Produkt #" + entry.masterProductId}</h4>
                          <p className="text-sm text-gray-500">{entry.masterPotSize} | Kod: {entry.masterBarcode || "-"}</p>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div>{formatDate(entry.createdAt)}</div>
                          <div>{entry.mergedByEmail || "System"}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><span className="text-gray-500">Połączono produktów:</span><span className="ml-2 font-semibold">{entry.mergedProductIds?.length || 0}</span></div>
                        <div><span className="text-gray-500">Dodano palet:</span><span className="ml-2 font-semibold text-green-600">+{entry.totalPalletsAdded}</span></div>
                        <div><span className="text-gray-500">Dodano sztuk:</span><span className="ml-2 font-semibold text-green-600">+{entry.totalUnitsAdded}</span></div>
                        <div><span className="text-gray-500">Cena:</span><span className="ml-2">{formatPrice(entry.priceBefore)} - {formatPrice(entry.priceAfter)}</span></div>
                      </div>
                      {entry.mergedBarcodes && entry.mergedBarcodes.length > 0 && (
                        <div className="mt-2"><span className="text-xs text-gray-500">Kody: </span><span className="text-xs font-mono">{entry.mergedBarcodes.join(", ")}</span></div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t flex justify-between">
          <button onClick={loadGroups} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Odswiez</button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Zamknij</button>
        </div>
      </div>

      {showPreview && previewGroupIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-auto" style={{maxHeight: "80vh"}}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">Podgląd połączenia</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">x</button>
            </div>
            <div className="p-4">
              {(() => {
                const preview = getPreviewData(previewGroupIndex);
                if (!preview) return <p className="text-gray-500">Brak danych do podgladu</p>;
                
                return (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-semibold text-green-800 mb-2">Produkt glowny (automatycznie wybrany: {preview.masterReason})</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>ID: <span className="font-mono font-bold">{preview.master.id}</span></div>
                        <div>Kod: <span className="font-mono">{preview.master.barcode || "-"}</span></div>
                        <div>Palety: {preview.master.palletCount || 0}</div>
                        <div>Cena: {formatPrice(preview.master.basePriceGross || 0)}</div>
                      </div>
                    </div>

                    {preview.dateToUse && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 className="font-semibold text-yellow-800 mb-1">Zmiana daty produktu</h4>
                        <p className="text-sm">Data mastera zostanie zmieniona na: <span className="font-bold">{preview.dateToUse}</span></p>
                      </div>
                    )}

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-2">Produkty do połączenia ({preview.toMerge.length})</h4>
                      <div className="space-y-2">
                        {preview.toMerge.map(p => (
                          <div key={p.id} className="text-sm flex justify-between">
                            <span>#{p.id} ({p.barcode || "brak kodu"})</span>
                            <span>{p.palletCount || 0} palet, {formatPrice(p.basePriceGross || 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-800 mb-2">Wynik po polaczeniu</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Łączna liczba palet: <span className="font-bold text-blue-600">{preview.result.totalPallets}</span></div>
                        <div>Łączna liczba sztuk: <span className="font-bold text-blue-600">{preview.result.totalUnits}</span></div>
                        <div>Cena (najwyzsza): <span className="font-bold text-blue-600">{formatPrice(preview.result.bestPrice)}</span></div>
                        <div>Aktywne kody: <span className="font-bold text-blue-600">{preview.result.barcodes.length}</span></div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">Kody kreskowe: {preview.result.barcodes.join(", ")}</div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Anuluj</button>
                      <button onClick={() => handleMergeGroup(previewGroupIndex)} disabled={merging} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                        {merging ? "Łączenie..." : "Potwierdz polaczenie"}
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
