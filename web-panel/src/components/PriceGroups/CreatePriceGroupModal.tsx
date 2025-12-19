import { useState } from 'react';
import { CreatePriceGroupRequest } from '../../types';

interface CreatePriceGroupModalProps {
  onClose: () => void;
  onCreate: (data: CreatePriceGroupRequest) => Promise<void>;
}

export function CreatePriceGroupModal({ onClose, onCreate }: CreatePriceGroupModalProps) {
  const [name, setName] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState<string>('0');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Walidacja
    if (!name || name.trim().length === 0) {
      setError('Nazwa grupy cenowej jest wymagana');
      return;
    }

    const discount = parseFloat(discountPercentage);
    if (isNaN(discount)) {
      setError('Rabat musi być liczbą');
      return;
    }

    if (discount < 0 || discount > 100) {
      setError('Rabat musi być między 0 a 100%');
      return;
    }

    setLoading(true);
    try {
      await onCreate({
        name: name.trim(),
        discountPercentage: discount,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas tworzenia grupy cenowej');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Dodaj grupę cenową</h2>

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
              placeholder="np. VIP, Hurtownia, Rabat 15%"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rabat (%) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={discountPercentage}
              onChange={(e) => setDiscountPercentage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0-100"
              min="0"
              max="100"
              step="0.01"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Wartość od 0 do 100</p>
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
              {loading ? 'Tworzenie...' : 'Dodaj grupę'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
