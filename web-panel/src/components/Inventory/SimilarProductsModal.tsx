import { useState, useEffect } from 'react';
import { Product } from '../../types';
import { API } from '../../services/api';

interface SimilarProductsGroup {
  products: Product[];
  matchCriteria: {
    plantName: string;
    potSize: string;
    heightRange: {
      min: number;
      max: number;
    };
    unitsPerPallet?: number;
  };
}

interface SimilarProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductsMerged: () => void;
}

export function SimilarProductsModal({ isOpen, onClose, onProductsMerged }: SimilarProductsModalProps) {
  const [groups, setGroups] = useState<SimilarProductsGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<number | null>(null);
  const [selectedMasters, setSelectedMasters] = useState<Record<number, number>>({});

  useEffect(() => {
    if (isOpen) {
      loadSimilarProducts();
    }
  }, [isOpen]);

  const loadSimilarProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await API.getSimilarProducts();
      setGroups(response.groups || []);
      // Initialize selected masters (first product in each group)
      const masters: Record<number, number> = {};
      (response.groups || []).forEach((group: any, idx: number) => {
        if (group.products.length > 0) {
          // Select the product with higher price as default master
          const sorted = [...group.products].sort((a, b) => b.basePriceGross - a.basePriceGross);
          masters[idx] = sorted[0].id;
        }
      });
      setSelectedMasters(masters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udalo sie zaladowac podobnych produktow');
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async (groupIndex: number) => {
    const group = groups[groupIndex];
    const masterId = selectedMasters[groupIndex];
    if (!masterId) return;

    const productIds = group.products
      .filter(p => p.id !== masterId)
      .map(p => p.id);

    if (productIds.length === 0) return;

    setMerging(groupIndex);
    setError(null);

    try {
      await API.mergeProducts(masterId, productIds);
      // Remove merged group from list
      setGroups(prev => prev.filter((_, idx) => idx !== groupIndex));
      onProductsMerged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udalo sie polaczyc produktow');
    } finally {
      setMerging(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
    }).format(price);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Podobne produkty do polaczenia</h2>
            <p className="text-sm text-gray-500 mt-1">
              Produkty o tej samej nazwie, rozmiarze doniczki, ilosci szt/paleta i podobnej wysokosci (do 10cm roznicy)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <span className="ml-3 text-gray-600">Ladowanie podobnych produktow...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {!loading && groups.length === 0 && (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500 text-lg">Nie znaleziono podobnych produktow do polaczenia</p>
              <p className="text-gray-400 text-sm mt-1">Wszystkie produkty sa unikalne lub juz zostaly polaczone</p>
            </div>
          )}

          {!loading && groups.length > 0 && (
            <div className="space-y-6">
              {groups.map((group, groupIndex) => (
                <div key={groupIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Group header */}
                  <div className="bg-blue-50 p-3 border-b border-blue-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-blue-900">{group.matchCriteria.plantName}</h3>
                        <p className="text-sm text-blue-700">
                          Doniczka: {group.matchCriteria.potSize} |
                          Szt/paleta: {group.matchCriteria.unitsPerPallet || '-'} |
                          Wysokosc: {group.matchCriteria.heightRange.min === group.matchCriteria.heightRange.max
                            ? `${group.matchCriteria.heightRange.min}cm`
                            : `${group.matchCriteria.heightRange.min}-${group.matchCriteria.heightRange.max}cm`}
                          {' | '}{group.products.length} produktow
                        </p>
                      </div>
                      <button
                        onClick={() => handleMerge(groupIndex)}
                        disabled={merging === groupIndex}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {merging === groupIndex ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            Laczenie...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                            Polacz produkty
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Products table */}
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Glowny</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Zdjecie</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kod kreskowy</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Wysokosc</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Palety</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sztuki</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cena brutto</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hodowca</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {group.products.map((product) => (
                        <tr
                          key={product.id}
                          className={`hover:bg-gray-50 ${selectedMasters[groupIndex] === product.id ? 'bg-green-50' : ''}`}
                        >
                          <td className="px-2 py-2">
                            <input
                              type="radio"
                              name={`master-${groupIndex}`}
                              checked={selectedMasters[groupIndex] === product.id}
                              onChange={() => setSelectedMasters(prev => ({ ...prev, [groupIndex]: product.id }))}
                              className="w-4 h-4 text-green-600 focus:ring-green-500"
                            />
                          </td>
                          <td className="px-2 py-2">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.plantName}
                                className="w-10 h-10 object-cover rounded border border-gray-200"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900">{product.id}</td>
                          <td className="px-2 py-2 text-sm text-gray-600 font-mono text-xs">{product.barcode || '-'}</td>
                          <td className="px-2 py-2 text-sm text-gray-600">{product.plantHeightCm ? `${product.plantHeightCm}cm` : '-'}</td>
                          <td className="px-2 py-2 text-sm text-gray-600">{product.palletCount}</td>
                          <td className="px-2 py-2 text-sm text-gray-600">{product.totalUnits}</td>
                          <td className="px-2 py-2 text-sm font-medium text-gray-900">{formatPrice(product.basePriceGross)}</td>
                          <td className="px-2 py-2 text-sm text-gray-600">{formatDate(product.createdAt)}</td>
                          <td className="px-2 py-2 text-sm text-gray-600">{product.grower || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={5} className="px-2 py-2 text-sm font-medium text-gray-700">Po polaczeniu:</td>
                        <td className="px-2 py-2 text-sm font-medium text-gray-900">
                          {group.products.reduce((sum, p) => sum + p.palletCount, 0)}
                        </td>
                        <td className="px-2 py-2 text-sm font-medium text-gray-900">
                          {group.products.reduce((sum, p) => sum + p.totalUnits, 0)}
                        </td>
                        <td className="px-2 py-2 text-sm font-medium text-green-600">
                          {formatPrice(Math.max(...group.products.map(p => p.basePriceGross)))}
                          <span className="text-xs text-gray-500 ml-1">(najwyzsza)</span>
                        </td>
                        <td colSpan={2} className="px-2 py-2 text-sm text-gray-500">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {groups.length > 0
              ? `Znaleziono ${groups.length} grup podobnych produktow`
              : 'Brak podobnych produktow'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={loadSimilarProducts}
              disabled={loading}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Odswiez
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
