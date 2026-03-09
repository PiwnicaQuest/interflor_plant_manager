import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import jwt from 'jsonwebtoken';

// Load environment variables from backend directory
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import middleware
import { requireAuth, requireRole, optionalAuth, requirePermission, requireAnyPermission, requireRoleOrPermission } from './middleware/auth';
import { generalLimiter, authLimiter } from './middleware/rateLimiter';
import { snakeToCamelMiddleware } from './middleware/caseConverter';
import { UserRole, JWTPayload } from './types';

// Import controllers
import { AuthController } from './controllers/auth.controller';
import { SessionModel } from './models/Session';
import { InventoryController } from './controllers/inventory.controller';
import { OrderController } from './controllers/order.controller';
import { sendOrderToPolflor } from './controllers/order.controller';
import { CustomerController } from './controllers/customer.controller';
import { InvoiceController } from './controllers/invoice.controller';
import { POSController } from './controllers/pos.controller';
import { ReceiptController } from './controllers/receipt.controller';
import { ShopController } from './controllers/shop.controller';
import { NipController } from './controllers/nip.controller';
import { CSVImportController, csvUpload } from './controllers/csvImport.controller';
import { ExcelImportController, excelUpload } from './controllers/excelImport.controller';
import { ReportController } from './controllers/report.controller';
import { emailService } from './services/emailService';
import { EmailImportService } from "./services/emailImportService";
import { UserController } from './controllers/user.controller';
import { InventoryMovementController } from './controllers/inventoryMovement.controller';
import { PriceGroupController } from './controllers/priceGroup.controller';
import { CronService } from './services/cronService';
import * as SettingsController from './controllers/settingsController'; 
import { growerPassportController } from './controllers/growerPassport.controller';
import { PrintTemplateController } from './controllers/printTemplate.controller';
import { MigrationController } from './controllers/migrationController';
import { ScannerController } from './controllers/scanner.controller';
import { UploadController, productImageUpload } from './controllers/upload.controller';
import printRouter from './controllers/print.controller';
import invoiceCorrectionRouter from './controllers/invoiceCorrection.controller';
import { ProformaController } from "./controllers/proforma.controller";
import { LossesController } from "./controllers/losses.controller";
import { TagsController } from "./controllers/tags.controller";
import { PermissionProfileController } from "./controllers/permissionProfile.controller";
import { LoginHistoryController } from "./controllers/loginHistory.controller";
import { KsefController } from "./controllers/ksef.controller";
import { ImageService, ImageSize } from './services/imageService';
import { OrderModel } from './models/Order';
import { SettingsModel } from './models/Settings';

// Initialize Express
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(snakeToCamelMiddleware);

// Apply rate limiting
app.use(generalLimiter);

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/downloads', express.static(path.join(__dirname, '../public/downloads')));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// AUTH ROUTES
// ============================================

app.post('/auth/login', authLimiter, AuthController.login);
// Self-registration disabled - shop accounts are created by admin only
// app.post('/auth/register', AuthController.register);
app.get('/auth/me', requireAuth, AuthController.me);
app.post('/auth/logout', requireAuth, AuthController.logout);
app.get('/auth/sessions', requireAuth, AuthController.getActiveSessions);

// ============================================
// INVENTORY ROUTES
// ============================================

app.get('/inventory', requireAuth, InventoryController.getAll);
app.get('/inventory/low-stock', requireAuth, requirePermission('inventory:view'), InventoryController.getLowStock);
app.get('/inventory/csv-template', requireAuth, requirePermission('inventory:view'), CSVImportController.downloadTemplate);

// Similar products and merging (must be before :id routes)
app.get('/inventory/similar-products', requireAuth, requirePermission('inventory:view'), InventoryController.getSimilarProducts);
app.post('/inventory/merge', requireAuth, requirePermission('inventory:merge'), InventoryController.mergeProducts);
app.get("/inventory/merge-history", requireAuth, requirePermission('inventory:merge'), InventoryController.getMergeHistory);
app.post('/inventory/scan-barcode', requireAuth, InventoryController.scanBarcodeWithMerged);
app.post("/inventory/import-csv", requireAuth, requirePermission('inventory:create'), csvUpload.single("file"), CSVImportController.importCSV);
app.post("/inventory/import-excel", requireAuth, requirePermission('inventory:create'), excelUpload.single("file"), ExcelImportController.importExcel);
app.get('/inventory/barcode/:barcode', requireAuth, ScannerController.getProductByBarcode);

app.get('/inventory/:id', requireAuth, InventoryController.getById);
app.get('/inventory/:id/similar', requireAuth, requirePermission('inventory:view'), InventoryController.getSimilarToProduct);
app.get('/inventory/:id/merged', requireAuth, requirePermission('inventory:view'), InventoryController.getMergedProducts);
app.post('/inventory/:id/unmerge', requireAuth, requirePermission('inventory:merge'), InventoryController.unmergeProduct);
app.post('/inventory', requireAuth, requirePermission('inventory:create'), InventoryController.create);
app.put('/inventory/:id', requireAuth, requirePermission('inventory:edit'), InventoryController.update);
app.delete('/inventory/:id', requireAuth, requirePermission('inventory:delete'), InventoryController.delete);
app.patch('/inventory/:id/toggle-visibility', requireAuth, requirePermission('inventory:edit'), InventoryController.toggleVisibility);
app.patch("/inventory/:id/archive", requireAuth, requirePermission('inventory:archive'), InventoryController.archive);
app.patch("/inventory/:id/restore", requireAuth, requirePermission('inventory:archive'), InventoryController.restore);
app.post("/inventory/bulk-tags", requireAuth, requirePermission('inventory:edit'), InventoryController.bulkUpdateTags);

// Product image upload
app.post('/inventory/:id/image', requireAuth, requirePermission('inventory:edit'), productImageUpload.single('image'), UploadController.uploadProductImage);
app.delete('/inventory/:id/image', requireAuth, requirePermission('inventory:edit'), UploadController.deleteProductImage);
app.put('/inventory/:id/image-url', requireAuth, requirePermission('inventory:edit'), UploadController.setProductImageUrl);

// Recalculate all prices based on current settings
app.post("/inventory/recalculate-prices", requireAuth, requirePermission('settings:edit'), InventoryController.recalculateAllPrices);

// ============================================
// INVENTORY MOVEMENTS ROUTES
// ============================================

app.get('/inventory-movements', requireAuth, requirePermission('inventory:view'), InventoryMovementController.getAll);
app.get('/inventory-movements/statistics', requireAuth, requirePermission('inventory:view'), InventoryMovementController.getStatistics);
app.get('/inventory-movements/types', requireAuth, requirePermission('inventory:view'), InventoryMovementController.getAvailableTypes);
app.get('/inventory-movements/product/:productId', requireAuth, requirePermission('inventory:view'), InventoryMovementController.getByProduct);
app.delete("/inventory-movements/:id", requireAuth, InventoryMovementController.hide);
app.delete("/inventory-movements", requireAuth, InventoryMovementController.hideMany);

// ============================================
// ORDERS ROUTES
// ============================================

app.get('/orders', requireAuth, OrderController.getAll);
app.get('/orders/bulk', requireAuth, OrderController.getBulk);
app.get('/orders/bulk/pdf', requireAuth, OrderController.getBulkPdf);
app.get('/orders/:id/pdf', requireAuth, OrderController.getPdf);
app.get('/orders/by-product/:productId', requireAuth, OrderController.getByProductId);
app.get('/orders/:id/status-history', requireAuth, OrderController.getStatusHistory);
app.get('/orders/:id', requireAuth, OrderController.getById);
app.post('/orders', requireAuth, OrderController.create);
app.patch('/orders/:id/status', requireAuth, OrderController.updateStatus);
app.patch('/orders/:id/cancel', requireAuth, OrderController.cancelOrder);
app.put('/orders/:id', requireAuth, OrderController.update);
app.delete('/orders/:id', requireAuth, requirePermission('orders:delete'), OrderController.delete);
app.post('/orders/:id/merge', requireAuth, OrderController.mergeOrders);
// Order items management for scanner app
app.post('/orders/:id/items', requireAuth, ScannerController.addOrderItem);
app.put('/orders/:id/items/:itemId', requireAuth, ScannerController.updateOrderItem);
app.delete('/orders/:id/items/:itemId', requireAuth, ScannerController.deleteOrderItem);

// ============================================
// INVOICES ROUTES
// ============================================

app.get('/invoices', requireAuth, InvoiceController.getAll);
app.get('/invoices/:id', requireAuth, InvoiceController.getById);
app.post('/invoices', requireAuth, requirePermission('invoices:create'), InvoiceController.create);
app.patch('/invoices/:id/payment-status', requireAuth, requirePermission('invoices:payment'), InvoiceController.updatePaymentStatus);
app.get('/invoices/:id/pdf', requireAuth, InvoiceController.getPDF);
app.post('/invoices/:id/send-email', requireAuth, requireRoleOrPermission([UserRole.POS], 'invoices:view'), InvoiceController.sendEmail);
app.get("/invoices/:id/html", requireAuth, InvoiceController.getHTML);
app.patch("/invoices/:id/payment-method", requireAuth, requirePermission('invoices:edit'), InvoiceController.updatePaymentMethod);
app.get("/invoices/:id/audit-log", requireAuth, requirePermission('invoices:view'), InvoiceController.getAuditLog);

// ============================================
// KSEF ROUTES
// ============================================
app.post("/ksef/invoices/:id/send", requireAuth, requirePermission("invoices:create"), KsefController.sendInvoice);
app.get("/ksef/invoices/:id/status", requireAuth, requirePermission("invoices:view"), KsefController.getStatus);
app.get("/ksef/invoices/:id/xml", requireAuth, requirePermission("invoices:view"), KsefController.getXml);
app.post("/ksef/invoices/:id/retry", requireAuth, requirePermission("invoices:create"), KsefController.retrySend);
app.get("/ksef/invoices/:id/upo", requireAuth, requirePermission("invoices:view"), KsefController.getUpo);
app.post("/ksef/send-bulk", requireAuth, requirePermission("invoices:create"), KsefController.sendBulk);
app.get("/ksef/settings", requireAuth, requirePermission("settings:view"), KsefController.getSettings);
app.put("/ksef/settings", requireAuth, requirePermission("settings:edit"), KsefController.updateSettings);
app.post("/ksef/test-connection", requireAuth, requirePermission("settings:edit"), KsefController.testConnection);

// ============================================

// ============================================
// PROFORMA ROUTES
// ============================================

app.get("/proforma", requireAuth, ProformaController.getAll);
app.get("/proforma/stats", requireAuth, ProformaController.getStats);
app.get("/proforma/expiring", requireAuth, ProformaController.getExpiring);
app.get("/proforma/expired", requireAuth, ProformaController.getExpired);
app.get("/proforma/:id/html", requireAuth, ProformaController.getHTML);
app.get("/proforma/:id/pdf", requireAuth, ProformaController.getPdf);
app.get("/proforma/:id", requireAuth, ProformaController.getById);
app.post("/proforma", requireAuth, requirePermission('invoices:create'), ProformaController.create);
app.post("/proforma/from-order/:orderId", requireAuth, requirePermission('invoices:create'), ProformaController.createFromOrder);
app.post("/proforma/:id/convert", requireAuth, requirePermission('invoices:create'), ProformaController.convertToInvoice);
app.post("/proforma/:id/clone", requireAuth, requirePermission('invoices:create'), ProformaController.clone);
app.delete("/proforma/:id", requireAuth, requirePermission('invoices:delete'), ProformaController.delete);
app.put("/proforma/:id", requireAuth, requirePermission('invoices:edit'), ProformaController.update);
app.patch("/proforma/:id/status", requireAuth, requirePermission('invoices:edit'), ProformaController.updateStatus);
app.post("/proforma/:id/send-email", requireAuth, requireRoleOrPermission([UserRole.POS], "invoices:view"), ProformaController.sendEmail);

// CUSTOMERS ROUTES
// ============================================

app.get('/customers', requireAuth, CustomerController.getAll);
app.get('/customers/:id', requireAuth, CustomerController.getById);
app.post('/customers', requireAuth, requireRoleOrPermission([UserRole.POS], 'customers:create'), CustomerController.create);
app.put('/customers/:id', requireAuth, requireRoleOrPermission([UserRole.POS], 'customers:edit'), CustomerController.update);
app.delete('/customers/:id', requireAuth, requirePermission('customers:delete'), CustomerController.delete);
app.post('/customers/lookup-nip', requireAuth, CustomerController.lookupNIP);

// Shop account management for customers
app.post("/customers/:id/shop-account", requireAuth, requirePermission('customers:edit'), CustomerController.createShopAccount);
app.delete("/customers/:id/shop-account", requireAuth, requirePermission('customers:edit'), CustomerController.removeShopAccount);
app.post("/customers/:id/shop-account/reset-password", requireAuth, requirePermission('customers:edit'), CustomerController.resetShopPassword);
app.post("/customers/:id/shop-account/send-credentials", requireAuth, requirePermission('customers:edit'), CustomerController.sendCredentialsEmail);
// Customer permanent delete
app.get("/customers/:id/related-data", requireAuth, requirePermission('customers:delete'), CustomerController.getRelatedData);
app.delete("/customers/:id/permanent", requireAuth, requirePermission('customers:delete'), CustomerController.permanentDelete);

// ============================================
// POS ROUTES
// ============================================

app.post('/pos/checkout', requireAuth, requirePermission('pos:checkout'), POSController.checkout);
app.get('/pos/today-completed', requireAuth, requirePermission('pos:access'), POSController.getTodayCompleted);
app.get("/pos/daily-report/pdf", requireAuth, requirePermission('pos:access'), POSController.getDailyReportPDF);

// ============================================
// RECEIPTS ROUTES
// ============================================

app.get('/receipts', requireAuth, ReceiptController.getAll);
app.get('/receipts/number/:receiptNumber', requireAuth, ReceiptController.getByReceiptNumber);
app.delete('/receipts/bulk', requireAuth, requirePermission('receipts:create'), ReceiptController.deleteBulk);
app.get("/receipts/:id/html", requireAuth, ReceiptController.getHTML);

// Confirmation receipt from order (for printing confirmation after invoice)
app.get("/orders/:id/confirmation-html", requireAuth, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ error: "Nieprawidlowe ID" });

    const order = await OrderModel.getById(orderId);
    if (!order) return res.status(404).json({ error: "Zamowienie nie znalezione" });

    const invoiceResult = await (await import('./models/database')).query(
      `SELECT i.invoice_number, i.payment_method, i.payment_splits
       FROM invoices i
       WHERE i.order_id = $1 AND (i.invoice_type = 'invoice' OR i.invoice_type IS NULL)
       LIMIT 1`,
      [orderId]
    );

    const settings = await SettingsModel.getCompanySettings();
    const invoice = invoiceResult.rows[0];
    const items = order.items || [];
    const totalAmount = Number(order.totalAmountAfterDiscount || order.totalAmount);
    const paymentMethod = invoice?.paymentMethod || 'cash';
    const paymentSplits = invoice?.paymentSplits;
    const documentNumber = invoice?.invoiceNumber || order.orderNumber;

    const formatDateFn = (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };
    const pmLabel = (m: string) => ({ card: 'Karta', cash: 'Gotowka', transfer: 'Przelew' }[m] || m);

    const discountPct = Number(order.discountPercentage || 0);

    const itemsHtml = items.map((item: any) => {
      const name = item.productSnapshot?.plantName || item.productName || 'Produkt';
      const qty = item.quantity || 1;
      const originalPrice = Number(item.unitPriceGross || 0);
      const discountedPrice = discountPct > 0
        ? Math.round(originalPrice * (1 - discountPct / 100) * 100) / 100
        : originalPrice;
      const discountedTotal = Math.round(discountedPrice * qty * 100) / 100;

      let row = '<tr style="border-bottom:' + (discountPct > 0 ? 'none' : '1px dotted #ddd') + '"><td style="padding:4px 2px">' + name + '</td><td style="text-align:center;font-weight:600">' + qty + '</td><td style="text-align:right">' + discountedPrice.toFixed(2) + '</td><td style="text-align:right;font-weight:600">' + discountedTotal.toFixed(2) + '</td></tr>';

      if (discountPct > 0) {
        const discountAmount = Math.round((originalPrice - discountedPrice) * qty * 100) / 100;
        row += '<tr style="border-bottom:1px dotted #ddd"><td colspan="4" style="padding:1px 2px 4px;font-size:9px;color:#666">  rabat -' + discountPct + '%: ' + originalPrice.toFixed(2) + ' -> ' + discountedPrice.toFixed(2) + ' (-' + discountAmount.toFixed(2) + ')</td></tr>';
      }

      return row;
    }).join('');

    let paymentHtml = '';
    if (paymentSplits && paymentSplits.length > 1) {
      paymentHtml = '<p style="font-size:13px;font-weight:600;margin-bottom:4px">Platnosc podzielona:</p>' +
        paymentSplits.map((s: any) => '<div style="display:flex;justify-content:space-between;font-size:13px"><span>' + pmLabel(s.paymentMethod) + ':</span><span>' + Number(s.amount).toFixed(2) + ' PLN</span></div>').join('');
    } else {
      paymentHtml = '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Forma platnosci:</span><span style="font-weight:600">' + pmLabel(paymentMethod) + '</span></div>';
    }

    const addr = [settings.street, (settings.postalCode || '') + ' ' + (settings.city || '')].filter(Boolean).join(', ');
    const now = formatDateFn(new Date());

    const html = '<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Potwierdzenie ' + documentNumber + '</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:77mm;margin:0;padding:0;font-family:"Courier New",Courier,monospace;font-weight:bold;font-size:13px;line-height:1.3;background:white;color:black}@media print{@page{size:77mm auto;margin:0}html,body{width:77mm;margin:0;padding:0}.receipt{width:77mm;max-width:77mm;padding:2mm;margin:0}}.receipt{width:77mm;max-width:77mm;margin:0;padding:8px;background:white}.header{text-align:center;border-bottom:2px dashed black;padding-bottom:8px;margin-bottom:8px}.header h1{font-size:15px;font-weight:bold;margin-bottom:2px}.header p{font-size:11px}.title{text-align:center;margin-bottom:8px}.title h2{font-size:13px;font-weight:bold}.date-section{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px;font-size:11px}.items-section{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}th{text-align:left;padding:2px 1px;border-bottom:1px solid #999;font-size:10px;white-space:nowrap;overflow:hidden}td{padding:2px 1px;font-size:11px;overflow:hidden;text-overflow:ellipsis}th:nth-child(1){width:45%}th:nth-child(2){text-align:center;width:15%}th:nth-child(3),th:nth-child(4){text-align:right;width:20%}.total-section{border-bottom:2px dashed black;padding-bottom:8px;margin-bottom:8px}.total{display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:bold}.payment-section{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px}.footer{text-align:center;font-size:11px;margin-top:8px}.footer p{margin-bottom:2px}.footer .timestamp{font-size:10px;color:#666;margin-top:6px;padding-top:6px;border-top:1px dotted #999}</style></head><body><div class="receipt"><div class="header"><h1>' + (settings.companyName || 'Firma') + '</h1><p>' + addr + '</p><p>NIP: ' + (settings.nip || '') + '</p>' + (settings.phone ? '<p>Tel: ' + settings.phone + '</p>' : '') + '</div><div class="title"><h2>POTWIERDZENIE SPRZEDAZY</h2><p style="font-weight:bold;font-size:12px">do ' + documentNumber + '</p><p style="font-size:11px">Zamowienie: ' + order.orderNumber + '</p></div><div class="date-section"><p>Data: ' + now + '</p></div><div class="items-section"><table><thead><tr><th>Nazwa</th><th>Szt</th><th>Cena</th><th>Wart</th></tr></thead><tbody>' + itemsHtml + '</tbody></table></div><div class="total-section"><div class="total"><span>SUMA:</span><span>' + totalAmount.toFixed(2) + ' PLN</span></div></div><div class="payment-section">' + paymentHtml + '</div><div class="footer"><p style="font-weight:600">Dziekujemy za zakupy!</p><p style="color:#666">Zapraszamy ponownie</p><div class="timestamp"><p>' + now + '</p></div></div></div></body></html>';

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error("Confirmation HTML error:", error);
    res.status(500).json({ error: "Blad generowania potwierdzenia" });
  }
});
app.get("/receipts/:id/pdf", requireAuth, ReceiptController.getPdf);
app.get('/receipts/:id', requireAuth, ReceiptController.getById);
app.put('/receipts/:id', requireAuth, requirePermission('receipts:create'), ReceiptController.update);
app.delete('/receipts/:id', requireAuth, requirePermission('receipts:create'), ReceiptController.delete);

// ============================================
// NIP LOOKUP ROUTES
// ============================================

app.get('/nip/lookup/:nip', requireAuth, NipController.lookup);
app.get('/nip/vat-status/:nip', requireAuth, NipController.checkVatStatus);

// ============================================
// REPORTS ROUTES (ADMIN only)
// ============================================

app.get('/reports/sales', requireAuth, requirePermission('reports:view'), ReportController.getSalesReport);
app.get('/reports/orders/status-stats', requireAuth, requirePermission('reports:view'), ReportController.getOrderStatusStats);
app.get('/reports/top-products', requireAuth, requirePermission('reports:view'), ReportController.getTopProducts);
app.get('/reports/revenue', requireAuth, requirePermission('reports:view'), ReportController.getRevenueSummary);
// Employee reports
app.get("/reports/employees", requireAuth, requirePermission('reports:view'), ReportController.getEmployeeSales);
app.get("/reports/employees/daily", requireAuth, requirePermission('reports:view'), ReportController.getEmployeeDailySales);

// Customer reports
app.get("/reports/customers", requireAuth, requirePermission('reports:view'), ReportController.getTopCustomers);
app.get("/reports/customers/stats", requireAuth, requirePermission('reports:view'), ReportController.getCustomerStats);

// Document type reports
app.get("/reports/documents", requireAuth, requirePermission('reports:view'), ReportController.getDocumentTypeStats);
app.get("/reports/documents/daily", requireAuth, requirePermission('reports:view'), ReportController.getDocumentTypeDailyStats);

// Payment reports
app.get("/reports/payments", requireAuth, requirePermission('reports:view'), ReportController.getPaymentStats);
app.get("/reports/payments/aging", requireAuth, requirePermission('reports:view'), ReportController.getAgingReport);
app.get("/reports/payments/methods", requireAuth, requirePermission('reports:view'), ReportController.getPaymentMethodStats);
app.get("/reports/payments/overdue", requireAuth, requirePermission('reports:view'), ReportController.getOverdueInvoices);

// Product category reports
app.get("/reports/products/by-pot-size", requireAuth, requirePermission('reports:view'), ReportController.getSalesByPotSize);
app.get("/reports/trends/monthly", requireAuth, requirePermission('reports:view'), ReportController.getMonthlySalesTrend);

// KPI Dashboard
app.get("/reports/kpi", requireAuth, requirePermission('reports:view'), ReportController.getKPIComparison);

// Employee reports
app.get("/reports/employees", requireAuth, requirePermission('reports:view'), ReportController.getEmployeeSales);
app.get("/reports/employees/daily", requireAuth, requirePermission('reports:view'), ReportController.getEmployeeDailySales);

// Customer reports
app.get("/reports/customers", requireAuth, requirePermission('reports:view'), ReportController.getTopCustomers);
app.get("/reports/customers/stats", requireAuth, requirePermission('reports:view'), ReportController.getCustomerStats);

// Document type reports
app.get("/reports/documents", requireAuth, requirePermission('reports:view'), ReportController.getDocumentTypeStats);
app.get("/reports/documents/daily", requireAuth, requirePermission('reports:view'), ReportController.getDocumentTypeDailyStats);

// Payment reports
app.get("/reports/payments", requireAuth, requirePermission('reports:view'), ReportController.getPaymentStats);
app.get("/reports/payments/aging", requireAuth, requirePermission('reports:view'), ReportController.getAgingReport);
app.get("/reports/payments/methods", requireAuth, requirePermission('reports:view'), ReportController.getPaymentMethodStats);
app.get("/reports/payments/overdue", requireAuth, requirePermission('reports:view'), ReportController.getOverdueInvoices);

// Product category reports
app.get("/reports/products/by-pot-size", requireAuth, requirePermission('reports:view'), ReportController.getSalesByPotSize);
app.get("/reports/trends/monthly", requireAuth, requirePermission('reports:view'), ReportController.getMonthlySalesTrend);

// KPI Dashboard
app.get("/reports/kpi", requireAuth, requirePermission('reports:view'), ReportController.getKPIComparison);

// ============================================
// USERS ROUTES (ADMIN only)
// ============================================

app.get('/users', requireAuth, requirePermission('users:view'), UserController.getAll);
app.get('/users/:id', requireAuth, requirePermission('users:view'), UserController.getById);
app.post('/users', requireAuth, requirePermission('users:create'), UserController.create);
app.put('/users/:id', requireAuth, requirePermission('users:edit'), UserController.update);
app.delete('/users/:id', requireAuth, requirePermission('users:delete'), UserController.delete);
app.patch('/users/:id/toggle-active', requireAuth, requirePermission('users:edit'), UserController.toggleActive);
app.patch('/users/:id/change-password', requireAuth, requirePermission('users:edit'), UserController.changePassword);
app.get('/users/:id/related-data', requireAuth, requirePermission('users:delete'), UserController.getRelatedData);
app.delete('/users/:id/permanent', requireAuth, requirePermission('users:delete'), UserController.permanentDelete);

// ============================================
// LOGIN HISTORY ROUTES (ADMIN only)
// ============================================

app.get('/login-history', requireAuth, requirePermission('users:view'), LoginHistoryController.getAll);
app.get('/login-history/stats', requireAuth, requirePermission('users:view'), LoginHistoryController.getStats);
app.get('/login-history/export', requireAuth, requirePermission('users:view'), LoginHistoryController.exportCsv);
app.get('/login-history/user/:userId', requireAuth, requirePermission('users:view'), LoginHistoryController.getByUserId);

// ============================================
// PERMISSION PROFILES ROUTES
// ============================================

app.get("/permission-profiles", requireAuth, requirePermission('profiles:view'), PermissionProfileController.getAll);
app.get("/permission-profiles/permissions", requireAuth, requirePermission('profiles:view'), PermissionProfileController.getAvailablePermissions);
app.get("/permission-profiles/:id", requireAuth, requirePermission('profiles:view'), PermissionProfileController.getById);
app.post("/permission-profiles", requireAuth, requirePermission('profiles:create'), PermissionProfileController.create);
app.put("/permission-profiles/:id", requireAuth, requirePermission('profiles:edit'), PermissionProfileController.update);
app.delete("/permission-profiles/:id", requireAuth, requirePermission('profiles:delete'), PermissionProfileController.delete);

// ============================================
// PRICE GROUPS ROUTES (ADMIN only)
// ============================================

app.get('/price-groups', requireAuth, PriceGroupController.getAll);
app.get('/price-groups/:id', requireAuth, PriceGroupController.getById);
app.get('/price-groups/:id/customers', requireAuth, PriceGroupController.getCustomers);
app.post('/price-groups', requireAuth, requirePermission('settings:edit'), PriceGroupController.create);
app.put('/price-groups/:id', requireAuth, requirePermission('settings:edit'), PriceGroupController.update);
app.delete('/price-groups/:id', requireAuth, requirePermission('settings:edit'), PriceGroupController.delete);

// ============================================
// SETTINGS ROUTES (ADMIN only)
// ============================================

app.get('/settings', requireAuth, requirePermission('settings:view'), SettingsController.getAllSettings);
app.get('/settings/pricing', requireAuth, requirePermission('settings:view'), SettingsController.getPricingSettings);
app.put('/settings/pricing', requireAuth, requirePermission('settings:edit'), SettingsController.updatePricingSettings);
app.get("/settings/company", requireAuth, requirePermission('settings:view'), SettingsController.getCompanySettings);
app.put("/settings/company", requireAuth, requirePermission('settings:edit'), SettingsController.updateCompanySettings);

// Email Import Settings
app.get("/settings/email-import", requireAuth, requirePermission('settings:view'), SettingsController.getEmailImportSettings);
app.put("/settings/email-import", requireAuth, requirePermission('settings:edit'), SettingsController.updateEmailImportSettings);

// Manualna synchronizacja email importu
app.post("/settings/email-import/sync", requireAuth, requirePermission('settings:edit'), async (req: Request, res: Response) => {
  try {
    console.log("[API] Manual email sync triggered by user: " + (req as any).user?.email);
    const emailImportService = new EmailImportService();
    const result = await emailImportService.syncEmails();
    res.json({ success: true, result });
  } catch (error: any) {
    console.error("[API] Email sync error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force sync email import (last 24h, SEEN + UNSEEN)
app.post("/settings/email-import/sync-force", requireAuth, requirePermission("settings:edit"), async (req: Request, res: Response) => {
  try {
    console.log("[API] Force email sync (24h) triggered by user: " + (req as any).user?.email);
    const emailImportService = new EmailImportService();
    const result = await emailImportService.syncEmailsForce();
    res.json({ success: true, result });
  } catch (error: any) {
    console.error("[API] Force email sync error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send order to Polflor via email
app.post("/orders/:id/send-polflor", requireAuth, requirePermission('orders:edit'), sendOrderToPolflor);

// SMTP Send Settings
app.get("/settings/smtp-send", requireAuth, requirePermission("settings:view"), SettingsController.getSmtpSendSettings);
app.put("/settings/smtp-send", requireAuth, requirePermission("settings:edit"), SettingsController.updateSmtpSendSettings);
app.post("/settings/smtp-send/test", requireAuth, requirePermission("settings:edit"), SettingsController.testSmtpSendSettings);

// ============================================
// LOSSES ROUTES (Admin only)
// ============================================
app.get("/losses", requireAuth, requirePermission('inventory:delete'), LossesController.getAll);
app.post("/losses", requireAuth, requirePermission('inventory:delete'), LossesController.create);
app.get("/losses/stats", requireAuth, requirePermission('inventory:delete'), LossesController.getStats);
app.post("/losses/:id/reverse", requireAuth, requirePermission('inventory:delete'), LossesController.reverse);
app.get('/settings/:key', requireAuth, requirePermission('settings:view'), SettingsController.getSettingByKey);
app.put('/settings/:key', requireAuth, requirePermission('settings:edit'), SettingsController.updateSetting);
// ============================================
// ============================================
// GROWER PASSPORTS ROUTES
// ============================================
app.get("/grower-passports", requireAuth, growerPassportController.getAll);
app.get("/grower-passports/map", requireAuth, growerPassportController.getMap);
app.get("/grower-passports/grower/:growerName", requireAuth, growerPassportController.getByGrowerName);
app.post("/grower-passports", requireAuth, requirePermission('inventory:edit'), growerPassportController.upsert);
app.post("/grower-passports/bulk", requireAuth, requirePermission('inventory:edit'), growerPassportController.bulkUpsert);
app.delete("/grower-passports/:id", requireAuth, requirePermission('inventory:edit'), growerPassportController.delete);
app.post("/grower-passports/import", requireAuth, requirePermission('inventory:edit'), growerPassportController.bulkImport);
app.get("/grower-passports/floricode-map", requireAuth, growerPassportController.getFloricodeMap);
app.get("/grower-passports/floricode/:floricode", requireAuth, growerPassportController.getByFloricode);
app.delete("/grower-passports", requireAuth, requirePermission('inventory:edit'), growerPassportController.deleteAll);
app.post("/grower-passports/update-products", requireAuth, requirePermission('inventory:edit'), growerPassportController.updateProductsWithGrowerNames);

// Tags management
app.get("/tags", requireAuth, TagsController.getAllTags);
app.post("/tags", requireAuth, requirePermission('inventory:edit'), TagsController.createTag);
app.put("/tags/:tagName", requireAuth, requirePermission('inventory:edit'), TagsController.updateTag);
app.delete("/tags/:tagName", requireAuth, requirePermission('inventory:edit'), TagsController.deleteTag);

// PRINT TEMPLATES ROUTES
// ============================================

app.get('/print-templates', requireAuth, PrintTemplateController.getAll);
app.get('/print-templates/default/:type', requireAuth, PrintTemplateController.getDefaultByType);
app.get('/print-templates/:id', requireAuth, PrintTemplateController.getById);
app.post('/print-templates', requireAuth, requirePermission('settings:edit'), PrintTemplateController.create);
app.put('/print-templates/:id', requireAuth, requirePermission('settings:edit'), PrintTemplateController.update);
app.delete('/print-templates/:id', requireAuth, requirePermission('settings:edit'), PrintTemplateController.delete);
app.post('/print-templates/:id/set-default', requireAuth, requirePermission('settings:edit'), PrintTemplateController.setAsDefault);
app.post('/print-templates/:id/duplicate', requireAuth, PrintTemplateController.duplicate);
app.post('/print-templates/:id/render', requireAuth, PrintTemplateController.renderPdf);


// ============================================
// MIGRATION ROUTES (ADMIN only - temporary)
// ============================================

app.post('/migration/run-settings', requireAuth, requirePermission('settings:edit'), MigrationController.runSettingsMigration);

// ============================================
// SHOP ROUTES (public catalog)
// ============================================

// Shop website settings (public - for catalog tabs)
app.get('/shop/settings', async (req: Request, res: Response) => {
  try {
    const { SettingsModel } = await import('./models/Settings');
    
    const tab1Enabled = await SettingsModel.getSetting('shop_tab_1_enabled');
    const tab1Name = await SettingsModel.getSetting('shop_tab_1_name');
    const tab1Tag = await SettingsModel.getSetting('shop_tab_1_tag');
    const tab1Color = await SettingsModel.getSetting('shop_tab_1_color');
    
    const tab2Enabled = await SettingsModel.getSetting('shop_tab_2_enabled');
    const tab2Name = await SettingsModel.getSetting('shop_tab_2_name');
    const tab2Tag = await SettingsModel.getSetting('shop_tab_2_tag');
    const tab2Color = await SettingsModel.getSetting('shop_tab_2_color');
    
    const tabs = [];
    
    if (tab1Enabled === 'true' && tab1Name && tab1Tag) {
      tabs.push({ id: 1, name: tab1Name, tag: tab1Tag, color: tab1Color || '#16a34a' });
    }
    
    if (tab2Enabled === 'true' && tab2Name && tab2Tag) {
      tabs.push({ id: 2, name: tab2Name, tag: tab2Tag, color: tab2Color || '#16a34a' });
    }
    
    res.json({ tabs });
  } catch (error) {
    console.error('Error fetching shop settings:', error);
    res.status(500).json({ error: 'Błąd pobierania ustawień sklepu' });
  }
});

app.get('/shop/catalog', optionalAuth, ShopController.getCatalog);
app.post('/shop/cart/checkout', requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], 'shop:order'), ShopController.checkout);
// Cart API - sync cart across devices
app.get('/shop/cart', requireAuth, ShopController.getCart);
app.put('/shop/cart', requireAuth, ShopController.saveCart);
app.delete('/shop/cart', requireAuth, ShopController.clearCart);
// Shop - additional routes
app.get('/shop/products/:id', optionalAuth, ShopController.getProduct);
app.get('/shop/my-orders', requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], 'shop:view'), ShopController.getMyOrders);
app.get('/shop/my-orders/:id', requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], 'shop:view'), ShopController.getMyOrder);
app.get('/shop/my-invoices', requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], 'shop:view'), ShopController.getMyInvoices);
app.get("/shop/my-invoices/:id", requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], "shop:view"), ShopController.getMyInvoice);
app.get('/shop/my-invoices/:id/pdf', requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], 'shop:view'), ShopController.getMyInvoicePdf);
app.get('/shop/profile', requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], 'shop:view'), ShopController.getCustomerProfile);
app.get('/shop/customers', requireAuth, requireRoleOrPermission([], 'shop:order'), ShopController.getCustomersForShop);
app.post('/shop/change-password', requireAuth, ShopController.changeMyPassword);
app.get('/shop/scan/:barcode', requireAuth, requireRoleOrPermission([UserRole.CUSTOMER], 'shop:view'), ShopController.scanBarcode);

// ============================================
// MOBILE ROUTES
// ============================================

app.post('/mobile/scan-barcode', requireAuth, requirePermission('scanner:scan'), InventoryController.scanBarcode);
app.get('/mobile/orders', requireAuth, requirePermission('scanner:access'), OrderController.getAll);
app.get("/mobile/search-products", requireAuth, requirePermission('scanner:access'), InventoryController.getAll);

// ============================================
// IMAGE PROXY (for Excel export)
// ============================================

app.get("/image-proxy", requireAuth, async (req: Request, res: Response) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      res.status(400).json({ error: "Brak parametru url" });
      return;
    }

    // Only allow specific domains for security
    const allowedDomains = [
      "beeldbankfotos.royalfloraholland.com",
      "p2.1ps.nl"
    ];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      res.status(400).json({ error: "Nieprawidłowy URL" });
      return;
    }

    if (!allowedDomains.some(domain => parsedUrl.hostname.includes(domain))) {
      res.status(403).json({ error: "Domena nie jest dozwolona" });
      return;
    }

    // Fetch the image using native https/http
    const https = await import("https");
    const http = await import("http");
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    protocol.get(imageUrl, (imageRes) => {
      if (imageRes.statusCode !== 200) {
        res.status(imageRes.statusCode || 500).json({ error: "Nie udało się pobrać obrazka" });
        return;
      }
      res.set("Content-Type", imageRes.headers["content-type"] || "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      imageRes.pipe(res);
    }).on("error", (err) => {
      console.error("Image proxy error:", err);
      res.status(500).json({ error: "Błąd pobierania obrazka" });
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(500).json({ error: "Błąd proxy obrazka" });
  }
});
// ============================================
// ============================================
// OPTIMIZED IMAGE API (with caching and compression)
// ============================================

// Get optimized image by barcode and size
app.get("/images/:barcode/:size", async (req: Request, res: Response) => {
  try {
    const { barcode, size } = req.params;
    
    // Validate size parameter
    const validSizes: ImageSize[] = ["thumb", "medium", "full"];
    if (!validSizes.includes(size as ImageSize)) {
      res.status(400).json({ error: "Invalid size. Use: thumb, medium, or full" });
      return;
    }
    
    // Get product to find image URL
    const { ProductModel } = await import("./models/Product");
    const product = await ProductModel.getByBarcode(barcode);
    
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    
    if (!product.imageUrl) {
      res.status(404).json({ error: "Product has no image" });
      return;
    }

    // Check if cached version exists first (for both local and external images)
    const fs = await import("fs");
    const path = await import("path");
    const cacheDir = path.default.join(__dirname, "../uploads/cache", barcode.replace(/[^a-zA-Z0-9]/g, "_"));
    const cachePath = path.default.join(cacheDir, size + ".webp");
    
    // Try to serve from cache first
    if (fs.default.existsSync(cachePath)) {
      const imageBuffer = fs.default.readFileSync(cachePath);
      res.set("Content-Type", "image/webp");
      res.set("Cache-Control", "public, max-age=300, must-revalidate");
      res.set("ETag", `"${barcode}-${size}-${imageBuffer.length}"`);
      res.send(imageBuffer);
      return;
    }
    
    // No cache - check if external URL to fetch and cache
    const isExternalUrl = product.imageUrl.startsWith("http://") || product.imageUrl.startsWith("https://");
    
    if (!isExternalUrl) {
      // For local images without cache, redirect to original
      res.redirect(product.imageUrl);
      return;
    }
    
    // Get or generate optimized image for external URLs
    const imageBuffer = await ImageService.getImage(barcode, size as ImageSize, product.imageUrl);
    
    if (!imageBuffer) {
      // If processing fails, redirect to original image
      res.redirect(product.imageUrl);
      return;
    }
    
    // Send WebP image with caching headers (short cache, must revalidate)
    res.set("Content-Type", "image/webp");
    res.set("Cache-Control", "public, max-age=300, must-revalidate"); // 5 minutes, then revalidate
    res.set("ETag", `"${barcode}-${size}-${imageBuffer.length}"`);
    res.send(imageBuffer);
  } catch (error) {
    console.error("Image API error:", error);
    res.status(500).json({ error: "Image processing failed" });
  }
});

app.post("/images/:barcode/cache", requireAuth, requirePermission("inventory:edit"), async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;
    
    const { ProductModel } = await import("./models/Product");
    const product = await ProductModel.getByBarcode(barcode);
    
    if (!product || !product.imageUrl) {
      res.status(404).json({ error: "Product not found or has no image" });
      return;
    }
    
    const success = await ImageService.processAndCache(barcode, product.imageUrl);
    
    if (success) {
      res.json({ message: "Image cached successfully", barcode });
    } else {
      res.status(500).json({ error: "Failed to cache image" });
    }
  } catch (error) {
    console.error("Cache image error:", error);
    res.status(500).json({ error: "Failed to cache image" });
  }
});

// Get cache statistics (admin only)
app.get("/images/cache/stats", requireAuth, requirePermission("inventory:view"), async (req: Request, res: Response) => {
  try {
    const stats = ImageService.getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error("Cache stats error:", error);
    res.status(500).json({ error: "Failed to get cache stats" });
  }
});

// Clean old cache (admin only)
app.post("/images/cache/clean", requireAuth, requirePermission("inventory:edit"), async (req: Request, res: Response) => {
  try {
    const result = await ImageService.cleanOldCache();
    res.json({ message: "Cache cleaned", ...result });
  } catch (error) {
    console.error("Cache clean error:", error);
    res.status(500).json({ error: "Failed to clean cache" });
  }
});


// PRINT SYSTEM ROUTES
// ============================================

app.use('/print', printRouter);
app.use('/invoice-corrections', invoiceCorrectionRouter);

// ============================================
// START SERVER
// ============================================

const httpServer = createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Extended WSClient interface to track user details
interface WSClient extends WebSocket {
  userId?: number;
  userEmail?: string;
  userRole?: string;
  connectedAt?: Date;
  subscriptions?: Set<string>;
}

// Parse user agent to extract device info
const parseUserAgent = (ua: string): { device: string; browser: string; os: string } => {
  if (!ua) return { device: 'Nieznane', browser: '', os: '' };

  let device = 'Komputer';
  let os = '';
  let browser = '';

  // OS detection
  if (/iPhone/.test(ua)) { os = 'iOS'; device = 'iPhone'; }
  else if (/iPad/.test(ua)) { os = 'iPadOS'; device = 'iPad'; }
  else if (/Android/.test(ua)) {
    os = 'Android';
    device = /Mobile/.test(ua) ? 'Telefon' : 'Tablet';
  }
  else if (/Mac OS X/.test(ua)) { os = 'macOS'; }
  else if (/Windows/.test(ua)) { os = 'Windows'; }
  else if (/Linux/.test(ua)) { os = 'Linux'; }

  // Browser detection
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  return { device, browser, os };
};

// Helper function to get online users based on DB sessions (last_activity within threshold)
const ONLINE_THRESHOLD_MINUTES = 10;

const getOnlineUsers = async () => {
  try {
    const dbResult = await SessionModel.getOnlineUsers(ONLINE_THRESHOLD_MINUTES);

    // Enrich sessions with parsed user agent info
    const enrichSessions = (sessions: any[]) =>
      sessions.map(s => {
        const parsed = parseUserAgent(s.userAgent || '');
        return {
          sessionId: s.sessionId,
          device: parsed.device,
          browser: parsed.browser,
          os: parsed.os,
          ipAddress: s.ipAddress || '',
          source: s.source || 'panel',
          createdAt: s.createdAt,
          lastActivity: s.lastActivity,
        };
      });

    return {
      employees: dbResult.employees.map(u => ({ ...u, sessions: enrichSessions(u.sessions) })),
      customers: dbResult.customers.map(u => ({ ...u, sessions: enrichSessions(u.sessions) })),
    };
  } catch (err) {
    console.error('[OnlineUsers] Error fetching from DB:', err);
    return { employees: [], customers: [] };
  }
};

// Broadcast user status to all admins subscribed to 'online-users' channel
const broadcastOnlineUsers = async () => {
  const onlineUsers = await getOnlineUsers();
  wss.clients.forEach((client) => {
    const wsClient = client as WSClient;
    if (wsClient.readyState === WebSocket.OPEN && wsClient.subscriptions?.has('online-users')) {
      wsClient.send(JSON.stringify({
        type: 'online-users:update',
        data: onlineUsers
      }));
    }
  });
};

wss.on('connection', (ws: WSClient) => {
  console.log('WebSocket client connected');

  ws.subscriptions = new Set();
  ws.connectedAt = new Date();

  ws.on('message', async (message: string) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'auth':
          try {
            if (!data.token) {
              ws.send(JSON.stringify({ type: 'auth:failed', error: 'Token nie został podany' }));
              return;
            }

            // Verify JWT token
            const decoded = jwt.verify(data.token, JWT_SECRET) as JWTPayload;

            // Validate session
            if (decoded.sessionId) {
              const sessionValid = await SessionModel.isValid(decoded.sessionId);
              if (!sessionValid) {
                ws.send(JSON.stringify({ type: 'auth:failed', error: 'Sesja zakończona' }));
                ws.close();
                return;
              }
            }

            // Store user info in WSClient
            ws.userId = decoded.userId;
            ws.userEmail = decoded.email;
            ws.userRole = decoded.role;

            console.log('[WebSocket] User authenticated:', decoded.email, '(userId:', decoded.userId, ', role:', decoded.role, ')');
            ws.send(JSON.stringify({ type: 'auth:success', userId: decoded.userId }));

            // Update activity on WS auth
            SessionModel.updateActivityByUserId(decoded.userId).catch(() => {});

            // Broadcast updated online users list
            broadcastOnlineUsers();
          } catch (error) {
            console.error('[WebSocket] Authentication failed:', error);
            if (error instanceof jwt.TokenExpiredError) {
              ws.send(JSON.stringify({ type: 'auth:failed', error: 'Token wygasł' }));
            } else if (error instanceof jwt.JsonWebTokenError) {
              ws.send(JSON.stringify({ type: 'auth:failed', error: 'Nieprawidłowy token' }));
            } else {
              ws.send(JSON.stringify({ type: 'auth:failed', error: 'Błąd autoryzacji' }));
            }
          }
          break;

        case 'subscribe':
          if (!ws.userId) {
            ws.send(JSON.stringify({ type: 'error', error: 'Wymagana autoryzacja' }));
            return;
          }
          if (data.channel) {
            ws.subscriptions?.add(data.channel);
            console.log('[WebSocket] User', ws.userId, 'subscribed to channel:', data.channel);
            ws.send(JSON.stringify({ type: 'subscribe:success', channel: data.channel }));

            // If subscribing to online-users, send current list immediately
            if (data.channel === 'online-users') {
              const onlineUsers = await getOnlineUsers();
              ws.send(JSON.stringify({
                type: 'online-users:update',
                data: onlineUsers
              }));
            }
          }
          break;

        case 'unsubscribe':
          if (data.channel) {
            ws.subscriptions?.delete(data.channel);
            console.log('[WebSocket] User', ws.userId, 'unsubscribed from channel:', data.channel);
            ws.send(JSON.stringify({ type: 'unsubscribe:success', channel: data.channel }));
          }
          break;

        case 'get-online-users':
          if (!ws.userId) {
            ws.send(JSON.stringify({ type: 'error', error: 'Wymagana autoryzacja' }));
            return;
          }
          const onlineUsersData = await getOnlineUsers();
          ws.send(JSON.stringify({
            type: 'online-users:update',
            data: onlineUsersData
          }));
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    const wasAuthenticated = ws.userId;
    console.log('WebSocket client disconnected', wasAuthenticated ? `(userId: ${ws.userId})` : '');

    // Broadcast updated online users list if this was an authenticated user
    if (wasAuthenticated) {
      // Small delay to ensure the client is removed from the list
      setTimeout(() => {
        broadcastOnlineUsers();
      }, 100);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Broadcast function for WebSocket events
export const broadcast = (channel: string, data: any) => {
  wss.clients.forEach((client) => {
    const wsClient = client as WSClient;
    if (wsClient.readyState === WebSocket.OPEN && wsClient.subscriptions?.has(channel)) {
      wsClient.send(JSON.stringify(data));
    }
  });
};

// ============================================
// ONLINE USERS API ENDPOINT
// ============================================

app.get('/online-users', requireAuth, requirePermission('users:view'), async (_req: Request, res: Response) => {
  const onlineUsers = await getOnlineUsers();
  res.json(onlineUsers);
});

// ============================================
// SESSION HEARTBEAT ENDPOINT
// ============================================

app.post('/sessions/heartbeat', requireAuth, async (req: any, res: Response) => {
  try {
    const sessionId = req.user?.sessionId;
    if (sessionId) {
      await SessionModel.updateActivity(sessionId);
    }
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// Periodic broadcast of online users list (every 30 seconds)
setInterval(async () => {
  try {
    await broadcastOnlineUsers();
  } catch (error) {
    console.error('[OnlineUsers] Periodic broadcast error:', error);
  }
}, 30_000);

// ============================================
// ERROR HANDLING
// ============================================

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint nie znaleziony' });
});

app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
});

// Initialize email service
emailService.initialize();


// Session cleanup - every hour
setInterval(async () => {
  try {
    const cleaned = await SessionModel.cleanExpired();
    if (cleaned > 0) {
      console.log(`[Session] Cleaned ${cleaned} expired/inactive sessions`);
    }
  } catch (error) {
    console.error('[Session] Cleanup error:', error);
  }
}, 60 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`🚀 PlantManager Backend running on port ${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}/ws`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);

  // Start cron jobs
  const cronService = new CronService();
  cronService.start();
});

export default app;
