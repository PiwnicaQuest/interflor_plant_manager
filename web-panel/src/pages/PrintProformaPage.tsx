import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import { Proforma } from "../types";
import { ProformaTemplate } from "../components/Print/ProformaTemplate";

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
  invoiceComment?: string;
}

export function PrintProformaPage() {
  const { id } = useParams<{ id: string }>();
  const [proforma, setProforma] = useState<Proforma | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Drukuj Pro Formę";
    
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        
        // Fetch proforma and company settings in parallel
        const [proformaResponse, settingsResponse] = await Promise.all([
          api.getProforma(parseInt(id)),
          api.getCompanySettings().catch(() => null)
        ]);
        
        setProforma(proformaResponse.proforma);
        if (settingsResponse) {
          setCompanySettings(settingsResponse);
        }
      } catch (e) {
        setError("Nie udało się pobrać pro formy");
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

  if (error || !proforma) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">{error || "Nie znaleziono pro formy"}</div>
      </div>
    );
  }

  // Map proforma items to template format
  const mappedItems = (proforma.items || []).map((item) => ({
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
    growerPassport: item.growerPassport,
  }));

  // Map buyer info from buyerSnapshot
  const buyerInfo = proforma.buyerSnapshot ? {
    companyName: proforma.buyerSnapshot.companyName,
    firstName: proforma.buyerSnapshot.firstName,
    lastName: proforma.buyerSnapshot.lastName,
    nip: proforma.buyerSnapshot.nip,
    address: proforma.buyerSnapshot.street,
    city: proforma.buyerSnapshot.city,
    postalCode: proforma.buyerSnapshot.postalCode,
  } : undefined;

  // Map recipient info from recipientSnapshot (if different delivery address)
  const recipientInfo = proforma.recipientSnapshot ? {
    companyName: proforma.recipientSnapshot.companyName,
    firstName: proforma.recipientSnapshot.firstName,
    lastName: proforma.recipientSnapshot.lastName,
    address: proforma.recipientSnapshot.street,
    city: proforma.recipientSnapshot.city,
    postalCode: proforma.recipientSnapshot.postalCode,
    phone: proforma.recipientSnapshot.phone,
  } : undefined;

  // Build proforma data for template
  const proformaData = {
    id: proforma.id,
    proformaNumber: proforma.invoiceNumber,
    orderId: proforma.orderId,
    issueDate: proforma.issueDate,
    saleDate: proforma.saleDate,
    paymentDeadline: proforma.paymentDeadline,
    paymentMethod: proforma.paymentMethod,
    paymentSplits: proforma.paymentSplits,
    paymentStatus: proforma.paymentStatus,
    items: mappedItems,
    subtotalNet: proforma.subtotalNet,
    totalVat: proforma.totalVat,
    totalGross: proforma.totalGross,
    paidAmount: proforma.paidAmount,
    notes: proforma.notes,
    buyerInfo,
    recipientInfo,
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
    invoiceComment: companySettings.invoiceComment,
  } : undefined;

  return (
    <ProformaTemplate data={proformaData} sellerInfo={sellerInfo} />
  );
}
