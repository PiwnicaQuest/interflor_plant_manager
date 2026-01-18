import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Invoice, PaymentStatus } from '../types';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '../types';
import { useAuth } from '../contexts/AuthContext';

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetchInvoices();
    }
  }, [isAuthenticated]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const result = await api.getMyInvoices();
      setInvoices(result.invoices);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Błąd ładowania faktur');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (invoiceId: number) => {
    // Open print page in new window
    window.open(`/print/invoice/${invoiceId}`, '_blank');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN'
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const getPaymentStatusInfo = (status: PaymentStatus) => {
    return {
      label: PAYMENT_STATUS_LABELS[status] || status,
      color: PAYMENT_STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'
    };
  };

  if (authLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: '/invoices' }} replace />;
  }

  return (
    <div>
      <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-8">Moje faktury</h1>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 text-sm sm:text-base">Ładowanie faktur...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-600 text-sm sm:text-base">{error}</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-8 sm:py-12">
          <div className="text-4xl sm:text-6xl mb-4">&#128196;</div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Brak faktur</h2>
          <p className="text-sm sm:text-base text-gray-600">Nie masz jeszcze zadnych faktur</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {invoices.map(invoice => {
            const statusInfo = getPaymentStatusInfo(invoice.paymentStatus);
            const remainingAmount = invoice.totalGross - invoice.paidAmount;

            return (
              <div key={invoice.id} className="card p-3 sm:p-4">
                {/* Mobile layout */}
                <div className="sm:hidden">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{invoice.invoiceNumber}</h3>
                    <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + statusInfo.color}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    <p>Data wystawienia: {formatDate(invoice.issueDate)}</p>
                    <p>Termin platnosci: {formatDate(invoice.paymentDeadline)}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-green-600">{formatPrice(invoice.totalGross)}</p>
                      {remainingAmount > 0 && invoice.paymentStatus !== 'paid' && (
                        <p className="text-xs text-orange-600">
                          Do zaplaty: {formatPrice(remainingAmount)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handlePrint(invoice.id)}
                      className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                    >
                      &#128424; Drukuj
                    </button>
                  </div>
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:block">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{invoice.invoiceNumber}</h3>
                        <p className="text-sm text-gray-500">{invoice.buyerName}</p>
                      </div>
                      <div className="text-sm text-gray-500">
                        <p>Wystawiona: {formatDate(invoice.issueDate)}</p>
                        <p>Termin: {formatDate(invoice.paymentDeadline)}</p>
                      </div>
                      <span className={'px-3 py-1 rounded-full text-sm font-medium ' + statusInfo.color}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xl font-bold text-green-600">{formatPrice(invoice.totalGross)}</p>
                        {remainingAmount > 0 && invoice.paymentStatus !== 'paid' && (
                          <p className="text-sm text-orange-600">
                            Do zaplaty: {formatPrice(remainingAmount)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handlePrint(invoice.id)}
                        className="btn-primary flex items-center gap-2"
                      >
                        &#128424; Drukuj fakture
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
