import { useState } from 'react';
import { CreatePriceGroupRequest } from '../../types';

interface CreatePriceGroupModalProps {
  onClose: () => void;
  onCreate: (data: CreatePriceGroupRequest) => Promise<void>;
}

export function CreatePriceGroupModal({ onClose, onCreate }: CreatePriceGroupModalProps) {
  const [name, setName] = useState('');
  const [percentageValue, setPercentageValue] = useState<string>('0');
  const [mode, setMode] = useState<'discount' | 'markup'>('discount');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || name.trim().length === 0) {
      setError('Nazwa grupy cenowej jest wymagana');
      return;
    }

    const value = parseFloat(percentageValue);
    if (isNaN(value)) {
      setError('Wartość musi być liczbą');
      return;
    }

    if (value < 0 || value > 100) {
      setError('Wartość musi być między 0 a 100%');
      return;
    }

    // discount = positive, markup = negative (stored as discount_percentage)
    const discountPercentage = mode === 'markup' ? -value : value;

    setLoading(true);
    try {
      await onCreate({
        name: name.trim(),
        discountPercentage,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas tworzenia grupy cenowej');
    } finally {
      setLoading(false);
    }
  };

  const previewText = () => {
    const value = parseFloat(percentageValue) || 0;
    if (value === 0) return 'Cena bazowa (bez zmian)';
    if (mode === 'discount') return `Cena bazowa - ${value}% = cena po rabacie`;
    return `Cena bazowa + ${value}% = cena z narzutem`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Dodaj grupe cenowa</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nazwa grupy <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="np. VIP, Hurtownia, Narzut 8%"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Typ modyfikacji ceny <span className="text-red-500">*</span>
            </label>
            <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-3">
              <button
                type="button"
                onClick={() => setMode('discount')}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'discount'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Rabat (-)
              </button>
              <button
                type="button"
                onClick={() => setMode('markup')}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'markup'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Narzut (+)
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={percentageValue}
                onChange={(e) => setPercentageValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                placeholder="0-100"
                min="0"
                max="100"
                step="0.01"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            <p className={`text-xs mt-1 ${mode === 'markup' ? 'text-green-600' : 'text-blue-600'}`}>
              {previewText()}
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opis (opcjonalny)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Dodatkowe informacje o grupie cenowej..."
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              disabled={loading}
            >
              {loading ? 'Tworzenie...' : 'Dodaj grupe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
