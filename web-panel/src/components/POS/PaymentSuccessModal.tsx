import { useEffect, useRef } from 'react';

interface PaymentSuccessModalProps {
  documentType: 'invoice' | 'receipt' | 'proforma';
  documentNumber: string;
  documentId: number;
  totalAmount: number;
  paymentDetails?: string;
  change?: number;
  onClose: () => void;
  onPrint: () => void;
  onViewDocument: () => void;
}

export function PaymentSuccessModal({
  documentType,
  documentNumber,
  documentId,
  totalAmount,
  paymentDetails,
  change,
  onClose,
  onPrint,
  onViewDocument,
}: PaymentSuccessModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    modalRef.current?.focus();

    const timer = setTimeout(() => {
      onClose();
    }, 30000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      onClose();
    } else if (e.key === 'p' || e.key === 'P') {
      onPrint();
    }
  };

  const documentLabel = documentType === 'invoice' ? 'Faktura' : documentType === 'proforma' ? 'Pro Forma' : 'Paragon';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div
        ref={modalRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-white rounded-lg max-w-md w-full border border-gray-200 shadow-xl outline-none"
      >
        {/* Success Header */}
        <div className={`p-6 text-center border-b border-gray-100 rounded-t-lg ${documentType === 'proforma' ? 'bg-violet-50' : 'bg-green-50'}`}>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${documentType === 'proforma' ? 'bg-violet-500' : 'bg-green-500'}`}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className={`text-xl font-bold mb-1 ${documentType === 'proforma' ? 'text-violet-700' : 'text-green-700'}`}>
            {documentType === 'proforma' ? 'Pro Forma wygenerowana!' : 'Płatność zakończona!'}
          </h2>
          <p className={`text-sm ${documentType === 'proforma' ? 'text-violet-600' : 'text-green-600'}`}>
            {documentType === 'proforma' ? 'Dokument został utworzony pomyślnie' : 'Transakcja zrealizowana pomyślnie'}
          </p>
        </div>

        {/* Document Info */}
        <div className="p-4 space-y-3">
          {/* Document details */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">{documentLabel}</div>
                <div className="text-lg font-bold text-gray-900">{documentNumber}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Kwota</div>
                <div className="text-xl font-bold text-green-600">
                  {totalAmount.toFixed(2)} PLN
                </div>
              </div>
            </div>

            {/* Payment details */}
            {paymentDetails && (
              <div className="border-t border-gray-200 pt-2 mt-2">
                <div className="text-xs text-gray-500 mb-0.5">Szczegóły płatności</div>
                <div className="text-sm text-gray-700">{paymentDetails}</div>
              </div>
            )}
          </div>

          {/* Change to give (for cash payments) */}
          {change !== undefined && change > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-yellow-800">
                  Reszta do wydania
                </div>
                <div className="text-xl font-bold text-yellow-700">
                  {change.toFixed(2)} PLN
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-lg space-y-2">
          {/* Print and View buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPrint}
              className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Drukuj</span>
              <span className="text-xs text-blue-300">(P)</span>
            </button>
            <button
              onClick={onViewDocument}
              className="py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Podgląd</span>
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Zamknij</span>
            <span className="text-xs text-green-300">(Enter)</span>
          </button>

          <p className="text-xs text-gray-400 text-center pt-1">
            Okno zamknie się automatycznie za 30 sekund
          </p>
        </div>
      </div>
    </div>
  );
}
