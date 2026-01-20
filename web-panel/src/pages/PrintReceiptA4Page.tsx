import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

export function PrintReceiptA4Page() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to small receipt format (75mm)
    if (id) {
      navigate(`/print/receipt/${id}`, { replace: true });
    }
  }, [id, navigate]);

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center",
      fontFamily: "Arial, sans-serif"
    }}>
      <div style={{ fontSize: "18px", color: "#666" }}>Przekierowuję...</div>
    </div>
  );
}
