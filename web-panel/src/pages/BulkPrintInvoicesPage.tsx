import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const BROKER_URL = "http://127.0.0.1:19432";

export function BulkPrintInvoicesPage() {
  const [searchParams] = useSearchParams();
  const [progress, setProgress] = useState<{ current: number; total: number; status: string }>({ current: 0, total: 0, status: "Inicjalizacja..." });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ids = searchParams.get("ids")?.split(",").map(Number).filter(Boolean) || [];

  useEffect(() => {
    const printAll = async () => {
      if (ids.length === 0) {
        setError("Nie podano ID faktur");
        return;
      }

      const token = localStorage.getItem("token");
      setProgress({ current: 0, total: ids.length, status: "Sprawdzanie Print Broker..." });

      // Check if broker is available
      let brokerAvailable = false;
      try {
        const brokerCheck = await fetch(`${BROKER_URL}/status`, { method: "GET" });
        brokerAvailable = brokerCheck.ok;
      } catch {
        brokerAvailable = false;
      }

      if (!brokerAvailable) {
        // Fallback: open each invoice in separate window
        setProgress({ current: 0, total: ids.length, status: "Print Broker niedostępny - otwieranie w przeglądarce..." });
        ids.forEach((id, index) => {
          setTimeout(() => {
            window.open(`/print/invoice/${id}`, "_blank");
            setProgress(p => ({ ...p, current: index + 1 }));
          }, index * 500);
        });
        setTimeout(() => setDone(true), ids.length * 500 + 1000);
        return;
      }

      // Print via broker
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        setProgress({ current: i + 1, total: ids.length, status: `Drukowanie faktury ${i + 1} z ${ids.length}...` });

        try {
          // Fetch PDF
          const response = await fetch(`${API_URL}/invoices/${id}/pdf`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!response.ok) {
            console.error(`Failed to fetch PDF for invoice ${id}`);
            continue;
          }

          const blob = await response.blob();

          // Convert to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          // Send to broker
          await fetch(`${BROKER_URL}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentType: "invoice",
              contentType: "pdf",
              content: base64,
              copies: 1,
              paperSize: "A4",
            }),
          });

          // Small delay between prints
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (err) {
          console.error(`Error printing invoice ${id}:`, err);
        }
      }

      setProgress({ current: ids.length, total: ids.length, status: "Zakończono!" });
      setDone(true);
    };

    printAll();
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center", color: "#dc2626" }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif", background: "#f3f4f6" }}>
      <div style={{ textAlign: "center", padding: "40px", background: "white", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "20px", color: "#1f2937" }}>Drukowanie faktur</h2>
        
        <div style={{ marginBottom: "20px" }}>
          <div style={{ width: "300px", height: "8px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ 
              width: `${(progress.current / progress.total) * 100}%`, 
              height: "100%", 
              background: done ? "#22c55e" : "#2563eb", 
              transition: "width 0.3s ease" 
            }} />
          </div>
        </div>

        <p style={{ color: "#6b7280", marginBottom: "10px" }}>{progress.status}</p>
        <p style={{ color: "#9ca3af", fontSize: "14px" }}>{progress.current} / {progress.total}</p>

        {done && (
          <button
            onClick={() => window.close()}
            style={{ 
              marginTop: "20px", 
              padding: "10px 24px", 
              background: "#2563eb", 
              color: "white", 
              border: "none", 
              borderRadius: "6px", 
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            Zamknij
          </button>
        )}
      </div>
    </div>
  );
}
