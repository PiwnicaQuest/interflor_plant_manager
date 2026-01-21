import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const BROKER_URL = "http://127.0.0.1:19432";

export function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"pending" | "success" | "fallback">("pending");

  useEffect(() => {
    const fetchAndPrint = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const token = localStorage.getItem("token");

        const response = await fetch(`${API_URL}/invoices/${id}/html`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Nie udalo sie pobrac faktury");
        }

        const htmlContent = await response.text();
        setHtml(htmlContent);

        // Try Print Broker first
        try {
          const brokerStatus = await fetch(`${BROKER_URL}/status`, { 
            method: "GET",
            signal: AbortSignal.timeout(2000)
          });
          
          if (brokerStatus.ok) {
            const printResponse = await fetch(`${BROKER_URL}/print`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                documentType: "invoice",
                contentType: "html",
                content: htmlContent,
                copies: 1,
                paperSize: "A4",
                title: `Faktura`
              })
            });

            const result = await printResponse.json();
            if (result.success) {
              setPrintStatus("success");
              // Close window after short delay
              setTimeout(() => window.close(), 1500);
              return;
            }
          }
        } catch (brokerError) {
          console.log("Print Broker not available, falling back to browser print");
        }

        // Fallback to browser print
        setPrintStatus("fallback");
        setTimeout(() => {
          window.print();
        }, 300);

      } catch (e: any) {
        setError(e.message || "Blad podczas pobierania faktury");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchAndPrint();
  }, [id]);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif"
      }}>
        <div style={{ fontSize: "18px", color: "#666" }}>Ladowanie faktury...</div>
      </div>
    );
  }

  if (printStatus === "success") {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        flexDirection: "column",
        gap: "10px"
      }}>
        <div style={{ fontSize: "24px", color: "#16a34a" }}>✓</div>
        <div style={{ fontSize: "18px", color: "#16a34a" }}>Wysłano do drukarki</div>
        <div style={{ fontSize: "14px", color: "#666" }}>Okno zamknie się automatycznie...</div>
      </div>
    );
  }

  if (error || !html) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif"
      }}>
        <div style={{ fontSize: "18px", color: "#dc2626" }}>{error || "Nie znaleziono faktury"}</div>
      </div>
    );
  }

  // Render HTML content directly (for browser print fallback)
  return (
    <div
      style={{ width: "100%", minHeight: "100vh", margin: 0, padding: 0 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
