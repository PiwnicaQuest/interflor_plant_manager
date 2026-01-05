import { useEffect, useRef } from 'react';

// Helper function to safely format numbers
const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

interface CardPaymentModalProps {
  totalAmount: number;
  onConfirm: () => void;
  onCancel: () => void;
  processing?: boolean;
}

export function CardPaymentModal({ totalAmount, onConfirm, onCancel, processing = false }: CardPaymentModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus confirm button on mount
    confirmButtonRef.current?.focus();

    // Handle Escape key to cancel
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !processing) {
        onCancel();
      }
      if (e.key === 'Enter' && !processing) {
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onConfirm, processing]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-sm">
        <div className="px-4 py-3 border-b border-gray-200 bg-blue-50 rounded-t-lg">
          <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Płatność kartą
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Card Icon */}
          <div className="flex justify-center">
            <div className="w-24 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg shadow-lg flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
          </div>

          {/* Total Amount */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-500 mb-1">Do zapłaty</div>
            <div className="text-3xl font-bold text-gray-900">
              {formatPrice(totalAmount)} <span className="text-xl">PLN</span>
            </div>
          </div>

          {/* Info text */}
          <p className="text-center text-sm text-gray-600">
            Potwierdź płatność kartą klikając przycisk poniżej
          </p>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg flex gap-3">
          <button
            onClick={onCancel}
            disabled={processing}
            className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-700 font-medium rounded-lg transition-colors"
          >
            Anuluj
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={processing}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Przetwarzanie...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Potwierdź płatność
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
