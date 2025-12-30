import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { parsePriceOrUndefined } from '../../utils/priceUtils';
import { useTags, FALLBACK_TAGS } from '../../hooks/useTags';

export interface InventoryFilterValues {
  search?: string;
  status?: string;
  grower?: string;
  potSize?: string;
  visibleInShop?: string;
  hasBarcode?: string;
  priceMin?: number;
  priceMax?: number;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: string;
  tags?: string[];
  // Column filters
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
  colStatus?: string;
  colVisible?: string;
  colGrower?: string;
  colPassport?: string;
}

interface InventoryFiltersProps {
  filters: InventoryFilterValues;
  onChange: (filters: InventoryFilterValues) => void;
}

export function InventoryFilters({ filters, onChange }: InventoryFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [growers, setGrowers] = useState<string[]>([]);
  const [potSizes, setPotSizes] = useState<string[]>([]);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);

  // Use dynamic tags from API
  const { tags: dynamicTags, loading: tagsLoading } = useTags();
  const availableTags = dynamicTags.length > 0 ? dynamicTags : FALLBACK_TAGS;

  // Load unique values for dropdowns
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        // Get all products to extract unique values
        const data = await api.getInventory({});

        // Extract unique growers
        const uniqueGrowers = [...new Set(
          data.products
            .map(p => p.grower)
            .filter((g): g is string => !!g)
        )].sort();
        setGrowers(uniqueGrowers);

        // Extract unique pot sizes
        const uniquePotSizes = [...new Set(
          data.products
            .map(p => p.potSize)
            .filter((s): s is string => !!s)
        )].sort((a, b) => {
          const numA = parseInt(a) || 0;
          const numB = parseInt(b) || 0;
          return numA - numB;
        });
        setPotSizes(uniquePotSizes);
      } catch (error) {
        console.error('Error loading filter options:', error);
      }
    };
    loadFilterOptions();
  }, []);

  const handleChange = (key: keyof InventoryFilterValues, value: any) => {
    onChange({ ...filters, [key]: value || undefined });
  };

  const handleTagToggle = (tag: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    handleChange('tags', newTags.length > 0 ? newTags : undefined);
  };

  const clearFilters = () => {
    onChange({
      sortBy: 'plant_name',
      sortOrder: 'ASC',
    });
  };

  const clearDateFilters = () => {
    onChange({
      ...filters,
      dateFrom: undefined,
      dateTo: undefined,
    });
  };

  const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'sortBy' || key === 'sortOrder') return false;
    if (key === 'dateFrom' || key === 'dateTo') return false; // Date filters are visible, don't count
    if (key === 'tags' && Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== '';
  }).length;

  const hasDateFilter = filters.dateFrom || filters.dateTo;

  return (
    <div className="card">
      {/* Compact sorting, date filters and filters row */}
      <div className="px-3 py-1.5 flex items-center justify-between gap-3 bg-gray-50 flex-wrap">
        {/* Left side: Advanced filters button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <span className={`transform transition-transform text-xs ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
          Filtry
          {activeFiltersCount > 0 && (
            <span className="bg-primary-100 text-primary-700 text-xs px-1.5 py-0.5 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Center-left: Date range filters - always visible */}
        <div className="flex items-center gap-2 border-l border-gray-300 pl-3">
          <span className="text-xs text-gray-500">Data:</span>
          <input
            type="date"
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 w-32"
            value={filters.dateFrom || ''}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            title="Data od"
          />
          <span className="text-xs text-gray-400">-</span>
          <input
            type="date"
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 w-32"
            value={filters.dateTo || ''}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            title="Data do"
          />
          {hasDateFilter && (
            <button
              onClick={clearDateFilters}
              className="text-xs text-gray-500 hover:text-red-600 ml-1"
              title="Wyczyść daty"
            >
              ✕
            </button>
          )}
        </div>

        {/* Center-right: Sorting controls */}
        <div className="flex items-center gap-2 border-l border-gray-300 pl-3">
          <span className="text-xs text-gray-500">Sortuj:</span>
          <select
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
            value={filters.sortBy || 'plant_name'}
            onChange={(e) => handleChange('sortBy', e.target.value)}
          >
            <option value="plant_name">Nazwa</option>
            <option value="grower">Ogrodnik</option>
            <option value="pot_size">Doniczka</option>
            <option value="base_price_gross">Cena</option>
            <option value="total_units">Ilość</option>
            <option value="total_sold">Sprzedane</option>
            <option value="created_at">Data dodania</option>
            <option value="updated_at">Data modyfikacji</option>
          </select>
          <select
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
            value={filters.sortOrder || 'ASC'}
            onChange={(e) => handleChange('sortOrder', e.target.value)}
          >
            <option value="ASC">↑ Rosnąco</option>
            <option value="DESC">↓ Malejąco</option>
          </select>
        </div>

        {/* Right side: Clear filters */}
        {(activeFiltersCount > 0 || hasDateFilter) && (
          <button
            onClick={clearFilters}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Wyczyść wszystko
          </button>
        )}
      </div>

      {/* Advanced filters panel */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Grower */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ogrodnik
              </label>
              <select
                className="input"
                value={filters.grower || ''}
                onChange={(e) => handleChange('grower', e.target.value)}
              >
                <option value="">Wszyscy</option>
                {growers.map(grower => (
                  <option key={grower} value={grower}>{grower}</option>
                ))}
              </select>
            </div>

            {/* Pot size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rozmiar doniczki
              </label>
              <select
                className="input"
                value={filters.potSize || ''}
                onChange={(e) => handleChange('potSize', e.target.value)}
              >
                <option value="">Wszystkie</option>
                {potSizes.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            {/* Visible in shop */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Widoczność w sklepie
              </label>
              <select
                className="input"
                value={filters.visibleInShop || ''}
                onChange={(e) => handleChange('visibleInShop', e.target.value)}
              >
                <option value="">Wszystkie</option>
                <option value="true">Widoczne</option>
                <option value="false">Ukryte</option>
              </select>
            </div>

            {/* Has barcode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kod kreskowy
              </label>
              <select
                className="input"
                value={filters.hasBarcode || ''}
                onChange={(e) => handleChange('hasBarcode', e.target.value)}
              >
                <option value="">Wszystkie</option>
                <option value="true">Z kodem</option>
                <option value="false">Bez kodu</option>
              </select>
            </div>

            {/* Tags filter - spans full width */}
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tagi (kategorie)
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTagsDropdown(!showTagsDropdown)}
                  className="input w-full text-left flex items-center justify-between"
                >
                  <span className={filters.tags && filters.tags.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
                    {filters.tags && filters.tags.length > 0
                      ? `Wybrano: ${filters.tags.length} ${filters.tags.length === 1 ? 'tag' : filters.tags.length < 5 ? 'tagi' : 'tagów'}`
                      : 'Wybierz tagi...'
                    }
                  </span>
                  <span className={`transform transition-transform ${showTagsDropdown ? 'rotate-180' : ''}`}>▼</span>
                </button>

                {showTagsDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    <div className="p-2 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                      <span className="text-sm text-gray-600">
                        {filters.tags?.length || 0} wybrano
                      </span>
                      {filters.tags && filters.tags.length > 0 && (
                        <button
                          onClick={() => handleChange('tags', undefined)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Wyczyść wszystkie
                        </button>
                      )}
                    </div>
                    <div className="p-2 grid grid-cols-2 md:grid-cols-4 gap-1">
                      {tagsLoading ? (
                        <div className="col-span-4 text-sm text-gray-500 p-2">Ładowanie tagów...</div>
                      ) : (
                        availableTags.map(tag => {
                          const isSelected = filters.tags?.includes(tag);
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
                                checked={isSelected || false}
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
              </div>

              {/* Selected tags display */}
              {filters.tags && filters.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {filters.tags.map(tag => (
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
            </div>

            {/* Price range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cena od (PLN)
              </label>
              <input
                type="number"
                className="input"
                placeholder="Min"
                min="0"
                step="0.01"
                value={filters.priceMin || ''}
                onChange={(e) => handleChange('priceMin', parsePriceOrUndefined(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cena do (PLN)
              </label>
              <input
                type="number"
                className="input"
                placeholder="Max"
                min="0"
                step="0.01"
                value={filters.priceMax || ''}
                onChange={(e) => handleChange('priceMax', parsePriceOrUndefined(e.target.value))}
              />
            </div>

            {/* Empty cells to maintain grid alignment */}
            <div className="hidden md:block"></div>
            <div className="hidden md:block"></div>
          </div>

          {/* Quick filter buttons */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Szybkie filtry:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onChange({ ...filters, status: 'low' })}
                className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200"
              >
                Niski stan
              </button>
              <button
                onClick={() => onChange({ ...filters, visibleInShop: 'false' })}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded-full hover:bg-gray-200"
              >
                Ukryte w sklepie
              </button>
              <button
                onClick={() => onChange({ ...filters, hasBarcode: 'false' })}
                className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded-full hover:bg-red-200"
              >
                Bez kodu kreskowego
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const weekAgo = new Date(today);
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  onChange({
                    ...filters,
                    dateFrom: weekAgo.toISOString().split('T')[0],
                    dateTo: today.toISOString().split('T')[0],
                  });
                }}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200"
              >
                Dodane w tym tygodniu
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const monthAgo = new Date(today);
                  monthAgo.setMonth(monthAgo.getMonth() - 1);
                  onChange({
                    ...filters,
                    dateFrom: monthAgo.toISOString().split('T')[0],
                    dateTo: today.toISOString().split('T')[0],
                  });
                }}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200"
              >
                Dodane w tym miesiącu
              </button>
            </div>

            {/* Tag quick filters - use first few available tags */}
            <p className="text-sm font-medium text-gray-700 mb-2 mt-4">Popularne kategorie:</p>
            <div className="flex flex-wrap gap-2">
              {availableTags.slice(0, 6).map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    const currentTags = filters.tags || [];
                    if (!currentTags.includes(tag)) {
                      onChange({ ...filters, tags: [...currentTags, tag] });
                    }
                  }}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    filters.tags?.includes(tag)
                      ? 'bg-pink-200 text-pink-900'
                      : 'bg-pink-100 text-pink-800 hover:bg-pink-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
