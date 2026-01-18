import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import { Receipt, OrderWithItems, Customer } from "../types";
import { ReceiptA4Template } from "../components/Print/ReceiptA4Template";

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

export function PrintReceiptA4Page() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setLoading(true);

        // Fetch receipts and company settings in parallel
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

            // Fetch customer if available
            if (orderResponse.order.customerId) {
              try {
                const customerResponse = await api.getCustomer(orderResponse.order.customerId);
                setCustomer((customerResponse as any).customer || customerResponse);
              } catch (e) {
                console.error("Could not fetch customer:", e);
              }
            }
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

  const customerInfo = customer ? {
    companyName: customer.companyName,
    firstName: customer.firstName,
    lastName: customer.lastName,
    nip: customer.nip,
    address: customer.street,
    city: customer.city,
    postalCode: customer.postalCode,
    email: customer.email,
    phone: customer.phone,
  } : undefined;

  const receiptData = {
    receiptNumber: receipt.receiptNumber,
    orderNumber: order?.orderNumber,
    customerName: order?.customerName || receipt.customerName,
    customerInfo,
    items: order?.items || [],
    totalAmount: receipt.totalAmount,
    paymentMethod: receipt.paymentMethod,
    createdAt: receipt.createdAt,
  };

  // Map company settings to receipt A4 format
  const companyInfo = companySettings ? {
    name: companySettings.companyName || 'Nazwa firmy',
    address: companySettings.street || 'Adres',
    city: companySettings.city || 'Miasto',
    postalCode: companySettings.postalCode || '00-000',
    nip: companySettings.nip || 'NIP',
    phone: companySettings.phone,
    email: companySettings.email,
  } : undefined;

  return (
    <ReceiptA4Template data={receiptData} companyInfo={companyInfo} />
  );
}
