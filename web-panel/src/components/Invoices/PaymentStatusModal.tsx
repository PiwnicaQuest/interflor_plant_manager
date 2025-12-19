import { useState, useEffect } from 'react';
import { Invoice, PaymentStatus } from '../../types';
import { api } from '../../services/api';

interface PaymentStatusModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentStatusModal({ invoice, onClose, onSuccess }: PaymentStatusModalProps) {
  const [paidAmount, setPaidAmount] = useState<string>(invoice.paidAmount.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPaidAmount(invoice.paidAmount.toString());
  }, [invoice.paidAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(paidAmount);

    if (isNaN(amount) || amount < 0) {
      setError('Wprowadź prawidłową kwotę');
      return;
    }

    if (amount > invoice.totalGross) {
      setError('Kwota zapłacona nie może być większa niż kwota całkowita');
      return;
    }

    try {
      setLoading(true);
      await api.updateInvoicePaymentStatus(invoice.id, amount);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error updating payment status:', err);
      setError(err.response?.data?.error || 'Wystąpił błąd podczas aktualizacji statusu płatności');
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatusLabel = (status: PaymentStatus): string => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'Nieopłacona',
      [PaymentStatus.PARTIALLY_PAID]: 'Częściowo opłacona',
      [PaymentStatus.PAID]: 'Opłacona',
      [PaymentStatus.OVERDUE]: 'Po terminie',
    };
    return labels[status];
  };

  const getPaymentStatusColor = (status: PaymentStatus): string => {
    const colors: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'text-red-700 bg-red-100',
      [PaymentStatus.PARTIALLY_PAID]: 'text-yellow-700 bg-yellow-100',
      [PaymentStatus.PAID]: 'text-green-700 bg-green-100',
      [PaymentStatus.OVERDUE]: 'text-red-900 bg-red-200',
    };
    return colors[status];
  };

  const handleQuickAmount = (percentage: number) => {
    const amount = (invoice.totalGross * percentage) / 100;
    setPaidAmount(amount.toFixed(2));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Aktualizuj płatność
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Faktura {invoice.invoiceNumber}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
              disabled={loading}
            >
              ×
            </button>
          </div>

          {/* Current Status */}
          <div className="mb-6">
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Status płatności:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentStatusColor(invoice.paymentStatus)}`}>
                  {getPaymentStatusLabel(invoice.paymentStatus)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Kwota całkowita:</span>
                <span className="font-semibold text-gray-900">{(Number(invoice.totalGross) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Zapłacono:</span>
                <span className="font-semibold text-gray-900">{(Number(invoice.paidAmount) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-sm text-gray-600">Pozostało:</span>
                <span className="font-bold text-primary-600">
                  {(invoice.totalGross - invoice.paidAmount).toFixed(2)} PLN
                </span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nowa kwota zapłacona (PLN)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={invoice.totalGross}
                className="input"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Szybki wybór:
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickAmount(25)}
                  className="btn btn-secondary text-xs py-2"
                  disabled={loading}
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAmount(50)}
                  className="btn btn-secondary text-xs py-2"
                  disabled={loading}
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAmount(75)}
                  className="btn btn-secondary text-xs py-2"
                  disabled={loading}
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAmount(100)}
                  className="btn btn-secondary text-xs py-2"
                  disabled={loading}
                >
                  100%
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={loading}
              >
                {loading ? 'Zapisywanie...' : 'Zapisz'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary flex-1"
                disabled={loading}
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
