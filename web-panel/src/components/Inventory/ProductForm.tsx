import { useState, useRef, useEffect } from 'react';
import { Product } from '../../types';
import { api } from '../../services/api';
import { parsePrice } from '../../utils/priceUtils';

interface GrowerPassport {
  id: number;
  growerName: string;
  passportNumber: string;
}

interface ProductFormProps {
  onClose: () => void;
  onSubmit: (data: Partial<Product>) => Promise<{ productId: number } | void>;
  initialData?: Partial<Product>;
  isAdmin?: boolean;
}

// Generowanie kodu kreskowego EAN-13
const generateBarcode = (): string => {
  // Prefix 590 dla Polski + losowe 9 cyfr
  const prefix = '590';
  let code = prefix;
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }

  // Oblicz cyfrę kontrolną EAN-13
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return code + checkDigit.toString();
};

// Komponent wyszukiwania ogrodnika z autocomplete
function GrowerSearchInput({
  growers,
  selectedGrower,
  onSelect,
  onAddNew,
}: {
  growers: GrowerPassport[];
  selectedGrower: string;
  onSelect: (grower: GrowerPassport | null) => void;
  onAddNew: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState(selectedGrower);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Synchronizuj searchTerm gdy selectedGrower się zmieni (np. przy initialData)
  useEffect(() => {
    setSearchTerm(selectedGrower);
  }, [selectedGrower]);

  // Filtruj ogrodników po wyszukiwanej frazie
  const filteredGrowers = searchTerm.trim() === ''
    ? growers
    : growers.filter(g =>
        g.growerName.toLowerCase().includes(searchTerm.toLowerCase())
      );

  // Zamknij dropdown po kliknięciu poza
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(0);
    // Jeśli użytkownik czyści pole, wyczyść wybór
    if (e.target.value === '') {
      onSelect(null);
    }
  };


  const handleInputFocus = () => {
    setIsOpen(true);
  };


  const handleSelect = (grower: GrowerPassport) => {
    onSelect(grower);
    setSearchTerm(grower.growerName);
    setIsOpen(false);
  };


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredGrowers.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredGrowers[highlightedIndex]) {
          handleSelect(filteredGrowers[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };


  return (
    <div className="relative flex gap-2">
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          type="text"
          className="input w-full"
          placeholder="Wpisz nazwę ogrodnika..."
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {filteredGrowers.length > 0 ? (
              filteredGrowers.slice(0, 20).map((grower, index) => (
                <div
                  key={grower.id}
                  className={`px-3 py-2 cursor-pointer flex justify-between items-center ${
                    index === highlightedIndex
                      ? 'bg-primary-100 text-primary-900'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSelect(grower)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div>
                    <div className="font-medium">{grower.growerName}</div>
                    <div className="text-sm text-gray-500">
                      Paszport: {grower.passportNumber}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 text-gray-500 text-center">
                {searchTerm ? `Nie znaleziono ogrodnika "${searchTerm}"` : 'Brak ogrodników w bazie'}
              </div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onAddNew}
        className="btn btn-secondary px-3"
        title="Dodaj nowego ogrodnika"
      >
        +
      </button>
    </div>
  );
}

// Modal dodawania nowego ogrodnika
function AddGrowerModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (growerName: string, passportNumber: string) => Promise<void>;
}) {
  const [growerName, setGrowerName] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!growerName.trim() || !passportNumber.trim()) {
      setError('Wypełnij wszystkie pola');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onAdd(growerName.trim(), passportNumber.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Błąd podczas dodawania ogrodnika');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Dodaj nowego ogrodnika</h3>

          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nazwa ogrodnika <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input"
                value={growerName}
                onChange={(e) => setGrowerName(e.target.value)}
                placeholder="np. Jan Kowalski"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numer paszportu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="np. PL-12345678"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary flex-1"
                disabled={loading}
              >
                Anuluj
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={loading}
              >
                {loading ? 'Dodawanie...' : 'Dodaj ogrodnika'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function ProductForm({ onClose, onSubmit, initialData, isAdmin = false }: ProductFormProps) {
  const isDuplicate = !!initialData;

  const [formData, setFormData] = useState<Partial<Product>>(() => {
    if (initialData) {
      // Kopiowanie - użyj danych z initialData ale wygeneruj nowy barcode
      return {
        ...initialData,
        barcode: generateBarcode(), // Zawsze nowy barcode dla kopii
      };

    }
    // Nowy produkt
    return {
      plantName: '',
      potSize: '',
      plantHeightCm: 0,
      palletCount: 0,
      unitsPerPallet: 0,
      purchasePricePln: 0,
      basePriceGross: 0,
      priceDiscount10: 0,
      priceDiscount12: 0,
      priceDiscount15: 0,
      priceDiscount20: 0,
      priceDiscount25: 0,
      vatRate: 8, // Domyślnie 8%
      visibleInShop: false,
      barcode: generateBarcode(), // Auto-generowany kod kreskowy
      plantPassport: '',
      grower: '',
      imageUrl: '',
    };

  });

  const [growers, setGrowers] = useState<GrowerPassport[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGrowers, setLoadingGrowers] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showAddGrowerModal, setShowAddGrowerModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pobierz listę ogrodników
  useEffect(() => {
    const fetchGrowers = async () => {
      try {
        const response = await fetch(`${(import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'}/grower-passports`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setGrowers(data.passports || []);
        }
      } catch (err) {
        console.error('Error fetching growers:', err);
      } finally {
        setLoadingGrowers(false);
      }
    };

    fetchGrowers();
  }, []);

  const handleChange = (field: keyof Product, value: any) => {
    // Mnożnik netto (bez VAT) = 2.0 / 1.08 (bo domyślny mnożnik 2.0 zawierał 8% VAT)
    const NET_MULTIPLIER = 2.0 / 1.08;
    
    // Obsługa zmiany stawki VAT - przelicz ceny
    if (field === 'vatRate') {
      const newVatRate = value as number;
      const oldVatRate = formData.vatRate || 8;
      const currentBasePriceGross = formData.basePriceGross || 0;
      
      if (currentBasePriceGross > 0 && newVatRate !== oldVatRate) {
        // Oblicz cenę netto (bez VAT)
        const netPrice = currentBasePriceGross / (1 + oldVatRate / 100);
        // Zastosuj nowy VAT
        const newBasePriceGross = parseFloat((netPrice * (1 + newVatRate / 100)).toFixed(2));
        
        setFormData(prev => ({
          ...prev,
          vatRate: newVatRate,
          basePriceGross: newBasePriceGross,
          priceDiscount10: parseFloat((newBasePriceGross * 0.90).toFixed(2)),
          priceDiscount12: parseFloat((newBasePriceGross * 0.88).toFixed(2)),
          priceDiscount15: parseFloat((newBasePriceGross * 0.85).toFixed(2)),
          priceDiscount20: parseFloat((newBasePriceGross * 0.80).toFixed(2)),
          priceDiscount25: parseFloat((newBasePriceGross * 0.75).toFixed(2)),
        }));
        return;
      }
      setFormData(prev => ({ ...prev, vatRate: newVatRate }));
      return;
    }
    
    if (field === 'basePriceGross' && typeof value === 'number' && value > 0) {
      // Gdy użytkownik wpisuje cenę podstawową, oblicz cenę zakupu i ceny rabatowe
      const vatRate = formData.vatRate || 8;
      const netPrice = value / (1 + vatRate / 100);
      const purchasePricePln = parseFloat((netPrice / NET_MULTIPLIER * (1 + vatRate / 100)).toFixed(2));
      setFormData(prev => ({
        ...prev,
        purchasePricePln,
        basePriceGross: value,
        priceDiscount10: parseFloat((value * 0.90).toFixed(2)),
        priceDiscount12: parseFloat((value * 0.88).toFixed(2)),
        priceDiscount15: parseFloat((value * 0.85).toFixed(2)),
        priceDiscount20: parseFloat((value * 0.80).toFixed(2)),
        priceDiscount25: parseFloat((value * 0.75).toFixed(2)),
      }));
    } else if (field === 'purchasePricePln' && typeof value === 'number' && value > 0) {
      // Gdy użytkownik wpisuje cenę zakupu, oblicz pozostałe ceny z uwzględnieniem VAT
      const vatRate = formData.vatRate || 8;
      const basePriceGross = parseFloat((value * NET_MULTIPLIER * (1 + vatRate / 100)).toFixed(2));
      setFormData(prev => ({
        ...prev,
        purchasePricePln: value,
        basePriceGross,
        priceDiscount10: parseFloat((basePriceGross * 0.90).toFixed(2)),
        priceDiscount12: parseFloat((basePriceGross * 0.88).toFixed(2)),
        priceDiscount15: parseFloat((basePriceGross * 0.85).toFixed(2)),
        priceDiscount20: parseFloat((basePriceGross * 0.80).toFixed(2)),
        priceDiscount25: parseFloat((basePriceGross * 0.75).toFixed(2)),
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };


  const handleGrowerSelect = (grower: GrowerPassport | null) => {
    if (grower) {
      setFormData(prev => ({
        ...prev,
        grower: grower.growerName,
        plantPassport: grower.passportNumber,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        grower: '',
        plantPassport: '',
      }));
    }
  };


  const handleAddGrower = async (growerName: string, passportNumber: string) => {
    const response = await fetch(`${(import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'}/grower-passports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ growerName, passportNumber })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to add grower');
    }

    const data = await response.json();
    const newGrower: GrowerPassport = {
      id: data.id,
      growerName,
      passportNumber,
    };


    // Dodaj do listy i wybierz
    setGrowers(prev => [...prev, newGrower]);
    handleGrowerSelect(newGrower);
  };


  const handleRegenerateBarcode = () => {
    setFormData(prev => ({ ...prev, barcode: generateBarcode() }));
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Walidacja typu pliku
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Nieprawidłowy format pliku. Dozwolone: JPG, PNG, WEBP');
      return;
    }

    // Walidacja rozmiaru (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('Plik jest za duży. Maksymalny rozmiar: 5MB');
      return;
    }

    setImageFile(file);

    // Tworzenie podglądu
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };

    reader.readAsDataURL(file);
  };


  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.plantName || formData.palletCount === undefined || formData.unitsPerPallet === undefined) {
      alert('Proszę wypełnić wymagane pola: Nazwa rośliny, Palety, Sztuki/paleta');
      return;
    }

    try {
      setLoading(true);

      // Utwórz produkt
      const result = await onSubmit(formData);

      // Jeśli mamy zdjęcie i otrzymaliśmy ID produktu, uploaduj zdjęcie
      if (imageFile && result?.productId) {
        try {
          await api.uploadProductImage(result.productId, imageFile);
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
          // Produkt został utworzony, ale zdjęcie się nie dodało
          alert('Produkt został dodany, ale wystąpił błąd podczas dodawania zdjęcia. Możesz dodać zdjęcie przez edycję produktu.');
        }
      }

      onClose();
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Błąd podczas dodawania produktu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isDuplicate ? 'Kopiuj roślinę' : 'Dodaj nową roślinę'}
              </h2>
              {isDuplicate && (
                <p className="text-sm text-blue-600 mt-1">
                  Tworzysz kopię produktu. Zmień nazwę i zweryfikuj dane przed zapisaniem.
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Basic Info */}
            <div className="card p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-3">Podstawowe informacje</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nazwa rośliny <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.plantName || ''}
                    onChange={(e) => handleChange('plantName', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rozmiar doniczki
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="np. 21cm"
                    value={formData.potSize || ''}
                    onChange={(e) => handleChange('potSize', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wysokość (cm)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={formData.plantHeightCm || ''}
                    onChange={(e) => handleChange('plantHeightCm', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kod kreskowy (auto)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input flex-1 bg-gray-50"
                      value={formData.barcode || ''}
                      onChange={(e) => handleChange('barcode', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleRegenerateBarcode}
                      className="btn btn-secondary px-3"
                      title="Wygeneruj nowy kod"
                    >
                      🔄
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">EAN-13, automatycznie wygenerowany</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ogrodnik
                  </label>
                  {loadingGrowers ? (
                    <div className="input bg-gray-50 text-gray-500">Ładowanie ogrodników...</div>
                  ) : (
                    <GrowerSearchInput
                      growers={growers}
                      selectedGrower={formData.grower || ''}
                      onSelect={handleGrowerSelect}
                      onAddNew={() => setShowAddGrowerModal(true)}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paszport rośliny
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.plantPassport || formData.growerPassport || ''}
                    onChange={(e) => setFormData({ ...formData, plantPassport: e.target.value })}
                    placeholder="Wpisz numer paszportu lub wybierz ogrodnika"
                  />
                  <p className="text-xs text-gray-500 mt-1">Wpisz ręcznie lub zostanie uzupełniony po wyborze ogrodnika</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zdjęcie produktu
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={imagePreview}
                        alt="Podgląd"
                        className="w-32 h-32 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-32 h-32 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-500 hover:border-primary-500 hover:text-primary-500 transition-colors"
                    >
                      <span className="text-2xl mb-1">📷</span>
                      <span className="text-xs">Dodaj zdjęcie</span>
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Zdjęcie można dodać po utworzeniu produktu w szczegółach
                  </p>
                </div>
              </div>
            </div>

            {/* Stock */}
            <div className="card p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-3">Stan magazynowy</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Liczba palet <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={formData.palletCount || ''}
                    onChange={(e) => handleChange('palletCount', parseInt(e.target.value) || 0)}
                    required
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sztuki / paleta <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={formData.unitsPerPallet || ''}
                    onChange={(e) => handleChange('unitsPerPallet', parseInt(e.target.value) || 0)}
                    required
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Suma sztuk
                  </label>
                  <input
                    type="number"
                    className="input bg-gray-100"
                    value={formData.totalUnits || ((formData.palletCount || 0) * (formData.unitsPerPallet || 0))}
                    disabled
                  />
                </div>
              </div>
            </div>

            {/* Prices */}
            <div className="card p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-3">Ceny</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cena zakupu (PLN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={formData.purchasePricePln || ''}
                    onChange={(e) => handleChange('purchasePricePln', parsePrice(e.target.value))}
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cena podstawowa (PLN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={formData.basePriceGross || ''}
                    onChange={(e) => handleChange('basePriceGross', parsePrice(e.target.value))}
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    VAT (%)
                  </label>
                  <select
                    className="input"
                    value={formData.vatRate || 8}
                    onChange={(e) => handleChange('vatRate', parseInt(e.target.value))}
                  >
                    <option value={0}>0% (zwolniony)</option>
                    <option value={8}>8% (rośliny)</option>
                    <option value={23}>23% (standardowy)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rabat 10% (PLN)
                  </label>
                  <input
                    type="text"
                    className="input bg-gray-100"
                    value={(formData.priceDiscount10 || 0).toFixed(2)}
                    readOnly
                    title="Obliczane automatycznie: Cena podstawowa × 90%"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rabat 12% (PLN)
                  </label>
                  <input
                    type="text"
                    className="input bg-gray-100"
                    value={(formData.priceDiscount12 || 0).toFixed(2)}
                    readOnly
                    title="Obliczane automatycznie: Cena podstawowa × 88%"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rabat 15% (PLN)
                  </label>
                  <input
                    type="text"
                    className="input bg-gray-100"
                    value={(formData.priceDiscount15 || 0).toFixed(2)}
                    readOnly
                    title="Obliczane automatycznie: Cena podstawowa × 85%"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rabat 20% (PLN)
                  </label>
                  <input
                    type="text"
                    className="input bg-gray-100"
                    value={(formData.priceDiscount20 || 0).toFixed(2)}
                    readOnly
                    title="Obliczane automatycznie: Cena podstawowa × 80%"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rabat 25% (PLN)
                  </label>
                  <input
                    type="text"
                    className="input bg-gray-100"
                    value={(formData.priceDiscount25 || 0).toFixed(2)}
                    readOnly
                    title="Obliczane automatycznie: Cena podstawowa × 75%"
                  />
                </div>
              </div>
            </div>

            {/* Visibility */}
            <div className="card p-4 mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={formData.visibleInShop || false}
                  onChange={(e) => handleChange('visibleInShop', e.target.checked)}
                />
                <span className="text-sm font-medium text-gray-700">
                  Widoczna w sklepie
                </span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary flex-1"
                disabled={loading}
              >
                Anuluj
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={loading}
              >
                {loading
                  ? (isDuplicate ? 'Kopiowanie...' : 'Dodawanie...')
                  : (isDuplicate ? 'Utwórz kopię' : 'Dodaj produkt')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal dodawania ogrodnika */}
      {showAddGrowerModal && (
        <AddGrowerModal
          onClose={() => setShowAddGrowerModal(false)}
          onAdd={handleAddGrower}
        />
      )}
    </div>
  );
}
