import { useState, useEffect, useRef } from 'react';

// Helper function to safely format numbers
const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

interface CashPaymentModalProps {
  totalAmount: number;
  onConfirm: (receivedAmount: number) => void;
  onCancel: () => void;
}

export function CashPaymentModal({ totalAmount, onConfirm, onCancel }: CashPaymentModalProps) {
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const received = parseFloat(receivedAmount) || 0;
  const change = received - (totalAmount ?? 0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQuickAmount = (amount: number) => {
    setReceivedAmount(amount.toFixed(2));
  };

  const handleSubmit = () => {
    if (received >= (totalAmount ?? 0)) {
      onConfirm(received);
    }
  };

  // Quick amount suggestions
  const getQuickAmounts = () => {
    const base = Math.ceil((totalAmount ?? 0) / 10) * 10;
    return [base, base + 10, base + 20, base + 50, 100, 200, 500];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-md">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <h2 className="text-lg font-semibold text-gray-900">Płatność gotówką</h2>
        </div>

        <div className="p-4 space-y-4">
          {/* Total Amount */}
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Do zapłaty</div>
            <div className="text-2xl font-bold text-primary-600">
              {formatPrice(totalAmount)} PLN
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Otrzymano od klienta
            </label>
            <input
              ref={inputRef}
              type="number"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-xl text-gray-900 text-center focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Quick Amounts */}
          <div className="grid grid-cols-4 gap-1.5">
            {getQuickAmounts().map((amount) => (
              <button
                key={amount}
                onClick={() => handleQuickAmount(amount)}
                className="py-2 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
              >
                {amount.toFixed(0)}
              </button>
            ))}
          </div>

          {/* Change Display */}
          <div className={`rounded-lg p-3 text-center ${change >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="text-xs text-gray-500 mb-1">
              {change >= 0 ? 'Reszta dla klienta' : 'Brakuje'}
            </div>
            <div className={`text-xl font-bold ${change >= 0 ? 'text-primary-600' : 'text-red-600'}`}>
              {change >= 0
                ? formatPrice(change) + ' PLN'
                : formatPrice(Math.abs(change)) + ' PLN'
              }
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            disabled={received < (totalAmount ?? 0)}
            className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            Potwierdź
          </button>
        </div>
      </div>
    </div>
  );
}
