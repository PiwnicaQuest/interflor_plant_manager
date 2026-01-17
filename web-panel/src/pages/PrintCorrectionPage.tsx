import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { InvoiceCorrectionWithItems } from '../types';
import { CorrectionTemplate } from '../components/Print/CorrectionTemplate';

interface CompanySettings {
  companyName: string;
  nip: string;
  street: string;
  postalCode: string;
  city: string;
  phone?: string;
  bankName?: string;
  bankAccount?: string;
}

export function PrintCorrectionPage() {
  const { id } = useParams<{ id: string }>();
  const [correction, setCorrection] = useState<InvoiceCorrectionWithItems | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        
        const [correctionResponse, settingsResponse] = await Promise.all([
          api.getInvoiceCorrection(parseInt(id)),
          api.getCompanySettings().catch(() => null)
        ]);
        
        setCorrection(correctionResponse);
        if (settingsResponse) {
          setCompanySettings(settingsResponse);
        }
      } catch (e) {
        setError('Nie udało się pobrać korekty');
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

  if (error || !correction) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">{error || 'Nie znaleziono korekty'}</div>
      </div>
    );
  }

  const correctionData = {
    id: correction.id,
    correctionNumber: correction.correctionNumber,
    originalInvoiceNumber: correction.originalInvoiceNumber,
    originalInvoiceDate: correction.originalInvoiceDate,
    correctionReason: correction.correctionReason,
    issueDate: correction.issueDate,
    items: correction.items || [],
    originalSubtotalNet: correction.originalSubtotalNet,
    originalTotalVat: correction.originalTotalVat,
    originalTotalGross: correction.originalTotalGross,
    correctedSubtotalNet: correction.correctedSubtotalNet,
    correctedTotalVat: correction.correctedTotalVat,
    correctedTotalGross: correction.correctedTotalGross,
    differenceNet: correction.differenceNet,
    differenceVat: correction.differenceVat,
    differenceGross: correction.differenceGross,
    buyerInfo: correction.buyerSnapshot,
  };

  const sellerInfo = companySettings ? {
    name: companySettings.companyName || 'Firma',
    address: companySettings.street || '',
    city: companySettings.city || '',
    postalCode: companySettings.postalCode || '',
    nip: companySettings.nip || '',
    phone: companySettings.phone,
    bankAccount: companySettings.bankAccount,
    bankName: companySettings.bankName,
  } : undefined;

  return <CorrectionTemplate data={correctionData} sellerInfo={sellerInfo} />;
}
