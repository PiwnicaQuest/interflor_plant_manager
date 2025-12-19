import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import { Invoice } from "../types";
import { InvoiceTemplate } from "../components/Print/InvoiceTemplate";

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

export function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        
        // Fetch invoice and company settings in parallel
        const [invoiceResponse, settingsResponse] = await Promise.all([
          api.getInvoice(parseInt(id)),
          api.getCompanySettings().catch(() => null)
        ]);
        
        setInvoice(invoiceResponse.invoice);
        if (settingsResponse) {
          setCompanySettings(settingsResponse);
        }
      } catch (e) {
        setError("Nie udało się pobrać faktury");
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

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">{error || "Nie znaleziono faktury"}</div>
      </div>
    );
  }

  // Map invoice items to template format
  const mappedItems = (invoice.items || []).map((item) => ({
    id: item.id,
    name: item.description || 'Produkt',
    quantity: item.quantity,
    unit: 'szt.',
    unitPriceNet: item.unitPriceNet || 0,
    unitPriceGross: (item.unitPriceNet || 0) * (1 + (item.vatRate || 0) / 100),
    totalNet: item.totalNet || 0,
    totalGross: item.totalGross || 0,
    vatRate: item.vatRate || 0,
    vatAmount: item.totalVat || 0,
    unitsPerPallet: 0,
  }));

  // Map buyer info from buyerSnapshot
  const buyerInfo = invoice.buyerSnapshot ? {
    companyName: invoice.buyerSnapshot.companyName,
    firstName: invoice.buyerSnapshot.firstName,
    lastName: invoice.buyerSnapshot.lastName,
    nip: invoice.buyerSnapshot.nip,
    address: invoice.buyerSnapshot.street,
    city: invoice.buyerSnapshot.city,
    postalCode: invoice.buyerSnapshot.postalCode,
  } : undefined;

  // Build invoice data for template
  const invoiceData = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    issueDate: invoice.issueDate,
    saleDate: invoice.saleDate,
    paymentDeadline: invoice.paymentDeadline,
    paymentMethod: invoice.paymentMethod,
    paymentStatus: invoice.paymentStatus,
    items: mappedItems,
    subtotalNet: invoice.subtotalNet,
    totalVat: invoice.totalVat,
    totalGross: invoice.totalGross,
    paidAmount: invoice.paidAmount,
    notes: invoice.notes,
    buyerInfo,
  };

  // Map seller info from company settings
  const sellerInfo = companySettings ? {
    name: companySettings.companyName || 'Nazwa firmy',
    address: companySettings.street || '',
    city: companySettings.city || '',
    postalCode: companySettings.postalCode || '',
    nip: companySettings.nip || '',
    phone: companySettings.phone,
    email: companySettings.email,
    bankAccount: companySettings.bankAccount,
    bankName: companySettings.bankName,
  } : undefined;

  return (
    <InvoiceTemplate data={invoiceData} sellerInfo={sellerInfo} />
  );
}
