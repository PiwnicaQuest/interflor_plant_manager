import { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { Product } from '../../types';
import { useTags, FALLBACK_TAGS } from '../../hooks/useTags';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
const BASE_URL = API_URL.replace(/\/api$/, '');

interface ExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}

type PriceGroup = 'base' | 'discount10' | 'discount12' | 'discount15' | 'discount20' | 'discount25' | 'auchan8';
type TagFilterMode = 'all' | 'selected';

const PRICE_GROUP_OPTIONS: { value: PriceGroup; label: string }[] = [
  { value: 'base', label: 'Cena podstawowa' },
  { value: 'discount10', label: 'Rabat -10%' },
  { value: 'discount12', label: 'Rabat -12%' },
  { value: 'discount15', label: 'Rabat -15%' },
  { value: 'discount20', label: 'Rabat -20%' },
  { value: 'discount25', label: 'Rabat -25%' },
  { value: 'auchan8', label: 'Auchan -8%' },
];

const getProxyImageUrl = (imageUrl: string | null | undefined): string | null => {
  if (!imageUrl) return null;
  const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${BASE_URL}${imageUrl}`;
  // Use proxy for external images to bypass CORS
  if (fullUrl.includes('beeldbankfotos.royalfloraholland.com') || fullUrl.includes('p2.1ps.nl')) {
    return `${API_URL}/image-proxy?url=${encodeURIComponent(fullUrl)}`;
  }
  return fullUrl;
};

const getPrice = (product: Product, priceGroup: PriceGroup): number => {
  switch (priceGroup) {
    case 'base': return product.basePriceGross || 0;
    case 'discount10': return product.priceDiscount10 || 0;
    case 'discount12': return product.priceDiscount12 || 0;
    case 'discount15': return product.priceDiscount15 || 0;
    case 'discount20': return product.priceDiscount20 || 0;
    case 'discount25': return product.priceDiscount25 || 0;
    case 'auchan8': return (product.basePriceGross || 0) * 0.92;
    default: return product.basePriceGross || 0;
  }
};

const getPriceLabel = (priceGroup: PriceGroup): string => {
  const option = PRICE_GROUP_OPTIONS.find(o => o.value === priceGroup);
  return option?.label || 'Cena';
};

export const ExcelExportModal = ({ isOpen, onClose, products }: ExcelExportModalProps) => {
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [priceGroup, setPriceGroup] = useState<PriceGroup>('base');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  // Tag filtering state
  const [tagFilterMode, setTagFilterMode] = useState<TagFilterMode>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);

  // Use dynamic tags from API
  const { tags: dynamicTags, loading: tagsLoading } = useTags();
  const definedTags = dynamicTags.length > 0 ? dynamicTags : FALLBACK_TAGS;

  // Get unique tags from products for display
  const availableTagsInProducts = useMemo(() => {
    const tagsSet = new Set<string>();
    products.forEach(p => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    // Combine with defined tags from API to show all options
    definedTags.forEach(tag => tagsSet.add(tag));
    return Array.from(tagsSet).sort();
  }, [products, definedTags]);

  // Filter products by date range AND tags
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Date filter
      if (dateFrom || dateTo) {
        if (!product.createdAt) return false;
        const productDate = new Date(product.createdAt);

        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (productDate < fromDate) return false;
        }

        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (productDate > toDate) return false;
        }
      }

      // Tag filter
      if (tagFilterMode === 'selected' && selectedTags.length > 0) {
        const productTags = product.tags || [];
        // Product must have at least one of the selected tags
        const hasMatchingTag = selectedTags.some(tag => productTags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      return true;
    });
  }, [products, dateFrom, dateTo, tagFilterMode, selectedTags]);

  // Toggle tag selection
  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // Select all tags
  const handleSelectAllTags = () => {
    setSelectedTags([...availableTagsInProducts]);
  };

  // Clear all tags
  const handleClearTags = () => {
    setSelectedTags([]);
  };

  // Fetch image as base64
  const fetchImageAsBase64 = async (imageUrl: string): Promise<{ base64: string; extension: 'jpeg' | 'png' | 'gif' } | null> => {
    try {
      // Get auth token from localStorage for authenticated requests
      const token = localStorage.getItem('token');

      const response = await fetch(imageUrl, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        console.warn(`Failed to fetch image: ${imageUrl}, status: ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const contentType = blob.type;
      let extension: 'jpeg' | 'png' | 'gif' = 'jpeg';
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('gif')) extension = 'gif';

      return { base64, extension };
    } catch (error) {
      console.error('Error fetching image:', error);
      return null;
    }
  };

  const exportToExcel = async () => {
    if (filteredProducts.length === 0) {
      alert('Brak produktów do eksportu w wybranym zakresie');
      return;
    }

    setIsExporting(true);
    setExportProgress('Przygotowywanie...');

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'POLFLOR';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Oferta', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });

      // Define columns - dodana kolumna Tagi
      worksheet.columns = [
        { header: 'Zdjecie', key: 'image', width: 12 },
        { header: 'Nazwa rośliny', key: 'plantName', width: 35 },
        { header: 'Doniczka', key: 'potSize', width: 12 },
        { header: 'Wysokość (cm)', key: 'height', width: 14 },
        { header: 'Palety', key: 'pallets', width: 10 },
        { header: 'Szt/paleta', key: 'unitsPerPallet', width: 12 },
        { header: 'Razem szt.', key: 'totalUnits', width: 12 },
        { header: getPriceLabel(priceGroup), key: 'price', width: 15 },
        { header: 'Kategorie', key: 'tags', width: 25 },  // Nowa kolumna
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E7D32' }
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows with images
      const ROW_HEIGHT = 60;

      for (let i = 0; i < filteredProducts.length; i++) {
        const product = filteredProducts[i];
        setExportProgress(`Przetwarzanie ${i + 1} z ${filteredProducts.length}...`);

        const rowIndex = i + 2; // +2 because header is row 1

        // Format tags as comma-separated string
        const tagsString = (product.tags || []).join(', ');

        // Add row data
        const row = worksheet.addRow({
          image: '',
          plantName: product.plantName || '',
          potSize: product.potSize || '',
          height: product.plantHeightCm || '',
          pallets: product.palletCount || 0,
          unitsPerPallet: product.unitsPerPallet || 0,
          totalUnits: product.totalUnits || 0,
          price: getPrice(product, priceGroup),
          tags: tagsString,  // Dodane tagi
        });

        row.height = ROW_HEIGHT;
        row.eachCell((cell, colNumber) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber === 2 || colNumber === 9 ? 'left' : 'center',
            wrapText: colNumber === 9  // Zawijanie tekstu dla kolumny tagów
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
          // Format price column
          if (colNumber === 8) {
            cell.numFmt = '#,##0.00 "zl"';
          }
        });

        // Alternate row colors
        if (i % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' }
            };
          });
        }

        // Add image (using proxy for external images)
        const imageUrl = getProxyImageUrl(product.imageUrl);
        if (imageUrl) {
          const imageData = await fetchImageAsBase64(imageUrl);
          if (imageData) {
            try {
              const imageId = workbook.addImage({
                base64: imageData.base64,
                extension: imageData.extension,
              });

              worksheet.addImage(imageId, {
                tl: { col: 0.1, row: rowIndex - 1 + 0.1 },
                ext: { width: 70, height: 70 }
              });
            } catch (imgError) {
              console.error('Error adding image:', imgError);
            }
          }
        }
      }

      // Włącz autofiltry dla wszystkich kolumn (A1 do I + liczba wierszy)
      const lastRow = filteredProducts.length + 1;
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: lastRow, column: 9 }
      };

      setExportProgress('Generowanie pliku...');

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Generate filename with tag info
      const dateStr = new Date().toISOString().split('T')[0];
      const priceLabel = getPriceLabel(priceGroup).replace(/[^a-zA-Z0-9]/g, '_');
      const tagSuffix = tagFilterMode === 'selected' && selectedTags.length > 0
        ? `_${selectedTags.length}kategorii`
        : '';
      a.download = `oferta_${priceLabel}${tagSuffix}_${dateStr}.xlsx`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setExportProgress('');
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      alert('Wystąpił błąd podczas eksportu: ' + (error as Error).message);
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // Set default dates (last 30 days)
  const setLastDays = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(to.toISOString().split('T')[0]);
  };

  const clearDates = () => {
    setDateFrom('');
    setDateTo('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-800">Eksport oferty do Excel</h2>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Date range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zakres dat dodania produktów
            </label>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Od</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Do</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setLastDays(7)}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
              >
                Ostatnie 7 dni
              </button>
              <button
                onClick={() => setLastDays(30)}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
              >
                Ostatnie 30 dni
              </button>
              <button
                onClick={clearDates}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
              >
                Wszystkie
              </button>
            </div>
          </div>

          {/* Tag filter section - NOWA SEKCJA */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filtruj po kategoriach (tagach)
            </label>

            {/* Mode selection */}
            <div className="flex gap-2 mb-3">
              <label
                className={`flex-1 flex items-center justify-center p-2 rounded cursor-pointer transition-colors border ${
                  tagFilterMode === 'all'
                    ? 'bg-green-50 border-green-300 text-green-800'
                    : 'hover:bg-gray-50 border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="tagFilterMode"
                  value="all"
                  checked={tagFilterMode === 'all'}
                  onChange={() => setTagFilterMode('all')}
                  className="sr-only"
                />
                <span className="text-sm font-medium">Wszystkie produkty</span>
              </label>
              <label
                className={`flex-1 flex items-center justify-center p-2 rounded cursor-pointer transition-colors border ${
                  tagFilterMode === 'selected'
                    ? 'bg-pink-50 border-pink-300 text-pink-800'
                    : 'hover:bg-gray-50 border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="tagFilterMode"
                  value="selected"
                  checked={tagFilterMode === 'selected'}
                  onChange={() => setTagFilterMode('selected')}
                  className="sr-only"
                />
                <span className="text-sm font-medium">Tylko wybrane kategorie</span>
              </label>
            </div>

            {/* Tags dropdown - only show when 'selected' mode */}
            {tagFilterMode === 'selected' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTagsDropdown(!showTagsDropdown)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-left flex items-center justify-between bg-white hover:bg-gray-50"
                >
                  <span className={selectedTags.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
                    {selectedTags.length > 0
                      ? `Wybrano: ${selectedTags.length} ${selectedTags.length === 1 ? 'kategoria' : selectedTags.length < 5 ? 'kategorie' : 'kategorii'}`
                      : 'Wybierz kategorie...'}
                  </span>
                  <span className={`transform transition-transform ${showTagsDropdown ? 'rotate-180' : ''}`}>▼</span>
                </button>

                {showTagsDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <div className="p-2 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                      <span className="text-sm text-gray-600">
                        {selectedTags.length} wybrano
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSelectAllTags}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Wszystkie
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={handleClearTags}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Wyczyść
                        </button>
                      </div>
                    </div>
                    <div className="p-2 grid grid-cols-2 gap-1">
                      {tagsLoading ? (
                        <div className="col-span-2 text-sm text-gray-500 p-2">Ładowanie tagów...</div>
                      ) : (
                        availableTagsInProducts.map(tag => {
                          const isSelected = selectedTags.includes(tag);
                          return (
                            <label
                              key={tag}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                                isSelected
                                  ? 'bg-pink-100 text-pink-800 hover:bg-pink-200'
                                  : 'hover:bg-gray-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleTagToggle(tag)}
                                className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                              />
                              <span>{tag}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Selected tags display */}
                {selectedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedTags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-100 text-pink-800 text-xs rounded-full"
                      >
                        {tag}
                        <button
                          onClick={() => handleTagToggle(tag)}
                          className="hover:text-pink-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {tagFilterMode === 'selected' && selectedTags.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    Wybierz przynajmniej jedną kategorię lub przełącz na "Wszystkie produkty"
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Price group selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Grupa cenowa
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRICE_GROUP_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
                    priceGroup === option.value
                      ? 'bg-green-50 border border-green-300'
                      : 'hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="priceGroup"
                    value={option.value}
                    checked={priceGroup === option.value}
                    onChange={(e) => setPriceGroup(e.target.value as PriceGroup)}
                    className="w-4 h-4 text-green-600 focus:ring-green-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Product count */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Produktów do eksportu:</span>
              <span className={`text-lg font-bold ${filteredProducts.length > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {filteredProducts.length}
              </span>
            </div>
            {tagFilterMode === 'selected' && selectedTags.length > 0 && (
              <p className="text-xs text-pink-600 mt-1">
                Filtrowanie po: {selectedTags.join(', ')}
              </p>
            )}
            {filteredProducts.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Eksport zawiera kolumnę "Kategorie" z autofiltrami w Excelu.
              </p>
            )}
          </div>

          {/* Progress */}
          {exportProgress && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-blue-700">{exportProgress}</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            onClick={exportToExcel}
            disabled={isExporting || filteredProducts.length === 0 || (tagFilterMode === 'selected' && selectedTags.length === 0)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Eksportowanie...
              </>
            ) : (
              <>Eksportuj do Excel</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExcelExportModal;
