import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Product } from '../types';
import { CATEGORY_GROUPS } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

export function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [potSize, setPotSize] = useState('');
  const [sortBy, setSortBy] = useState('plantName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [potSizes, setPotSizes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [usedTags, setUsedTags] = useState<string[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<{url: string, name: string} | null>(null);
  const [palletQuantities, setPalletQuantities] = useState<Record<number, number>>({});

  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    fetchProducts();
  }, [search, potSize, sortBy, sortOrder, selectedCategories]);

  // Escape key handler for lightbox
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlargedImage(null);
    };
    if (enlargedImage) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [enlargedImage]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const result = await api.getCatalog({
        search,
        potSize,
        sortBy,
        sortOrder,
        tags: selectedCategories.length > 0 ? selectedCategories : undefined
      });
      setProducts(result.products);
      setPotSizes(result.filters.potSizes);
      setUsedTags(result.filters.usedTags || []);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Błąd ładowania produktów');
    } finally {
      setLoading(false);
    }
  };

  const getPalletQuantity = (productId: number) => palletQuantities[productId] || 1;

  const setPalletQuantity = (productId: number, quantity: number, maxPallets: number) => {
    const clampedQuantity = Math.max(1, Math.min(quantity, maxPallets));
    setPalletQuantities(prev => ({ ...prev, [productId]: clampedQuantity }));
  };

  const handleAddToCart = (product: Product) => {
    const quantity = getPalletQuantity(product.id);
    addItem(product, quantity);
    // Reset quantity to 1 after adding
    setPalletQuantities(prev => ({ ...prev, [product.id]: 1 }));
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setPotSize('');
    setSearch('');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN'
    }).format(price);
  };

  const getUnitsPerPallet = (product: Product) => product.unitsPerPallet || 1;

  // Category sidebar component
  const CategorySidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? '' : 'sticky top-24'}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Kategorie</h3>
        {selectedCategories.length > 0 && (
          <button
            onClick={() => setSelectedCategories([])}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Wyczysc
          </button>
        )}
      </div>

      {/* Selected categories */}
      {selectedCategories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {selectedCategories.map(cat => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
            >
              {cat}
              <button onClick={() => handleCategoryToggle(cat)} className="hover:text-green-600">
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Category groups */}
      <div className="space-y-4">
        {Object.entries(CATEGORY_GROUPS).map(([groupName, categories]) => {
          // Filter to show only categories that have products
          const availableCategories = categories.filter(cat => usedTags.includes(cat));
          if (availableCategories.length === 0) return null;

          return (
            <div key={groupName}>
              <h4 className="text-sm font-medium text-gray-700 mb-2">{groupName}</h4>
              <div className="space-y-1">
                {availableCategories.map(category => {
                  const isSelected = selectedCategories.includes(category);
                  return (
                    <button
                      key={category}
                      onClick={() => handleCategoryToggle(category)}
                      className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-green-100 text-green-800 font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show all available tags that might not be in groups */}
      {usedTags.length > 0 && (
        <div className="mt-6 pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Wszystkie dostępne</h4>
          <div className="flex flex-wrap gap-1">
            {usedTags.map(tag => {
              const isSelected = selectedCategories.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => handleCategoryToggle(tag)}
                  className={`px-2 py-1 text-xs rounded-full transition-colors ${
                    isSelected
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex gap-4 lg:gap-8">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <div className="card p-4">
          <CategorySidebar />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Katalog roślin</h1>
          {!isAuthenticated && (
            <p className="text-sm sm:text-base text-gray-600">
              Zaloguj się, aby zobaczyć ceny i składać zamówienia
            </p>
          )}
        </div>

        {/* Mobile filters button */}
        <div className="lg:hidden mb-4">
          <button
            onClick={() => setShowMobileFilters(true)}
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filtry i kategorie
            {selectedCategories.length > 0 && (
              <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                {selectedCategories.length}
              </span>
            )}
          </button>
        </div>

        {/* Mobile filters modal */}
        {showMobileFilters && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowMobileFilters(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-xl overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-lg">Filtry</h2>
                <button onClick={() => setShowMobileFilters(false)} className="p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <CategorySidebar mobile />
              </div>
            </div>
          </div>
        )}

        {/* Filters bar */}
        <div className="card p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {/* Search */}
            <div className="col-span-2">
              <input
                type="text"
                placeholder="Szukaj rośliny..."
                className="input text-sm sm:text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Pot size filter */}
            <div>
              <select
                className="input text-sm sm:text-base"
                value={potSize}
                onChange={(e) => setPotSize(e.target.value)}
              >
                <option value="">Rozmiar</option>
                {potSizes.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex gap-1 sm:gap-2">
              <select
                className="input flex-1 text-sm sm:text-base"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="plantName">Nazwa</option>
                {isAuthenticated && <option value="price">Cena</option>}
                <option value="availableUnits">Dostepnosc</option>
              </select>
              <button
                className="btn btn-secondary px-2 sm:px-3"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '^' : 'v'}
              </button>
            </div>
          </div>

          {/* Active filters display */}
          {(selectedCategories.length > 0 || potSize || search) && (
            <div className="mt-4 pt-4 border-t flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Aktywne filtry:</span>
              {search && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  Szukaj: {search}
                  <button onClick={() => setSearch('')}>x</button>
                </span>
              )}
              {potSize && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                  Rozmiar: {potSize}
                  <button onClick={() => setPotSize('')}>x</button>
                </span>
              )}
              {selectedCategories.map(cat => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
                >
                  {cat}
                  <button onClick={() => handleCategoryToggle(cat)}>x</button>
                </span>
              ))}
              <button
                onClick={clearAllFilters}
                className="text-xs text-red-600 hover:text-red-800 ml-2"
              >
                Wyczysc wszystkie
              </button>
            </div>
          )}
        </div>

        {/* Results count */}
        {!loading && !error && (
          <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
            Znaleziono: {products.length} {products.length === 1 ? 'produkt' : products.length < 5 ? 'produkty' : 'produktów'}
          </p>
        )}

        {/* Products grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Ładowanie produktów...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">Brak produktów do wyswietlenia</p>
            {selectedCategories.length > 0 && (
              <button
                onClick={() => setSelectedCategories([])}
                className="btn btn-secondary"
              >
                Wyczysc filtry kategorii
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
            {products.map(product => {
              const unitsPerPallet = getUnitsPerPallet(product);
              const availablePallets = product.palletCount || 0;
              const currentQuantity = getPalletQuantity(product.id);

              return (
                <div key={product.id} className="card overflow-hidden group">
                  {/* Image */}
                  <div
                    className={"aspect-square bg-gray-100 relative " + (product.imageUrl ? "cursor-pointer group/img" : "")}
                    onClick={() => product.imageUrl && setEnlargedImage({ url: product.imageUrl, name: product.plantName })}
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.plantName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl sm:text-6xl">
                        🌿
                      </div>
                    )}
                    {/* Hover overlay with zoom icon */}
                    {product.imageUrl && (
                      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 flex items-center justify-center transition-all duration-200 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-10 sm:w-10 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </div>
                    )}
                    {isAuthenticated && availablePallets <= 0 && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <span className="text-white font-semibold">Niedostepny</span>
                      </div>
                    )}

                    {/* Tags on image */}
                    {product.tags && product.tags.length > 0 && (
                      <div className="absolute top-1 left-1 sm:top-2 sm:left-2 flex flex-wrap gap-0.5 sm:gap-1 max-w-[85%]">
                        {product.tags.slice(0, 1).map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 sm:px-2 py-0.5 bg-green-600 bg-opacity-90 text-white text-[10px] sm:text-xs rounded-full truncate max-w-full"
                          >
                            {tag}
                          </span>
                        ))}
                        {product.tags.length > 1 && (
                          <span className="px-1.5 sm:px-2 py-0.5 bg-gray-600 bg-opacity-90 text-white text-[10px] sm:text-xs rounded-full">
                            +{product.tags.length - 1}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 sm:p-4">
                    <h3 className="font-semibold text-gray-900 mb-0.5 sm:mb-1 text-sm sm:text-base line-clamp-2" title={product.plantName}>
                      {product.plantName}
                    </h3>
                    <div className="text-[11px] sm:text-sm text-gray-500 mb-1 sm:mb-2 space-y-0">
                      {product.potSize && <p>Doniczka: {product.potSize}</p>}
                      {product.plantHeightCm && <p className="hidden sm:block">Wysokość: {product.plantHeightCm} cm</p>}
                    </div>

                    {/* Prices and availability - only when authenticated */}
                    {isAuthenticated ? (
                      <>
                        <p className="text-[10px] sm:text-sm text-gray-500 mb-1 sm:mb-2">
                          {availablePallets} pal. x {unitsPerPallet} szt.
                        </p>

                        {/* Unit price as main price */}
                        <div className="border-t pt-1 sm:pt-2 mt-1 sm:mt-2">
                          <div className="text-center mb-2">
                            <span className="text-lg sm:text-2xl font-bold text-green-600">
                              {formatPrice(product.price)}
                            </span>
                            <span className="text-xs sm:text-sm text-gray-500 ml-1">/ szt.</span>
                          </div>
                        </div>

                        {/* Pallet quantity selector */}
                        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-2">
                          <span className="text-[10px] sm:text-xs text-gray-600">Palety:</span>
                          <div className="flex items-center border rounded-lg overflow-hidden">
                            <button
                              onClick={() => setPalletQuantity(product.id, currentQuantity - 1, availablePallets)}
                              disabled={currentQuantity <= 1 || availablePallets <= 0}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-medium"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={availablePallets}
                              value={currentQuantity}
                              onChange={(e) => setPalletQuantity(product.id, parseInt(e.target.value) || 1, availablePallets)}
                              disabled={availablePallets <= 0}
                              className="w-10 sm:w-12 text-center text-sm sm:text-base py-1 border-x focus:outline-none disabled:bg-gray-100"
                            />
                            <button
                              onClick={() => setPalletQuantity(product.id, currentQuantity + 1, availablePallets)}
                              disabled={currentQuantity >= availablePallets || availablePallets <= 0}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-medium"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[10px] sm:text-xs text-gray-400">/ {availablePallets}</span>
                        </div>

                        <button
                          onClick={() => handleAddToCart(product)}
                          disabled={availablePallets <= 0}
                          className="btn btn-primary w-full text-xs sm:text-sm py-1.5 sm:py-2"
                        >
                          Dodaj
                        </button>
                      </>
                    ) : (
                      <div className="border-t pt-2 sm:pt-3 mt-1 sm:mt-2">
                        <Link
                          to="/login"
                          className="btn btn-secondary w-full text-[10px] sm:text-sm text-center block py-1.5 sm:py-2"
                        >
                          Zaloguj się
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="absolute inset-0 bg-black bg-opacity-80" />
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute -top-10 right-0 text-white text-2xl hover:text-gray-300 transition-colors"
            >
              ✕
            </button>
            <img
              src={enlargedImage.url}
              alt={enlargedImage.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <p className="text-white text-center mt-3 text-lg font-medium">{enlargedImage.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
