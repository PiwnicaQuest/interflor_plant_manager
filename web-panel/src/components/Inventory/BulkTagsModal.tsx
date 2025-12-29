import { useState } from 'react';

// Stała lista tagów z bazy danych
const AVAILABLE_TAGS = [
  'Anthurium',
  'Bonsai',
  'Bromelia',
  'Cebulowe',
  'Ceramika',
  'Cytrusy',
  'Doniczki',
  'Kwitnące',
  'Ogrodowe',
  'Palmy',
  'Rośliny Mini',
  'Spathiphyllum',
  'Sukulenty',
  'Zielone',
];

type TagMode = 'add' | 'replace' | 'remove';

interface BulkTagsModalProps {
  selectedCount: number;
  onClose: () => void;
  onSubmit: (tags: string[], mode: TagMode) => Promise<void>;
}

export function BulkTagsModal({ selectedCount, onClose, onSubmit }: BulkTagsModalProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mode, setMode] = useState<TagMode>('add');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSelectAll = () => {
    setSelectedTags(AVAILABLE_TAGS);
  };

  const handleDeselectAll = () => {
    setSelectedTags([]);
  };

  const handleSubmit = async () => {
    if (selectedTags.length === 0) {
      setError('Wybierz przynajmniej jeden tag');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onSubmit(selectedTags, mode);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Wystąpił błąd podczas aktualizacji tagów');
    } finally {
      setLoading(false);
    }
  };

  const getModeLabel = () => {
    switch (mode) {
      case 'add':
        return 'Dodaj do istniejących';
      case 'replace':
        return 'Zastąp wszystkie';
      case 'remove':
        return 'Usuń wybrane';
    }
  };

  const getModeDescription = () => {
    switch (mode) {
      case 'add':
        return 'Wybrane tagi zostaną dodane do produktów (istniejące tagi pozostaną)';
      case 'replace':
        return 'Wszystkie tagi produktów zostaną zastąpione wybranymi';
      case 'remove':
        return 'Wybrane tagi zostaną usunięte z produktów';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Zarządzaj tagami</h2>
            <p className="text-sm text-gray-500 mt-1">
              Zaznaczono <strong>{selectedCount}</strong> produktów
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Mode selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tryb operacji
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setMode('add')}
              className={`px-3 py-2 rounded-md text-sm font-medium border ${
                mode === 'add'
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              ➕ Dodaj
            </button>
            <button
              type="button"
              onClick={() => setMode('replace')}
              className={`px-3 py-2 rounded-md text-sm font-medium border ${
                mode === 'replace'
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              🔄 Zastąp
            </button>
            <button
              type="button"
              onClick={() => setMode('remove')}
              className={`px-3 py-2 rounded-md text-sm font-medium border ${
                mode === 'remove'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              ➖ Usuń
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">{getModeDescription()}</p>
        </div>

        {/* Tags selection */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Wybierz tagi ({selectedTags.length} wybrano)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Zaznacz wszystkie
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                Odznacz wszystkie
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
            {AVAILABLE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagToggle(tag)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                {selectedTags.includes(tag) && '✓ '}
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        {selectedTags.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>{getModeLabel()}</strong> tagów: {selectedTags.join(', ')}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Operacja dotyczy {selectedCount} produktów
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || selectedTags.length === 0}
            className={`flex-1 px-4 py-2 rounded-md text-white disabled:opacity-50 ${
              mode === 'remove'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Przetwarzanie...' : 'Zastosuj'}
          </button>
        </div>
      </div>
    </div>
  );
}
