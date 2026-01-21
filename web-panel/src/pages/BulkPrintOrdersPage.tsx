import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const BROKER_URL = "http://127.0.0.1:19432";

export function BulkPrintOrdersPage() {
  const [searchParams] = useSearchParams();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("Inicjalizacja...");
  const [printStatus, setPrintStatus] = useState<"pending" | "success" | "fallback">("pending");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const ids = searchParams.get("ids") || "";

  useEffect(() => {
    document.title = "Drukuj Zamówienia";
    
    const fetchAndPrint = async () => {
      if (!ids) {
        setError("Nie podano ID zamówień");
        setLoading(false);
        return;
      }

      const idList = ids.split(",").filter(Boolean);
      setProgress(`Generowanie PDF dla ${idList.length} zamówień...`);

      try {
        const token = localStorage.getItem("token");

        const response = await fetch(`${API_URL}/orders/bulk/pdf?ids=${ids}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Nie udało się pobrać PDF zamówień");
        }

        setProgress("Przygotowywanie do druku...");
        const blob = await response.blob();

        // Try Print Broker first
        try {
          const brokerStatus = await fetch(`${BROKER_URL}/status`, { 
            method: "GET",
            signal: AbortSignal.timeout(2000)
          });
          
          if (brokerStatus.ok) {
            setProgress("Wysyłanie do drukarki...");
            
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });

            const printResponse = await fetch(`${BROKER_URL}/print`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                documentType: "order",
                contentType: "pdf",
                content: base64,
                copies: 1,
                paperSize: "A4",
                title: `Zamówienia (${idList.length})`
              })
            });

            const result = await printResponse.json();
            if (result.success) {
              setPrintStatus("success");
              setLoading(false);
              setTimeout(() => window.close(), 1500);
              return;
            }
          }
        } catch (brokerError) {
          console.log("Print Broker not available, falling back to browser print");
        }

        // Fallback to browser print
        setPrintStatus("fallback");
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (e: any) {
        setError(e.message || "Błąd podczas pobierania zamówień");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchAndPrint();

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [ids]);

  const handleIframeLoad = () => {
    if (printStatus === "fallback") {
      setTimeout(() => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.print();
        } else {
          window.print();
        }
      }, 800);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        gap: "16px"
      }}>
        <div style={{ 
          width: "48px", 
          height: "48px", 
          border: "4px solid #f3f4f6",
          borderTop: "4px solid #ea580c",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <style>{"@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }"}</style>
        <div style={{ fontSize: "18px", color: "#666" }}>{progress}</div>
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

  if (error || !pdfUrl) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        fontFamily: "Arial, sans-serif"
      }}>
        <div style={{ fontSize: "18px", color: "#dc2626" }}>{error || "Nie znaleziono zamówień"}</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh", margin: 0, padding: 0 }}>
      <iframe
        ref={iframeRef}
        src={pdfUrl}
        onLoad={handleIframeLoad}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
        title="Zamówienia PDF"
      />
    </div>
  );
}
