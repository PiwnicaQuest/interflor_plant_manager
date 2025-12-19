import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import { Receipt, OrderWithItems } from "../types";
import { ReceiptTemplate } from "../components/Print/ReceiptTemplate";

export function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const response = await api.getReceipts();
        const foundReceipt = response.receipts.find(r => r.id === parseInt(id));
        
        if (!foundReceipt) {
          setError("Nie znaleziono paragonu");
          return;
        }
        
        setReceipt(foundReceipt);
        
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
    createdAt: receipt.createdAt,
  };

  return (
    <ReceiptTemplate data={receiptData} />
  );
}
