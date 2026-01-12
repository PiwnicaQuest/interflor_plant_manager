import { useState } from 'react';
import { Invoice } from '../../types';

interface EmailInputModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSend: (email: string, saveToCustomer: boolean) => Promise<void>;
  isSending: boolean;
}

export function EmailInputModal({ invoice, onClose, onSend, isSending }: EmailInputModalProps) {
  const [email, setEmail] = useState(invoice.buyerSnapshot?.email || '');
  const [saveToCustomer, setSaveToCustomer] = useState(true);
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Wprowadz adres email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Nieprawidlowy format adresu email');
      return;
    }

    await onSend(email, saveToCustomer);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Wyslij fakture {invoice.invoiceNumber}
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adres email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
                placeholder="email@example.com"
                autoFocus
                disabled={isSending}
              />
              {error && (
                <p className="text-red-600 text-sm mt-1">{error}</p>
              )}
            </div>

            {invoice.customerId && !invoice.buyerSnapshot?.email && (
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveToCustomer}
                    onChange={(e) => setSaveToCustomer(e.target.checked)}
                    className="checkbox"
                    disabled={isSending}
                  />
                  <span className="text-sm text-gray-700">
                    Zapisz email do danych kontrahenta
                  </span>
                </label>
              </div>
            )}

            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                disabled={isSending}
              >
                Anuluj
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSending}
              >
                {isSending ? 'Wysylanie...' : 'Wyslij'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
