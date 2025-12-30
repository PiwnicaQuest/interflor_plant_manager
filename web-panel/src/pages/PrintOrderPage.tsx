import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { OrderWithItems, Customer } from "../types";
import { OrderTemplate } from "../components/Print/OrderTemplate";

interface CompanySettings {
  companyName: string;
  nip: string;
  regon: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccount: string;
  bankSwift: string;
}

export function PrintOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const showPrices = searchParams.get("showPrices") !== "false";

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

        // Fetch order, customer, and company settings in parallel
        const [orderResponse, companyResponse] = await Promise.all([
          api.getOrder(parseInt(id)),
          api.getCompanySettings().catch(() => null),
        ]);

        const orderData = orderResponse.order;
        setOrder(orderData);
        setCompanySettings(companyResponse);

        if (orderData.customerId) {
          try {
            const customerResponse = await api.getCustomer(orderData.customerId);
            setCustomer((customerResponse as any).customer || customerResponse);
          } catch (e) {
            console.error("Could not fetch customer:", e);
          }
        }
      } catch (e) {
        setError("Nie udało się pobrać zamówienia");
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

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">{error || "Nie znaleziono zamówienia"}</div>
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

  // Map company settings to companyInfo format
  const companyInfo = companySettings ? {
    name: companySettings.companyName,
    nip: companySettings.nip,
    address: companySettings.street,
    city: companySettings.city,
    postalCode: companySettings.postalCode,
    phone: companySettings.phone,
    email: companySettings.email,
  } : undefined;

  return (
    <OrderTemplate
      data={{
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerId: order.customerId,
        customerName: order.customerName,
        customerInfo,
        items: order.items,
        totalAmount: order.totalAmount,
        notes: order.notes,
        customerNotes: order.customerNotes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        completedAt: order.completedAt,
      }}
      companyInfo={companyInfo}
      showPrices={showPrices}
    />
  );
}
