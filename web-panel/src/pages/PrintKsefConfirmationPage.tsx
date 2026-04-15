import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function PrintKsefConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfirmation = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/ksef/invoices/${id}/confirmation-html`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Nie udalo sie pobrac potwierdzenia KSeF");
        const htmlContent = await response.text();
        setHtml(htmlContent);
      } catch (e: any) {
        setError(e.message || "Blad podczas pobierania potwierdzenia");
      } finally {
        setLoading(false);
      }
    };
    fetchConfirmation();
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        <div style={{ fontSize: "18px", color: "#666" }}>Ladowanie potwierdzenia KSeF...</div>
      </div>
    );
  }

  if (error || !html) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        <div style={{ fontSize: "18px", color: "#dc2626" }}>{error || "Brak danych"}</div>
      </div>
    );
  }

  return (
    <>
      <div className="no-print" style={{textAlign:'center',padding:'12px',background:'#f3f4f6',position:'sticky',top:0,zIndex:50}}>
        <button onClick={() => window.print()} style={{padding:'12px 32px',fontSize:'16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',marginRight:'8px'}}>Drukuj</button>
        <button onClick={() => window.history.back()} style={{padding:'12px 32px',fontSize:'16px',background:'#6b7280',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer'}}>Wróć</button>
      </div>
      <style dangerouslySetInnerHTML={{__html: '@media print { .no-print { display: none !important; } }'}} />
      <div style={{ width: "100%", minHeight: "100vh", margin: 0, padding: 0 }}
         dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
