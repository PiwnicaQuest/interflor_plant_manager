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
import { InventoryController } from './controllers/inventory.controller';
import { OrderController } from './controllers/order.controller';
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

// Recalculate all prices based on current settings
app.post("/inventory/recalculate-prices", requireAuth, requirePermission('settings:edit'), InventoryController.recalculateAllPrices);

// ============================================
// INVENTORY MOVEMENTS ROUTES
// ============================================

app.get('/inventory-movements', requireAuth, requirePermission('inventory:view'), InventoryMovementController.getAll);
app.get('/inventory-movements/statistics', requireAuth, requirePermission('inventory:view'), InventoryMovementController.getStatistics);
app.get('/inventory-movements/product/:productId', requireAuth, requirePermission('inventory:view'), InventoryMovementController.getByProduct);
app.delete("/inventory-movements/:id", requireAuth, InventoryMovementController.hide);
app.delete("/inventory-movements", requireAuth, InventoryMovementController.hideMany);

// ============================================
// ORDERS ROUTES
// ============================================

app.get('/orders', requireAuth, OrderController.getAll);
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
app.post('/invoices/:id/send-email', requireAuth, requirePermission('invoices:view'), InvoiceController.sendEmail);
app.get("/invoices/:id/html", requireAuth, InvoiceController.getHTML);
app.patch("/invoices/:id/payment-method", requireAuth, requirePermission('invoices:edit'), InvoiceController.updatePaymentMethod);
app.get("/invoices/:id/audit-log", requireAuth, requirePermission('invoices:view'), InvoiceController.getAuditLog);

// ============================================

// ============================================
// PROFORMA ROUTES
// ============================================

app.get("/proforma", requireAuth, ProformaController.getAll);
app.get("/proforma/stats", requireAuth, ProformaController.getStats);
app.get("/proforma/expiring", requireAuth, ProformaController.getExpiring);
app.get("/proforma/expired", requireAuth, ProformaController.getExpired);
app.get("/proforma/:id/html", requireAuth, ProformaController.getHTML);
app.get("/proforma/:id", requireAuth, ProformaController.getById);
app.post("/proforma", requireAuth, requirePermission('invoices:create'), ProformaController.create);
app.post("/proforma/from-order/:orderId", requireAuth, requirePermission('invoices:create'), ProformaController.createFromOrder);
app.post("/proforma/:id/convert", requireAuth, requirePermission('invoices:create'), ProformaController.convertToInvoice);
app.post("/proforma/:id/clone", requireAuth, requirePermission('invoices:create'), ProformaController.clone);
app.delete("/proforma/:id", requireAuth, requirePermission('invoices:delete'), ProformaController.delete);
app.put("/proforma/:id", requireAuth, requirePermission('invoices:edit'), ProformaController.update);
app.patch("/proforma/:id/status", requireAuth, requirePermission('invoices:edit'), ProformaController.updateStatus);
app.post("/proforma/:id/send-email", requireAuth, requirePermission('invoices:view'), ProformaController.sendEmail);

// CUSTOMERS ROUTES
// ============================================

app.get('/customers', requireAuth, CustomerController.getAll);
app.get('/customers/:id', requireAuth, CustomerController.getById);
app.post('/customers', requireAuth, requirePermission('customers:create'), CustomerController.create);
app.put('/customers/:id', requireAuth, requirePermission('customers:edit'), CustomerController.update);
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
app.get("/receipts/:id/html", requireAuth, ReceiptController.getHTML);
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
        res.status(imageRes.statusCode || 500).json({ error: "Nie udalo sie pobrac obrazka" });
        return;
      }
      res.set("Content-Type", imageRes.headers["content-type"] || "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      imageRes.pipe(res);
    }).on("error", (err) => {
      console.error("Image proxy error:", err);
      res.status(500).json({ error: "Blad pobierania obrazka" });
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(500).json({ error: "Blad proxy obrazka" });
  }
});

// ============================================
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

// Helper function to get online users (deduplicated by userId)
const getOnlineUsers = () => {
  const employeesMap = new Map<number, { userId: number; email: string; role: string; connectedAt: Date }>();
  const customersMap = new Map<number, { userId: number; email: string; role: string; connectedAt: Date }>();

  wss.clients.forEach((client) => {
    const wsClient = client as WSClient;
    if (wsClient.readyState === WebSocket.OPEN && wsClient.userId && wsClient.userEmail) {
      const userInfo = {
        userId: wsClient.userId,
        email: wsClient.userEmail,
        role: wsClient.userRole || 'unknown',
        connectedAt: wsClient.connectedAt || new Date()
      };

      const targetMap = wsClient.userRole === 'customer' ? customersMap : employeesMap;

      // Only add if not already present, or update if this connection is older (first connection)
      const existing = targetMap.get(wsClient.userId);
      if (!existing || userInfo.connectedAt < existing.connectedAt) {
        targetMap.set(wsClient.userId, userInfo);
      }
    }
  });

  return {
    employees: Array.from(employeesMap.values()),
    customers: Array.from(customersMap.values())
  };
};

// Broadcast user status to all admins subscribed to 'online-users' channel
const broadcastOnlineUsers = () => {
  const onlineUsers = getOnlineUsers();
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

  ws.on('message', (message: string) => {
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

            // Store user info in WSClient
            ws.userId = decoded.userId;
            ws.userEmail = decoded.email;
            ws.userRole = decoded.role;

            console.log('[WebSocket] User authenticated:', decoded.email, '(userId:', decoded.userId, ', role:', decoded.role, ')');
            ws.send(JSON.stringify({ type: 'auth:success', userId: decoded.userId }));

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
              const onlineUsers = getOnlineUsers();
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
          const onlineUsers = getOnlineUsers();
          ws.send(JSON.stringify({
            type: 'online-users:update',
            data: onlineUsers
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

app.get('/online-users', requireAuth, requirePermission('users:view'), (_req: Request, res: Response) => {
  const onlineUsers = getOnlineUsers();
  res.json(onlineUsers);
});

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

httpServer.listen(PORT, () => {
  console.log(`🚀 PlantManager Backend running on port ${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}/ws`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);

  // Start cron jobs
  const cronService = new CronService();
  cronService.start();
});

export default app;
