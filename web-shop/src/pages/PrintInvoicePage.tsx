import { useState, useEffect } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { InvoiceTemplate } from '../components/Print/InvoiceTemplate';
import type { InvoiceForPrint, SellerInfo } from '../types';

export function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceForPrint | null>(null);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && id) {
      fetchInvoice(parseInt(id));
    }
  }, [isAuthenticated, id]);

  const fetchInvoice = async (invoiceId: number) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getMyInvoice(invoiceId);
      setInvoice(result.invoice);
      setSellerInfo(result.sellerInfo);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Błąd ładowania faktury');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: `/print/invoice/${id}` }} replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Ładowanie faktury...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/invoices')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Powrot do faktur
          </button>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Faktura nie znaleziona</p>
          <button
            onClick={() => navigate('/invoices')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Powrot do faktur
          </button>
        </div>
      </div>
    );
  }

  // Format the data for InvoiceTemplate
  const templateData = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    orderNumber: invoice.orderNumber,
    issueDate: invoice.issueDate,
    saleDate: invoice.saleDate,
    paymentDeadline: invoice.paymentDeadline,
    paymentMethod: invoice.paymentMethod,
    paymentSplits: invoice.paymentSplits,
    paymentStatus: invoice.paymentStatus,
    subtotalNet: invoice.subtotalNet,
    totalVat: invoice.totalVat,
    totalGross: invoice.totalGross,
    paidAmount: invoice.paidAmount,
    notes: invoice.notes,
    buyerInfo: invoice.buyerInfo,
    recipientInfo: invoice.recipientInfo,
    items: invoice.items,
  };

  return (
    <div className="min-h-screen bg-gray-100 py-4">
      <InvoiceTemplate data={templateData} sellerInfo={sellerInfo || undefined} />
    </div>
  );
}
