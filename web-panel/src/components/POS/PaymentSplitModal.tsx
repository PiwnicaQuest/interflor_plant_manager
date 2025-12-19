import { useState, useEffect } from 'react';
import { PaymentMethod, PaymentSplit } from '../../types';

// Helper function to safely format numbers
const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

interface PaymentSplitModalProps {
  totalAmount: number;
  onConfirm: (splits: PaymentSplit[]) => void;
  onCancel: () => void;
}

interface PaymentInput {
  method: PaymentMethod;
  amount: string;
}

const paymentMethodLabels: Record<PaymentMethod, { label: string; icon: string; color: string }> = {
  [PaymentMethod.CARD]: { label: 'KARTA', icon: '💳', color: 'bg-blue-600' },
  [PaymentMethod.CASH]: { label: 'GOTÓWKA', icon: '💵', color: 'bg-green-600' },
  [PaymentMethod.TRANSFER]: { label: 'PRZELEW', icon: '🏦', color: 'bg-purple-600' },
};

export function PaymentSplitModal({ totalAmount, onConfirm, onCancel }: PaymentSplitModalProps) {
  const [payments, setPayments] = useState<PaymentInput[]>([
    { method: PaymentMethod.CARD, amount: '' },
    { method: PaymentMethod.CASH, amount: '' },
  ]);

  const [error, setError] = useState<string>('');

  // Calculate remaining amount
  const paidAmount = payments.reduce((sum, payment) => {
    const amount = parseFloat(payment.amount) || 0;
    return sum + amount;
  }, 0);

  const remainingAmount = (totalAmount ?? 0) - paidAmount;

  // Update payment amount
  const handleAmountChange = (index: number, value: string) => {
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      const newPayments = [...payments];
      newPayments[index].amount = value;
      setPayments(newPayments);
      setError('');
    }
  };

  // Change payment method
  const handleMethodChange = (index: number, method: PaymentMethod) => {
    const newPayments = [...payments];
    newPayments[index].method = method;
    setPayments(newPayments);
  };

  // Add payment
  const handleAddPayment = () => {
    if (payments.length >= 3) {
      setError('Maksymalnie 3 metody płatności');
      return;
    }

    const usedMethods = new Set(payments.map(p => p.method));
    const availableMethods = [PaymentMethod.CARD, PaymentMethod.CASH, PaymentMethod.TRANSFER];
    const unusedMethod = availableMethods.find(m => !usedMethods.has(m));

    if (!unusedMethod) {
      setError('Wszystkie metody płatności są już użyte');
      return;
    }

    setPayments([...payments, { method: unusedMethod, amount: '' }]);
  };

  // Remove payment
  const handleRemovePayment = (index: number) => {
    if (payments.length <= 1) {
      setError('Wymagana co najmniej jedna metoda płatności');
      return;
    }
    const newPayments = payments.filter((_, i) => i !== index);
    setPayments(newPayments);
    setError('');
  };

  // Quick fill remaining amount
  const handleFillRemaining = (index: number) => {
    if (remainingAmount > 0) {
      const newPayments = [...payments];
      newPayments[index].amount = formatPrice(remainingAmount);
      setPayments(newPayments);
      setError('');
    }
  };

  // Confirm payment
  const handleConfirm = () => {
    const validPayments = payments.filter(p => parseFloat(p.amount) > 0);

    if (validPayments.length === 0) {
      setError('Wprowadź kwoty dla co najmniej jednej metody płatności');
      return;
    }

    const total = validPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    if (Math.abs(total - (totalAmount ?? 0)) > 0.01) {
      setError(`Suma płatności (${formatPrice(total)} PLN) musi być równa kwocie zamówienia (${formatPrice(totalAmount)} PLN)`);
      return;
    }

    const splits: PaymentSplit[] = validPayments.map(p => ({
      paymentMethod: p.method,
      amount: parseFloat(p.amount),
    }));

    onConfirm(splits);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full border border-gray-700">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Podział płatności</h2>
            <div className="flex justify-between items-center">
              <p className="text-gray-400">
                Do zapłaty: <span className="text-green-400 font-bold text-xl">{formatPrice(totalAmount)} PLN</span>
              </p>
              <p className="text-gray-400">
                Pozostało: <span className={`font-bold text-xl ${remainingAmount < 0 ? 'text-red-400' : remainingAmount === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {formatPrice(remainingAmount)} PLN
                </span>
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4 mb-6">
            {payments.map((payment, index) => (
              <div key={index} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex gap-4 items-center">
                  <div className="flex-shrink-0">
                    <select
                      value={payment.method}
                      onChange={(e) => handleMethodChange(index, e.target.value as PaymentMethod)}
                      className="bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(paymentMethodLabels).map(([method, config]) => (
                        <option key={method} value={method}>
                          {config.icon} {config.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={payment.amount}
                      onChange={(e) => handleAmountChange(index, e.target.value)}
                      className="w-full bg-gray-800 text-white text-2xl font-bold border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl pointer-events-none">
                      PLN
                    </span>
                  </div>

                  {remainingAmount > 0 && (
                    <button
                      onClick={() => handleFillRemaining(index)}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm font-semibold"
                    >
                      Wypełnij<br/>resztę
                    </button>
                  )}

                  {payments.length > 1 && (
                    <button
                      onClick={() => handleRemovePayment(index)}
                      className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                      title="Usuń metodę płatności"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {payments.length < 3 && (
            <button
              onClick={handleAddPayment}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors mb-6 flex items-center justify-center gap-2"
            >
              + Dodaj metodę płatności
            </button>
          )}

          <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-gray-700">
            <div className="flex justify-between items-center text-lg">
              <span className="text-gray-400">Wpłacono:</span>
              <span className="text-white font-bold">{formatPrice(paidAmount)} PLN</span>
            </div>
            <div className="flex justify-between items-center text-lg mt-2">
              <span className="text-gray-400">Do zapłaty:</span>
              <span className="text-green-400 font-bold">{formatPrice(totalAmount)} PLN</span>
            </div>
            <div className="border-t border-gray-700 my-3"></div>
            <div className="flex justify-between items-center text-xl">
              <span className="text-gray-400">Pozostało:</span>
              <span className={`font-bold ${remainingAmount < 0 ? 'text-red-400' : remainingAmount === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                {formatPrice(remainingAmount)} PLN
              </span>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onCancel}
              className="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold rounded-lg transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={handleConfirm}
              disabled={Math.abs(remainingAmount) > 0.01}
              className="flex-1 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xl font-bold rounded-lg transition-colors"
            >
              Potwierdź płatność
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
