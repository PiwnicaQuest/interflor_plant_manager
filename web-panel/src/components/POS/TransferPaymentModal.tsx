import { useState } from 'react';

interface TransferPaymentModalProps {
  totalAmount: number;
  onConfirm: (paymentDeadlineDays: number) => void;
  onCancel: () => void;
}

const formatPrice = (value: number): string => {
  return (value || 0).toFixed(2);
};

const DEADLINE_OPTIONS = [
  { value: 7, label: '7 dni' },
  { value: 14, label: '14 dni' },
  { value: 21, label: '21 dni' },
  { value: 30, label: '30 dni' },
  { value: 45, label: '45 dni' },
  { value: 60, label: '60 dni' },
];

export function TransferPaymentModal({ totalAmount, onConfirm, onCancel }: TransferPaymentModalProps) {
  const [selectedDays, setSelectedDays] = useState(14);

  const handleConfirm = () => {
    onConfirm(selectedDays);
  };

  // Calculate deadline date for preview
  const deadlineDate = new Date();
  deadlineDate.setDate(deadlineDate.getDate() + selectedDays);
  const formattedDeadline = deadlineDate.toLocaleDateString('pl-PL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-purple-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🏦</span> Płatność przelewem
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Amount Display */}
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <div className="text-sm text-purple-600 mb-1">Kwota do zapłaty</div>
            <div className="text-3xl font-bold text-purple-700">
              {formatPrice(totalAmount)} PLN
            </div>
          </div>

          {/* Deadline Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Termin płatności
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DEADLINE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedDays(option.value)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    selectedDays === option.value
                      ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Deadline Preview */}
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Termin zapłaty na fakturze</div>
            <div className="text-sm font-medium text-gray-800">
              {formattedDeadline}
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
            <div className="flex items-start gap-2">
              <span className="text-blue-500">ℹ️</span>
              <span>
                Termin płatności zostanie zapisany na fakturze.
                Status płatności będzie ustawiony jako "Nieopłacona".
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
          >
            Anuluj
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
          >
            Zatwierdź przelew
          </button>
        </div>
      </div>
    </div>
  );
}
