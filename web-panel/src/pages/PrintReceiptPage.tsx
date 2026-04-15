import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import { Receipt, OrderWithItems } from "../types";
import { ReceiptTemplate } from "../components/Print/ReceiptTemplate";

// Define locally like in PrintInvoicePage.tsx
interface CompanySettings {
  companyName: string;
  nip: string;
  street: string;
  postalCode: string;
  city: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccount?: string;
}

export function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setLoading(true);

        // Fetch receipt and company settings in parallel
        const [receiptsResponse, settingsResponse] = await Promise.all([
          api.getReceipts(),
          api.getCompanySettings().catch(() => null)
        ]);

        const foundReceipt = receiptsResponse.receipts.find(r => r.id === parseInt(id));

        if (!foundReceipt) {
          setError("Nie znaleziono paragonu");
          return;
        }

        setReceipt(foundReceipt);

        if (settingsResponse) {
          setCompanySettings(settingsResponse);
        }

        if (foundReceipt.orderId) {
          try {
            const orderResponse = await api.getOrder(foundReceipt.orderId);
            setOrder(orderResponse.order);
          } catch (e) {
            console.error("Could not fetch order:", e);
          }
        }
      } catch (e) {
        setError("Nie udało się pobrać paragonu");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Ładowanie...</div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">{error || "Nie znaleziono paragonu"}</div>
      </div>
    );
  }

  const receiptData = {
    receiptNumber: receipt.receiptNumber,
    orderId: receipt.orderId,
    orderNumber: order?.orderNumber,
    items: order?.items || [],
    totalAmount: receipt.totalAmount,
    paymentMethod: receipt.paymentMethod,
    paymentSplits: receipt.paymentSplits,
    createdAt: receipt.createdAt,
  };

  // Map company settings to receipt format
  const companyInfo = companySettings ? {
    name: companySettings.companyName || 'Nazwa firmy',
    address: `${companySettings.street || ''}, ${companySettings.postalCode || ''} ${companySettings.city || ''}`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '') || 'Adres firmy',
    nip: companySettings.nip || 'NIP',
    phone: companySettings.phone,
  } : undefined;

  return (
    <>
      <div className="no-print" style={{textAlign:'center',padding:'12px',background:'#f3f4f6',position:'sticky',top:0,zIndex:50}}>
        <button onClick={() => window.print()} style={{padding:'12px 32px',fontSize:'16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',marginRight:'8px'}}>Drukuj</button>
        <button onClick={() => window.history.back()} style={{padding:'12px 32px',fontSize:'16px',background:'#6b7280',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer'}}>Wróć</button>
      </div>
      <style dangerouslySetInnerHTML={{__html: '@media print { .no-print { display: none !important; } }'}} />
      <ReceiptTemplate data={receiptData} companyInfo={companyInfo} />
    </>
  );
}
