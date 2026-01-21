import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function PrintProformaPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Drukuj Pro Formę";
    
    const fetchAndOpenPdf = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const token = localStorage.getItem("token");

        const response = await fetch(`${API_URL}/proforma/${id}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Nie udało się pobrać PDF pro formy");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // Redirect to PDF blob URL - browser will display PDF natively
        window.location.href = url;
      } catch (e: any) {
        setError(e.message || "Błąd podczas pobierania pro formy");
        console.error(e);
        setLoading(false);
      }
    };

    fetchAndOpenPdf();
  }, [id]);

  if (error) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        fontFamily: "Arial, sans-serif"
      }}>
        <div style={{ fontSize: "18px", color: "#dc2626" }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center",
      fontFamily: "Arial, sans-serif"
    }}>
      <div style={{ fontSize: "18px", color: "#666" }}>Ładowanie pro formy...</div>
    </div>
  );
}
