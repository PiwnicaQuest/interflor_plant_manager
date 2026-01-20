import { useState } from 'react';
import { OrderStatus } from '../../types';

interface ReopenOrderModalProps {
  orderNumber: string;
  onConfirm: (newStatus: OrderStatus, reason: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: OrderStatus.READY_FOR_PICKUP, label: 'Gotowe do odbióru' },
  { value: OrderStatus.PENDING, label: 'Oczekuje' },
];

export function ReopenOrderModal({ orderNumber, onConfirm, onClose, isLoading }: ReopenOrderModalProps) {
  const [newStatus, setNewStatus] = useState<OrderStatus>(OrderStatus.READY_FOR_PICKUP);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('Powód otwarcia jest wymagany');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Powód musi mieć co najmniej 5 znaków');
      return;
    }
    setError(null);
    onConfirm(newStatus, reason.trim());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Otwórz ponownie zamówienie
            </h3>
            <p className="text-sm text-gray-500">{orderNumber}</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* New Status Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nowy status
          </label>
          <select
            className="input w-full"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Powód otwarcia <span className="text-red-500">*</span>
          </label>
          <textarea
            className="input w-full h-24 resize-none"
            placeholder="Podaj powód ponownego otwarcia zamówienia..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <p className="text-xs text-gray-500 mt-1">{reason.length}/500 znaków</p>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Uwaga</p>
              <p>Jeśli dla tego zamówienia wystawiono fakturę, może ona wymagać korekty.</p>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
            disabled={isLoading}
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            className="btn btn-primary flex-1"
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Otwieranie...
              </span>
            ) : (
              'Otwórz ponownie'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
