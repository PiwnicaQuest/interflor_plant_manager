import { useState } from 'react';

interface CancelOrderModalProps {
  orderNumber: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

export function CancelOrderModal({
  orderNumber,
  onConfirm,
  onClose,
  isLoading = false,
}: CancelOrderModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Walidacja - powód nie może być pusty
    if (!reason.trim()) {
      setError('Powód anulowania jest wymagany');
      return;
    }

    if (reason.trim().length < 5) {
      setError('Powód anulowania musi mieć co najmniej 5 znaków');
      return;
    }

    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      // Błąd zostanie obsłużony w komponencie nadrzędnym
      console.error('Błąd podczas anulowania zamówienia:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          {/* Nagłówek */}
          <div className="mb-4">
            <h3 className="text-xl font-bold text-gray-900">
              Anulowanie zamówienia
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Zamówienie: <span className="font-semibold">{orderNumber}</span>
            </p>
          </div>

          {/* Ostrzeżenie */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-yellow-800">
                  Czy na pewno chcesz anulować to zamówienie?
                </h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Ta operacja jest nieodwracalna.
                </p>
              </div>
            </div>
          </div>

          {/* Formularz */}
          <form onSubmit={handleSubmit}>
            {/* Pole powodu */}
            <div className="mb-4">
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Powód anulowania <span className="text-red-500">*</span>
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError('');
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  error
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
                rows={4}
                placeholder="Wprowadź powód anulowania zamówienia..."
                disabled={isLoading}
                maxLength={500}
              />
              {error && (
                <p className="text-sm text-red-600 mt-1">{error}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {reason.length}/500 znaków
              </p>
            </div>

            {/* Informacja o przywróceniu stanów */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-blue-800">
                  Stany magazynowe zostaną automatycznie przywrócone.
                </p>
              </div>
            </div>

            {/* Przyciski */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary flex-1"
                disabled={isLoading}
              >
                Wróć
              </button>
              <button
                type="submit"
                className="btn btn-danger flex-1"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Anulowanie...
                  </span>
                ) : (
                  'Anuluj zamówienie'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
