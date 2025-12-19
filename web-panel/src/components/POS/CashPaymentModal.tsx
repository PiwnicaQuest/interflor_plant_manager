import { useState, useEffect, useRef } from 'react';

// Helper function to safely format numbers
const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

interface CashPaymentModalProps {
  totalAmount: number;
  onConfirm: () => void;
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
      onConfirm();
    }
  };

  // Quick amount suggestions
  const getQuickAmounts = () => {
    const base = Math.ceil((totalAmount ?? 0) / 10) * 10;
    return [base, base + 10, base + 20, base + 50, 100, 200, 500];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Płatność gotówką</h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Total Amount */}
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-400 mb-1">Do zapłaty</div>
            <div className="text-4xl font-bold text-green-400">
              {formatPrice(totalAmount)} PLN
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Otrzymano od klienta
            </label>
            <input
              ref={inputRef}
              type="number"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-4 text-3xl text-white text-center focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>

          {/* Quick Amounts */}
          <div className="grid grid-cols-4 gap-2">
            {getQuickAmounts().map((amount) => (
              <button
                key={amount}
                onClick={() => handleQuickAmount(amount)}
                className="py-3 px-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                {amount.toFixed(0)} PLN
              </button>
            ))}
          </div>

          {/* Change Display */}
          <div className={"rounded-lg p-4 text-center " + (change >= 0 ? 'bg-green-900 bg-opacity-30 border border-green-700' : 'bg-red-900 bg-opacity-30 border border-red-700')}>
            <div className="text-sm text-gray-400 mb-1">
              {change >= 0 ? 'Reszta dla klienta' : 'Brakuje'}
            </div>
            <div className={"text-3xl font-bold " + (change >= 0 ? 'text-green-400' : 'text-red-400')}>
              {change >= 0
                ? formatPrice(change) + ' PLN'
                : formatPrice(Math.abs(change)) + ' PLN'
              }
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-700 flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 py-4 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            disabled={received < (totalAmount ?? 0)}
            className="flex-1 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            Potwierdź płatność
          </button>
        </div>
      </div>
    </div>
  );
}
