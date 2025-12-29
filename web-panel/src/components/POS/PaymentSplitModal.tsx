import { useState } from 'react';
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

const paymentMethodLabels: Record<PaymentMethod, { label: string; color: string }> = {
  [PaymentMethod.CARD]: { label: 'Karta', color: 'bg-blue-600' },
  [PaymentMethod.CASH]: { label: 'Gotówka', color: 'bg-green-600' },
  [PaymentMethod.TRANSFER]: { label: 'Przelew', color: 'bg-purple-600' },
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full border border-gray-200 shadow-xl">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <h2 className="text-lg font-semibold text-gray-900">Podział płatności</h2>
          <div className="flex justify-between items-center mt-1 text-sm">
            <span className="text-gray-500">
              Do zapłaty: <span className="text-green-600 font-semibold">{formatPrice(totalAmount)} PLN</span>
            </span>
            <span className="text-gray-500">
              Pozostało: <span className={`font-semibold ${remainingAmount < 0 ? 'text-red-600' : remainingAmount === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                {formatPrice(remainingAmount)} PLN
              </span>
            </span>
          </div>
        </div>

        <div className="p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">
              {error}
            </div>
          )}

          <div className="space-y-2 mb-4">
            {payments.map((payment, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex gap-2 items-center">
                  <div className="flex-shrink-0">
                    <select
                      value={payment.method}
                      onChange={(e) => handleMethodChange(index, e.target.value as PaymentMethod)}
                      className="bg-white text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(paymentMethodLabels).map(([method, config]) => (
                        <option key={method} value={method}>
                          {config.label}
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
                      className="w-full bg-white text-gray-900 text-lg font-semibold border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                      PLN
                    </span>
                  </div>

                  {remainingAmount > 0 && (
                    <button
                      onClick={() => handleFillRemaining(index)}
                      className="px-2 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded text-xs font-medium transition-colors"
                    >
                      Reszta
                    </button>
                  )}

                  {payments.length > 1 && (
                    <button
                      onClick={() => handleRemovePayment(index)}
                      className="p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors"
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
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors mb-4 flex items-center justify-center gap-2 text-sm"
            >
              + Dodaj metodę płatności
            </button>
          )}

          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Wpłacono:</span>
              <span className="text-gray-900 font-semibold">{formatPrice(paidAmount)} PLN</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-gray-500">Do zapłaty:</span>
              <span className="text-green-600 font-semibold">{formatPrice(totalAmount)} PLN</span>
            </div>
            <div className="border-t border-gray-200 my-2"></div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Pozostało:</span>
              <span className={`font-bold ${remainingAmount < 0 ? 'text-red-600' : remainingAmount === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                {formatPrice(remainingAmount)} PLN
              </span>
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
            onClick={handleConfirm}
            disabled={Math.abs(remainingAmount) > 0.01}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            Potwierdź płatność
          </button>
        </div>
      </div>
    </div>
  );
}
