import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { NotificationProvider } from "./contexts/NotificationContext";
import { Layout } from "./components/Common/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { InventoryMovementsPage } from "./pages/InventoryMovementsPage";
import { OrdersPage } from "./pages/OrdersPage";
import { POSPage } from "./pages/POSPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { InvoiceCorrectionsPage } from "./pages/InvoiceCorrectionsPage";
import { ProformaPage } from "./pages/ProformaPage";
import { ReceiptsPage } from "./pages/ReceiptsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LossesPage } from "./pages/LossesPage";
import { TemplatesPageWrapper } from "./pages/TemplatesPage";
import { PrintOrderPage } from "./pages/PrintOrderPage";
import { PrintInvoicePage } from "./pages/PrintInvoicePage";
import { PrintCorrectionPage } from "./pages/PrintCorrectionPage";
import { PrintProformaPage } from "./pages/PrintProformaPage";
import { PrintReceiptPage } from "./pages/PrintReceiptPage";
import { PrintReceiptA4Page } from "./pages/PrintReceiptA4Page";
import { BulkPrintOrdersPage } from "./pages/BulkPrintOrdersPage";

// Scanner app components
import {
  ScannerLayout,
  ScannerLoginPage,
  ScannerScanPage,
  ScannerOrdersPage,
  ScannerOrderDetailPage,
  ScannerNewOrderPage,
  ScannerLossPage,
  ScannerInventoryPage,
  ScannerPOSPage,
} from "./pages/scanner";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = !!localStorage.getItem("token");

  // Scanner routes handle their own auth
  const isScannerRoute = location.pathname.startsWith("/scanner");

  useEffect(() => {
    if (!isAuthenticated && location.pathname !== "/login" && !isScannerRoute) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, location.pathname, navigate, isScannerRoute]);

  if (!isAuthenticated && location.pathname !== "/login" && !isScannerRoute) {
    return null;
  }

  return <>{children}</>;
}


function AdminGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'admin') {
        return <Navigate to="/inventory" replace />;
      }
    } catch {
      return <Navigate to="/inventory" replace />;
    }
  }
  return <>{children}</>;
}

function DefaultRedirect() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'admin') {
        return <Navigate to="/dashboard" replace />;
      }
    } catch {}
  }
  return <Navigate to="/inventory" replace />;
}


function App() {
  return (
    <NotificationProvider>
      <AuthGuard>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Main admin panel */}
          <Route path="/" element={<Layout />}>
            <Route index element={<DefaultRedirect />} />
            <Route path="dashboard" element={<AdminGuard><DashboardPage /></AdminGuard>} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory-movements" element={<InventoryMovementsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="pos" element={<POSPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoice-corrections" element={<InvoiceCorrectionsPage />} />
            <Route path="proforma" element={<ProformaPage />} />
            <Route path="receipts" element={<ReceiptsPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="losses" element={<LossesPage />} />
            <Route path="templates" element={<TemplatesPageWrapper />} />
          </Route>

          {/* Scanner app - standalone mobile-first interface */}
          <Route path="/scanner/login" element={<ScannerLoginPage />} />
          <Route path="/scanner" element={<ScannerLayout />}>
            <Route index element={<Navigate to="/scanner/scan" replace />} />
            <Route path="scan" element={<ScannerScanPage />} />
            <Route path="orders" element={<ScannerOrdersPage />} />
            <Route path="orders/new" element={<ScannerNewOrderPage />} />
            <Route path="orders/:id" element={<ScannerOrderDetailPage />} />
            <Route path="losses" element={<ScannerLossPage />} />
            <Route path="inventory" element={<ScannerInventoryPage />} />
            <Route path="pos" element={<ScannerPOSPage />} />
          </Route>

          {/* Print routes - outside Layout for clean printing */}
          <Route path="/print/order/:id" element={<PrintOrderPage />} />
          <Route path="/print/invoice/:id" element={<PrintInvoicePage />} />
          <Route path="/print/correction/:id" element={<PrintCorrectionPage />} />
          <Route path="/print/proforma/:id" element={<PrintProformaPage />} />
          <Route path="/print/receipt/:id" element={<PrintReceiptPage />} />
          <Route path="/print/receipt-a4/:id" element={<PrintReceiptA4Page />} />
          <Route path="/print/orders/bulk" element={<BulkPrintOrdersPage />} />
        </Routes>
      </AuthGuard>
    </NotificationProvider>
  );
}

export default App;
