import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { OrderWithItems, Customer } from "../types";
import { OrderTemplate } from "../components/Print/OrderTemplate";

export function PrintOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const showPrices = searchParams.get("showPrices") !== "false";
  
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const response = await api.getOrder(parseInt(id));
        const orderData = response.order;
        setOrder(orderData);
        
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
      showPrices={showPrices}
    />
  );
}
