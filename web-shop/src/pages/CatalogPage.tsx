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
  const [priceGroup, setPriceGroup] = useState('podstawowa');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [usedTags, setUsedTags] = useState<string[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    fetchProducts();
  }, [search, potSize, sortBy, sortOrder, selectedCategories]);

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
      setPriceGroup(result.priceGroup);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Blad ladowania produktow');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (product: Product) => {
    addItem(product, 1);
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
  const getPalletPrice = (product: Product) => product.price * getUnitsPerPallet(product);

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
          <h4 className="text-sm font-medium text-gray-700 mb-2">Wszystkie dostepne</h4>
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
    <div className="flex gap-8">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <div className="card p-4">
          <CategorySidebar />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Katalog roslin</h1>
          <p className="text-gray-600">
            {isAuthenticated
              ? 'Ceny wyswietlane dla grupy: ' + priceGroup
              : 'Zaloguj sie, aby zobaczyc ceny i skladac zamowienia'
            }
          </p>
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
        <div className="card p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <input
                type="text"
                placeholder="Szukaj rosliny..."
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Pot size filter */}
            <div>
              <select
                className="input"
                value={potSize}
                onChange={(e) => setPotSize(e.target.value)}
              >
                <option value="">Wszystkie rozmiary</option>
                {potSizes.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex gap-2">
              <select
                className="input flex-1"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="plantName">Nazwa</option>
                {isAuthenticated && <option value="price">Cena</option>}
                <option value="availableUnits">Dostepnosc</option>
              </select>
              <button
                className="btn btn-secondary px-3"
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
          <p className="text-sm text-gray-600 mb-4">
            Znaleziono: {products.length} {products.length === 1 ? 'produkt' : products.length < 5 ? 'produkty' : 'produktow'}
          </p>
        )}

        {/* Products grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Ladowanie produktow...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">Brak produktow do wyswietlenia</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map(product => {
              const unitsPerPallet = getUnitsPerPallet(product);
              const palletPrice = getPalletPrice(product);
              const availablePallets = product.palletCount || 0;

              return (
                <div key={product.id} className="card overflow-hidden group">
                  {/* Image */}
                  <div className="aspect-square bg-gray-100 relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.plantName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl">
                        🌿
                      </div>
                    )}
                    {availablePallets <= 0 && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <span className="text-white font-semibold">Niedostepny</span>
                      </div>
                    )}

                    {/* Tags on image */}
                    {product.tags && product.tags.length > 0 && (
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[80%]">
                        {product.tags.slice(0, 2).map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-green-600 bg-opacity-90 text-white text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                        {product.tags.length > 2 && (
                          <span className="px-2 py-0.5 bg-gray-600 bg-opacity-90 text-white text-xs rounded-full">
                            +{product.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-1 truncate" title={product.plantName}>
                      {product.plantName}
                    </h3>
                    <div className="text-sm text-gray-500 mb-2 space-y-0.5">
                      {product.potSize && <p>Doniczka: {product.potSize}</p>}
                      {product.plantHeightCm && <p>Wysokosc: {product.plantHeightCm} cm</p>}
                      <p className="font-medium text-gray-700">
                        Dostepne: {availablePallets} palet x {unitsPerPallet} szt.
                      </p>
                    </div>

                    {/* Prices - only when authenticated */}
                    {isAuthenticated ? (
                      <>
                        <div className="border-t pt-2 mt-2 space-y-1">
                          <div className="flex justify-between text-sm text-gray-500">
                            <span>Cena/szt.:</span>
                            <span>{formatPrice(product.price)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">Cena/paleta:</span>
                            <span className="text-xl font-bold text-green-600">
                              {formatPrice(palletPrice)}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAddToCart(product)}
                          disabled={availablePallets <= 0}
                          className="btn btn-primary w-full mt-3 text-sm"
                        >
                          Dodaj paletke
                        </button>
                      </>
                    ) : (
                      <div className="border-t pt-3 mt-2">
                        <Link
                          to="/login"
                          className="btn btn-secondary w-full text-sm text-center block"
                        >
                          Zaloguj sie, aby zobaczyc cene
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
    </div>
  );
}
