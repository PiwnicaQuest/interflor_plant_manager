import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const BROKER_URL = "http://127.0.0.1:19432";

export function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"idle" | "printing" | "success">("idle");

  useEffect(() => {
    const fetchInvoice = async () => {
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
      } catch (e: any) {
        setError(e.message || "Blad podczas pobierania faktury");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id]);

  const handlePrint = async () => {
    if (!html) return;

    setPrintStatus("printing");

    // Try Print Broker first
    try {
      const brokerStatus = await fetch(`${BROKER_URL}/status`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });

      if (brokerStatus.ok) {
        const printResponse = await fetch(`${BROKER_URL}/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType: "invoice",
            contentType: "html",
            content: html,
            copies: 1,
            paperSize: "A4",
            title: "Faktura",
          }),
        });

        const result = await printResponse.json();
        if (result.success) {
          setPrintStatus("success");
          return;
        }
      }
    } catch (brokerError) {
      console.log("Print Broker not available, falling back to browser print");
    }

    // Fallback to browser print
    window.print();
    setPrintStatus("idle");
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ fontSize: "18px", color: "#666" }}>Ladowanie faktury...</div>
      </div>
    );
  }

  if (error || !html) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ fontSize: "18px", color: "#dc2626" }}>{error || "Nie znaleziono faktury"}</div>
      </div>
    );
  }

  return (
    <>
      {/* Toolbar - hidden when printing */}
      <div
        className="print-hide"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "10px 20px",
          backgroundColor: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {printStatus === "success" ? (
          <span style={{ color: "#16a34a", fontSize: "14px", fontWeight: 500 }}>
            ✓ Wysłano do drukarki
          </span>
        ) : (
          <button
            onClick={handlePrint}
            disabled={printStatus === "printing"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 20px",
              backgroundColor: printStatus === "printing" ? "#9ca3af" : "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: printStatus === "printing" ? "not-allowed" : "pointer",
            }}
          >
            🖨️ {printStatus === "printing" ? "Drukowanie..." : "Drukuj"}
          </button>
        )}
      </div>

      <style>{`
        @media print {
          .print-hide { display: none !important; }
        }
      `}</style>

      {/* Invoice preview */}
      <div
        style={{ width: "100%", minHeight: "100vh", margin: 0, padding: 0 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
