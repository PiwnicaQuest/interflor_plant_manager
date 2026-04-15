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
import { InventoryImportController, pdfUpload } from './controllers/inventoryImport.controller';
import { generateJpkV7M } from './utils/jpkGenerator';
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

// ============================================
// REQUEST LOGGER MIDDLEWARE
// ============================================
app.use((req: any, res: any, next: any) => {
  const start = Date.now();
  const reqId = Math.random().toString(36).substring(2, 8);
  const path = req.path;

  // Skip noisy/static endpoints
  if (path === '/health' || path.startsWith('/uploads') || path.startsWith('/downloads')) {
    return next();
  }

  console.log(`[REQ ${reqId}] -> ${req.method} ${path}`);

  res.on('finish', () => {
    const dur = Date.now() - start;
    const tag = res.statusCode >= 500 ? 'ERR' : res.statusCode >= 400 ? 'WARN' : 'OK';
    console.log(`[REQ ${reqId}] <- ${tag} ${res.statusCode} ${dur}ms ${req.method} ${path}`);
  });

  next();
});


// Health check (detailed)
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbStart = Date.now();
    const { pool } = require('./models/database');
    await pool.query('SELECT 1');
    const dbMs = Date.now() - dbStart;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      db: { responseMs: dbMs, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
    });
  } catch (e: any) {
    res.status(503).json({ status: 'error', error: e.message, timestamp: new Date().toISOString() });
  }
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

// AI PDF Import routes
app.post("/inventory/import-pdf", requireAuth, requirePermission('inventory:create'), pdfUpload.single('file'), InventoryImportController.parseInvoicePdf);
app.post("/inventory/import-pdf/confirm", requireAuth, requirePermission('inventory:create'), InventoryImportController.confirmImport);
app.get("/settings/ai-import", requireAuth, requirePermission('settings:view'), InventoryImportController.getSettings);
app.put("/settings/ai-import", requireAuth, requirePermission('settings:edit'), InventoryImportController.updateSettings);
app.post("/settings/ai-import/test", requireAuth, requirePermission('settings:edit'), InventoryImportController.testConnection);

// === TEST: Document templates preview with discounts ===
app.get("/test-wzory/:type", async (req: any, res: any) => {
  const type = req.params.type;

  // Sample data
  const company = { name: 'INTERFLOR Export-Import Paweł Jaros', nip: '8321995551', street: 'Krzyworzeka 150', postalCode: '98-345', city: 'Mokrsko', bank: 'PKO BP S.A.', account: '84 1020 4564 0000 5902 0395 8071' };
  const buyer = { name: 'Kwiaciarnia Flora Sp. z o.o.', nip: '1234567890', street: 'ul. Kwiatowa 15', postalCode: '00-001', city: 'Warszawa' };
  const items = [
    { name: 'Lavandula stoechas BUSH D14', qty: 80, origPrice: 12.96, price: 12.96, vat: 8, discount: 0 },
    { name: 'Argyranthemum frut. STEM 19 color', qty: 20, origPrice: 45.00, price: 40.50, vat: 8, discount: 10 },
    { name: 'Rosmarinus officinalis STEM D14', qty: 40, origPrice: 25.00, price: 25.00, vat: 8, discount: 0 },
  ];
  const orderDiscount = 5; // 5% na calosc
  const discountRatio = 1 - orderDiscount / 100;

  const round2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = (n) => n.toFixed(2);

  // Apply order discount to all items
  const finalItems = items.map(i => {
    const afterItemDisc = i.price; // already has item discount applied
    const afterOrderDisc = round2(afterItemDisc * discountRatio);
    const netAfter = round2(afterOrderDisc / (1 + i.vat / 100));
    const netOrig = round2(i.origPrice / (1 + i.vat / 100));
    const hasItemDiscount = i.discount > 0;
    const hasAnyDiscount = hasItemDiscount || orderDiscount > 0;
    const totalDiscPct = hasItemDiscount ? round2(100 - (afterOrderDisc / i.origPrice * 100)) : orderDiscount;
    return { ...i, finalPrice: afterOrderDisc, netPrice: netAfter, netOrig, hasAnyDiscount, totalDiscPct, lineTotal: round2(afterOrderDisc * i.qty) };
  });

  const totalBefore = round2(items.reduce((s, i) => s + i.origPrice * i.qty, 0));
  const totalAfter = round2(finalItems.reduce((s, i) => s + i.lineTotal, 0));
  const totalNet = round2(totalAfter / 1.08);
  const totalVat = round2(totalAfter - totalNet);
  const totalDiscount = round2(totalBefore - totalAfter);

  if (type === 'faktura') {
    // === FAKTURA A4 ===
    const itemsHtml = finalItems.map((i, idx) => `
      <tr style="${idx % 2 === 0 ? '' : 'background:#fafafa'}">
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:center">${idx+1}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db">${esc(i.name)}<br><span style="font-size:10px;color:#6b7280">PKWiU: 01.30.10.0</span></td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:center;color:#2563eb;font-weight:bold">${i.qty}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:center">szt.</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right;text-decoration:${i.hasAnyDiscount ? 'line-through' : 'none'};color:${i.hasAnyDiscount ? '#9ca3af' : '#000'};font-size:11px">${i.hasAnyDiscount ? fmt(i.origPrice) : ''}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:center;color:#dc2626;font-weight:bold;font-size:11px">${i.hasAnyDiscount ? '-' + fmt(i.totalDiscPct) + '%' : ''}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right">${fmt(i.netPrice)}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right">${fmt(i.finalPrice)}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:center">${i.vat}%</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right">${fmt(round2(i.netPrice * i.qty))}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right">${fmt(round2(i.lineTotal - i.netPrice * i.qty))}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right;font-weight:bold">${fmt(i.lineTotal)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Wzor Faktura</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;padding:20px;max-width:720px;margin:0 auto}
    @media print{@page{size:A4 portrait;margin:8mm}}</style></head><body>
    <div style="margin-bottom:20px">
      <div style="float:right;text-align:right;font-size:13px">Data wystawienia: <strong>2026-04-14</strong><br>Data sprzedaży: <strong>2026-04-14</strong></div>
      <h1 style="font-size:27px">FAKTURA VAT</h1>
      <div style="font-size:19px;color:#2563eb;font-weight:bold">FV/00099/2026</div>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;clear:both">
      <div style="flex:1;padding:12px;border-radius:8px;border:1px solid #d1d5db;background:#f3f4f6">
        <div style="font-size:12px;color:#6b7280;font-weight:bold;margin-bottom:8px">SPRZEDAWCA</div>
        <div style="font-weight:bold;margin-bottom:8px">${esc(company.name)}</div>
        <div style="font-size:12px">${esc(company.street)}<br>${esc(company.postalCode)} ${esc(company.city)}</div>
        <div style="font-size:12px;margin-top:8px">NIP: <strong>${esc(company.nip)}</strong></div>
      </div>
      <div style="flex:1;padding:12px;border-radius:8px;border:1px solid #d1d5db;background:#dbeafe">
        <div style="font-size:12px;color:#6b7280;font-weight:bold;margin-bottom:8px">NABYWCA</div>
        <div style="font-weight:bold;color:#2563eb;margin-bottom:8px">${esc(buyer.name)}</div>
        <div style="font-size:12px">${esc(buyer.street)}<br>${esc(buyer.postalCode)} ${esc(buyer.city)}</div>
        <div style="font-size:12px;margin-top:8px">NIP: <strong>${esc(buyer.nip)}</strong></div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:25px">Lp.</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px">Nazwa</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:35px">Ilość</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:30px">J.m.</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:55px">Cena przed</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:45px">Rabat</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:55px">Cena netto</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:55px">Cena brutto</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:35px">VAT%</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:65px">Kwota netto</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:55px">Kwota VAT</th>
        <th style="padding:8px 4px;border:1px solid #d1d5db;font-size:11px;width:65px">Kwota brutto</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot><tr style="background:#f3f4f6;font-weight:bold">
        <td colspan="2" style="padding:8px 4px;border:1px solid #d1d5db;text-align:right">RAZEM:</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:center;color:#2563eb">${finalItems.reduce((s,i)=>s+i.qty,0)}</td>
        <td colspan="5" style="border:1px solid #d1d5db"></td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right">${fmt(totalNet)}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right">${fmt(totalVat)}</td>
        <td style="padding:8px 4px;border:1px solid #d1d5db;text-align:right;color:#2563eb">${fmt(totalAfter)}</td>
      </tr></tfoot>
    </table>
    <div style="margin-bottom:16px;padding:10px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px">
      <div style="font-size:12px;font-weight:bold;color:#92400e;margin-bottom:6px">UDZIELONY RABAT</div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>Wartość przed rabatem:</span><span style="font-weight:bold">${fmt(totalBefore)} zl</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>Rabat ogólny (${orderDiscount}%):</span><span style="font-weight:bold;color:#dc2626">-${fmt(totalDiscount)} zl</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px;font-size:10px;color:#92400e"><span>w tym rabat na pozycję: Argyranthemum (-10%)</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;border-top:1px solid #f59e0b;padding-top:4px;margin-top:4px"><span>Wartość po rabacie:</span><span style="font-weight:bold;color:#2563eb">${fmt(totalAfter)} zl</span></div>
    </div>
    <div style="display:flex;gap:20px">
      <div style="flex:2">
        <div style="margin-bottom:16px"><div style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:bold">PŁATNOŚĆ</div>
          <div style="font-size:13px">Forma: <strong>Przelew</strong></div>
          <div style="font-size:13px">Termin: <strong>2026-04-28</strong></div>
        </div>
        <div style="background:#dbeafe;border:1px solid #bfdbfe;border-radius:6px;padding:10px 12px">
          <div style="color:#2563eb;font-weight:bold;font-size:13px">${esc(company.bank)}</div>
          <div style="font-size:13px">Numer konta: ${esc(company.account)}</div>
        </div>
      </div>
      <div style="flex:1">
        <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:12px">
          <div style="font-size:11px;color:#6b7280;margin-bottom:12px;font-weight:bold">PODSUMOWANIE</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Wartość faktury:</span><span style="font-weight:bold">${fmt(totalAfter)} zl</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Zapłacono:</span><span style="font-weight:bold">0.00 zl</span></div>
          <div style="margin-top:12px;padding-top:8px;border-top:1px solid #d1d5db;text-align:center">
            <div style="font-size:12px;color:#6b7280">Pozostało do zapłaty:</div>
            <div style="font-size:19px;font-weight:bold;color:#2563eb">${fmt(totalAfter)} PLN</div>
          </div>
        </div>
      </div>
    </div>
    </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } else if (type === 'ksef-a4') {
    // === POTWIERDZENIE KSeF A4 ===
    const itemsHtml = finalItems.map((i, idx) => `
      <tr style="${idx % 2 === 0 ? '' : 'background:#fafafa'}">
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;text-align:center">${idx+1}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${esc(i.name)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.qty}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(i.netPrice)}</td>
        ${i.hasAnyDiscount ? `<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;text-decoration:line-through;color:#9ca3af;font-size:11px">${fmt(round2(i.origPrice / 1.08))}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;font-weight:bold">-${fmt(i.totalDiscPct)}%</td>` : `<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb"></td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb"></td>`}
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.vat}%</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(round2(i.netPrice * i.qty))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500">${fmt(i.lineTotal)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Wzor KSeF A4</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;padding:30px;max-width:720px;margin:0 auto}
    @media print{@page{size:A4 portrait;margin:10mm}}</style></head><body>
    <div style="text-align:center;margin-bottom:30px">
      <div style="font-size:20px;font-weight:bold;margin-bottom:4px">POTWIERDZENIE TRANSAKCJI KSeF</div>
      <div style="font-size:11px;color:#6b7280">art. 106g ust. 3b ustawy o VAT</div>
    </div>
    <div style="text-align:center;font-size:16px;font-weight:bold;margin-bottom:4px">FV/00099/2026</div>
    <div style="text-align:center;font-size:12px;color:#6b7280;margin-bottom:20px">Data wystawienia: 2026-04-14</div>
    <div style="display:flex;gap:20px;margin-bottom:20px">
      <div style="flex:1;padding:14px;background:#f3f4f6;border-radius:8px"><div style="font-size:11px;color:#6b7280;font-weight:bold;margin-bottom:6px">SPRZEDAWCA</div><div style="font-weight:bold">${esc(company.name)}</div><div style="font-size:12px">${esc(company.street)}, ${esc(company.postalCode)} ${esc(company.city)}</div><div style="font-size:12px">NIP: <strong>${esc(company.nip)}</strong></div></div>
      <div style="flex:1;padding:14px;background:#f0f9ff;border-radius:8px"><div style="font-size:11px;color:#6b7280;font-weight:bold;margin-bottom:6px">NABYWCA</div><div style="font-weight:bold">${esc(buyer.name)}</div><div style="font-size:12px">${esc(buyer.street)}, ${esc(buyer.postalCode)} ${esc(buyer.city)}</div><div style="font-size:12px">NIP: <strong>${esc(buyer.nip)}</strong></div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <thead><tr style="background:#f3f4f6"><th style="padding:8px;text-align:center;border-bottom:2px solid #d1d5db">Lp</th><th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db">Nazwa</th><th style="padding:8px;text-align:center;border-bottom:2px solid #d1d5db">Ilość</th><th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db">Cena netto</th><th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db">Cena przed</th><th style="padding:8px;text-align:center;border-bottom:2px solid #d1d5db">Rabat</th><th style="padding:8px;text-align:center;border-bottom:2px solid #d1d5db">VAT</th><th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db">Netto</th><th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db">Brutto</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="margin-bottom:16px;padding:10px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px">
      <div style="font-size:12px;font-weight:bold;color:#92400e;margin-bottom:6px">UDZIELONY RABAT</div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>Wartość przed rabatem:</span><span style="font-weight:bold">${fmt(totalBefore)} zl</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>Rabat łączny:</span><span style="font-weight:bold;color:#dc2626">-${fmt(totalDiscount)} zl</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;border-top:1px solid #f59e0b;padding-top:4px"><span>Wartość po rabacie:</span><span style="font-weight:bold;color:#2563eb">${fmt(totalAfter)} zl</span></div>
    </div>
    <div style="display:flex;gap:20px;margin-bottom:20px">
      <div><span style="color:#6b7280">Forma płatności:</span> <strong>Przelew</strong></div>
      <div><span style="color:#6b7280">Netto:</span> <strong>${fmt(totalNet)} zl</strong></div>
      <div><span style="color:#6b7280">VAT:</span> <strong>${fmt(totalVat)} zl</strong></div>
      <div style="font-size:18px;font-weight:bold;color:#2563eb;margin-left:auto">RAZEM: ${fmt(totalAfter)} zl</div>
    </div>
    <div style="background:#dbeafe;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:20px"><div style="font-size:12px;color:#1e40af;font-weight:bold;margin-bottom:4px">${esc(company.bank)}</div><div style="font-size:14px;font-weight:bold;letter-spacing:0.5px">${esc(company.account)}</div></div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 20px"><div style="font-size:14px;font-weight:bold;color:#166534">PRZYJETA DO KSeF</div><div style="font-size:12px;color:#166534;margin-top:4px">Nr ref: 20260414-EE-XXXXXXXXX-XXXXXXXXXX-XX</div></div>
    </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } else if (type === 'ksef-paragon') {
    // === POTWIERDZENIE KSeF PARAGON 72mm ===
    const dash = '<div style="border-top:1px dashed #000;margin:4px 0"></div>';
    const solid = '<div style="border-top:2px solid #000;margin:4px 0"></div>';
    const itemsHtml = finalItems.map((i, idx) => {
      let line = `<div style="font-size:11px;margin-top:3px">${idx+1}. ${esc(i.name)}</div>`;
      line += `<div style="font-size:10px;display:flex;justify-content:space-between;padding-left:10px"><span>${i.qty} szt x ${fmt(i.finalPrice)}</span><span style="font-weight:bold">${fmt(i.lineTotal)} zl</span></div>`;
      if (i.hasAnyDiscount) {
        line += `<div style="font-size:9px;padding-left:10px;color:#666"><del>${fmt(i.origPrice)}</del> -${fmt(i.totalDiscPct)}%</div>`;
      }
      return line;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Wzor KSeF Paragon</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:72mm;margin:0 auto;padding:3mm;color:#000;background:#fff}</style></head><body>
    <div style="text-align:center;font-size:13px;font-weight:bold">POTWIERDZENIE</div>
    <div style="text-align:center;font-size:13px;font-weight:bold">TRANSAKCJI KSeF</div>
    <div style="text-align:center;font-size:9px;color:#333">art. 106g ust. 3b ustawy o VAT</div>
    ${solid}
    <div style="text-align:center;font-size:12px;font-weight:bold;margin:4px 0">FV/00099/2026</div>
    <div style="text-align:center;font-size:9px">2026-04-14</div>
    ${dash}
    <div style="font-size:10px;font-weight:bold">SPRZEDAWCA:</div>
    <div style="font-size:10px">${esc(company.name)}</div>
    <div style="font-size:9px">${esc(company.street)}</div>
    <div style="font-size:9px">${esc(company.postalCode)} ${esc(company.city)}</div>
    <div style="font-size:9px">NIP: ${esc(company.nip)}</div>
    ${dash}
    <div style="font-size:10px;font-weight:bold">NABYWCA:</div>
    <div style="font-size:10px">${esc(buyer.name)}</div>
    <div style="font-size:9px">NIP: ${esc(buyer.nip)}</div>
    ${dash}
    ${itemsHtml}
    ${dash}
    <div style="font-size:9px;font-weight:bold;color:#666;margin:2px 0">RABAT: -${fmt(totalDiscount)} zl (przed: ${fmt(totalBefore)} zl)</div>
    ${dash}
    <div style="font-size:11px;display:flex;justify-content:space-between"><span>Netto:</span><span>${fmt(totalNet)} zl</span></div>
    <div style="font-size:11px;display:flex;justify-content:space-between"><span>VAT:</span><span>${fmt(totalVat)} zl</span></div>
    ${solid}
    <div style="font-size:14px;font-weight:bold;display:flex;justify-content:space-between"><span>RAZEM:</span><span>${fmt(totalAfter)} zl</span></div>
    ${solid}
    <div style="font-size:10px;margin:4px 0">Forma płatności: <strong>Przelew</strong></div>
    <div style="font-size:9px;margin:4px 0;padding:3px;border:1px dashed #000"><div style="font-weight:bold">${esc(company.bank)}</div><div style="letter-spacing:0.3px">${esc(company.account)}</div></div>
    <div style="text-align:center;font-size:10px;font-weight:bold;margin:4px 0;padding:3px;border:1px solid #000">PRZYJETA DO KSeF</div>
    <div style="text-align:center;font-size:8px;word-break:break-all;margin-top:2px">20260414-EE-XXXXXXXXX-XXXXXXXXXX-XX</div>
    ${dash}
    <div style="text-align:center;font-size:9px;margin-top:4px"><div style="font-weight:bold">Krajowy System e-Faktur</div><div>Dokument elektroniczny</div></div>
    </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } else if (type === 'paragon') {
    // === PARAGON SPRZEDAZY 72mm ===
    const dash = '<div style="border-top:1px dashed #000;margin:4px 0"></div>';
    const solid = '<div style="border-top:2px solid #000;margin:4px 0"></div>';
    const itemsHtml = finalItems.map((i, idx) => {
      let line = `<tr><td style="padding:2px 1px;font-size:11px;width:45%">${esc(i.name)}</td><td style="padding:2px 1px;font-size:11px;text-align:center">${i.qty}</td><td style="padding:2px 1px;font-size:11px;text-align:right">${fmt(i.finalPrice)}</td><td style="padding:2px 1px;font-size:11px;text-align:right;font-weight:bold">${fmt(i.lineTotal)}</td></tr>`;
      if (i.hasAnyDiscount) {
        line += `<tr><td colspan="4" style="padding:0 1px;font-size:9px;color:#666">  <del>${fmt(i.origPrice)}</del> rabat -${fmt(i.totalDiscPct)}%</td></tr>`;
      }
      return line;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Wzor Paragon</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;font-weight:bold;width:72mm;margin:0 auto;padding:3mm;color:#000;background:#fff}</style></head><body>
    <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
      <div style="font-size:15px;font-weight:bold">${esc(company.name)}</div>
      <div style="font-size:11px">${esc(company.street)}, ${esc(company.postalCode)} ${esc(company.city)}</div>
      <div style="font-size:11px">NIP: ${esc(company.nip)}</div>
    </div>
    <div style="text-align:center;margin-bottom:8px"><div style="font-size:13px;font-weight:bold">POTWIERDZENIE SPRZEDAŻY</div><div style="font-size:12px;font-weight:bold">do FV/00099/2026</div></div>
    <div style="border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px;font-size:11px">Data: 2026-04-14 12:30</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed"><thead><tr><th style="text-align:left;padding:2px 1px;border-bottom:1px solid #999;font-size:10px;width:45%">Nazwa</th><th style="text-align:center;padding:2px 1px;border-bottom:1px solid #999;font-size:10px;width:15%">Szt</th><th style="text-align:right;padding:2px 1px;border-bottom:1px solid #999;font-size:10px;width:20%">Cena</th><th style="text-align:right;padding:2px 1px;border-bottom:1px solid #999;font-size:10px;width:20%">Wart</th></tr></thead>
    <tbody>${itemsHtml}</tbody></table>
    ${dash}
    <div style="font-size:9px;color:#666">RABAT: -${fmt(totalDiscount)} zl (przed: ${fmt(totalBefore)} zl)</div>
    ${solid}
    <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:bold"><span>SUMA:</span><span>${fmt(totalAfter)} PLN</span></div>
    ${solid}
    <div style="font-size:11px;margin:4px 0">Płatność: <strong>Przelew</strong></div>
    <div style="font-size:9px;margin:4px 0;padding:3px;border:1px dashed #000"><div style="font-weight:bold">${esc(company.bank)}</div><div>${esc(company.account)}</div></div>
    <div style="text-align:center;font-size:13px;margin-top:8px"><div style="font-weight:600">Dziękujemy za zakupy!</div><div style="color:#666">Zapraszamy ponownie</div></div>
    </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } else if (type === 'faktura-paragon') {
    // === FAKTURA VAT PARAGONOWA 72mm ===
    const dash = '<div style="border-top:1px dashed #000;margin:4px 0"></div>';
    const solid = '<div style="border-top:2px solid #000;margin:4px 0"></div>';

    const itemsHtml = finalItems.map((i, idx) => {
      let line = '<div style="font-size:11px;margin-top:3px">' + (idx+1) + '. ' + esc(i.name) + '</div>';
      line += '<div style="font-size:10px;display:flex;justify-content:space-between;padding-left:10px"><span>' + i.qty + ' szt x ' + fmt(i.finalPrice) + '</span><span style="font-weight:bold">' + fmt(i.lineTotal) + ' zl</span></div>';
      if (i.hasAnyDiscount) {
        line += '<div style="font-size:9px;padding-left:10px;color:#666"><del>' + fmt(i.origPrice) + '</del> -' + fmt(i.totalDiscPct) + '%</div>';
      }
      return line;
    }).join('');

    // VAT summary
    const vatRate = 8;
    const vatSumNet = round2(totalAfter / (1 + vatRate/100));
    const vatSumVat = round2(totalAfter - vatSumNet);

    const discountLine = totalDiscount > 0
      ? '<div style="font-size:9px;font-weight:bold;color:#666;margin:2px 0">RABAT: -' + fmt(totalDiscount) + ' zl (przed: ' + fmt(totalBefore) + ' zl)</div>' + dash
      : '';

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Wzor Faktura Paragonowa</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Courier New",monospace;font-size:12px;width:72mm;margin:0 auto;padding:3mm;color:#000;background:#fff}</style></head><body>' +
    '<div style="text-align:center;font-size:14px;font-weight:bold">FAKTURA VAT</div>' +
    solid +
    '<div style="text-align:center;font-size:12px;font-weight:bold;margin:4px 0">FV/00099/2026</div>' +
    '<div style="text-align:center;font-size:9px">Data wystawienia: 2026-04-14</div>' +
    '<div style="text-align:center;font-size:9px">Data sprzeda\u017cy: 2026-04-14</div>' +
    dash +
    '<div style="font-size:10px;font-weight:bold">SPRZEDAWCA:</div>' +
    '<div style="font-size:10px">' + esc(company.name) + '</div>' +
    '<div style="font-size:9px">' + esc(company.street) + '</div>' +
    '<div style="font-size:9px">' + esc(company.postalCode) + ' ' + esc(company.city) + '</div>' +
    '<div style="font-size:9px">NIP: ' + esc(company.nip) + '</div>' +
    dash +
    '<div style="font-size:10px;font-weight:bold">NABYWCA:</div>' +
    '<div style="font-size:10px">' + esc(buyer.name) + '</div>' +
    '<div style="font-size:9px">' + esc(buyer.street) + '</div>' +
    '<div style="font-size:9px">' + esc(buyer.postalCode) + ' ' + esc(buyer.city) + '</div>' +
    '<div style="font-size:9px">NIP: ' + esc(buyer.nip) + '</div>' +
    dash +
    '<div style="font-size:9px;font-weight:bold;margin-bottom:2px">POZYCJE:</div>' +
    itemsHtml +
    dash +
    discountLine +
    '<div style="font-size:9px;font-weight:bold;margin-bottom:2px">PODSUMOWANIE VAT:</div>' +
    '<div style="font-size:9px;display:flex;justify-content:space-between"><span>' + vatRate + '%</span><span>N:' + fmt(vatSumNet) + ' V:' + fmt(vatSumVat) + ' B:' + fmt(totalAfter) + '</span></div>' +
    dash +
    '<div style="font-size:11px;display:flex;justify-content:space-between"><span>Netto:</span><span>' + fmt(vatSumNet) + ' zl</span></div>' +
    '<div style="font-size:11px;display:flex;justify-content:space-between"><span>VAT:</span><span>' + fmt(vatSumVat) + ' zl</span></div>' +
    solid +
    '<div style="font-size:14px;font-weight:bold;display:flex;justify-content:space-between"><span>RAZEM:</span><span>' + fmt(totalAfter) + ' zl</span></div>' +
    solid +
    '<div style="font-size:10px;margin:4px 0">Forma p\u0142atno\u015bci: <strong>Przelew</strong></div>' +
    '<div style="font-size:10px;margin:2px 0">Termin p\u0142atno\u015bci: <strong>2026-04-28</strong></div>' +
    '<div style="font-size:9px;margin:4px 0;padding:3px;border:1px dashed #000">' +
    '<div style="font-weight:bold">' + esc(company.bank) + '</div>' +
    '<div style="letter-spacing:0.3px">' + esc(company.account) + '</div>' +
    '</div>' +
    dash +
    '<div style="text-align:center;font-size:9px;margin-top:4px">' +
    '<div style="font-weight:bold">Dzi\u0119kujemy za zakupy!</div>' +
    '<div style="color:#666">Dokument wygenerowany elektronicznie</div>' +
    '</div>' +
    '</body></html>';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } else {
    return res.status(404).send('Dostepne typy: faktura, ksef-a4, ksef-paragon, paragon, faktura-paragon');
  }
});

// JPK_V7M(3) generation
app.get("/jpk/generate", requireAuth, requirePermission('reports:view'), async (req: any, res: any) => {
  try {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "Podaj prawidlowy rok i miesiac (?year=2026&month=4)" });
    }
    const xml = await generateJpkV7M(year, month);
    const filename = `JPK_V7M_${year}_${String(month).padStart(2, '0')}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(xml);
  } catch (error: any) {
    console.error('[JPK] Generation error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// JPK preview (returns stats without downloading)
app.get("/jpk/preview", requireAuth, requirePermission('reports:view'), async (req: any, res: any) => {
  try {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "Podaj prawidlowy rok i miesiac" });
    }

    // Count invoices and corrections for preview
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { query: dbQuery } = require('./models/database');
    const [invCount, corrCount, vatSummary] = await Promise.all([
      dbQuery("SELECT count(*) as cnt, COALESCE(sum(total_gross),0) as gross FROM invoices WHERE invoice_type='invoice' AND issue_date >= $1 AND issue_date < $2", [startDate, endDate]),
      dbQuery("SELECT count(*) as cnt FROM invoice_corrections WHERE issue_date >= $1 AND issue_date < $2", [startDate, endDate]),
      dbQuery("SELECT ii.vat_rate, sum(ii.total_net) as net, sum(ii.total_vat) as vat, sum(ii.total_gross) as gross FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.invoice_type='invoice' AND i.issue_date >= $1 AND i.issue_date < $2 GROUP BY ii.vat_rate ORDER BY ii.vat_rate", [startDate, endDate]),
    ]);

    return res.json({
      year, month,
      invoiceCount: parseInt(invCount.rows[0].cnt),
      correctionCount: parseInt(corrCount.rows[0].cnt),
      totalGross: parseFloat(invCount.rows[0].gross) || 0,
      vatSummary: vatSummary.rows.map((r: any) => ({
        rate: Number(r.vatRate),
        net: parseFloat(r.net) || 0,
        vat: parseFloat(r.vat) || 0,
        gross: parseFloat(r.gross) || 0,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Image search via Google Custom Search
app.get("/inventory/search-images", requireAuth, async (req: any, res: any) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "Brak parametru q" });

    const { SettingsModel } = require("./models/Settings");
    const apiKey = await SettingsModel.getSetting("google_api_key");
    const cseId = await SettingsModel.getSetting("google_cse_id");
    if (!apiKey || !cseId) {
      return res.status(400).json({ error: "Brak skonfigurowanego Google API Key lub CSE ID w ustawieniach" });
    }

    const searchQuery = encodeURIComponent(q + " plant");
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${searchQuery}&searchType=image&num=9&imgSize=medium&safe=active`;

    const https = require("https");
    const data: any = await new Promise((resolve, reject) => {
      https.get(url, (resp: any) => {
        let body = "";
        resp.on("data", (chunk: string) => body += chunk);
        resp.on("end", () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      }).on("error", reject);
    });

    if (data.error) {
      console.error("[Image Search] Google API error:", data.error.message);
      return res.status(500).json({ error: data.error.message });
    }

    const images = (data.items || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      thumbnail: item.image?.thumbnailLink || item.link,
      width: item.image?.width,
      height: item.image?.height,
      context: item.image?.contextLink,
    }));

    return res.json({ images, totalResults: data.searchInformation?.totalResults || 0 });
  } catch (error: any) {
    console.error("[Image Search] Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Purchase invoices (imported PDF invoices)
app.get("/purchase-invoices", requireAuth, requirePermission('invoices:view'), InventoryImportController.listPurchaseInvoices);
app.get("/purchase-invoices/:id", requireAuth, requirePermission('invoices:view'), InventoryImportController.getPurchaseInvoice);
app.delete("/purchase-invoices/:id", requireAuth, requirePermission('invoices:view'), InventoryImportController.deletePurchaseInvoice);
app.get('/inventory/check-barcode/:barcode', requireAuth, async (req: any, res: any) => {
  try {
    const barcode = req.params.barcode;
    const { ProductModel } = await import("./models/Product");
    const product = await ProductModel.getByBarcode(barcode);
    return res.json({ exists: !!product });
  } catch (err) {
    return res.json({ exists: false });
  }
});
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
// Invoice as 72mm receipt (for WDT/non-KSeF clients)
app.get("/invoices/:id/invoice-receipt-html", requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { query: dbQuery } = require('./models/database');
    const { SettingsModel } = require('./models/Settings');

    const invResult = await dbQuery('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invResult.rows.length === 0) return res.status(404).json({ error: 'Faktura nie znaleziona' });
    const inv = invResult.rows[0];

    const itemsResult = await dbQuery('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]);
    const items = itemsResult.rows;

    const company = await SettingsModel.getCompanySettings();
    const buyer = inv.buyerSnapshot || {};
    const buyerName = buyer.companyName || [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Brak';
    const esc = (s: any) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = (n: any) => (Number(n) || 0).toFixed(2);
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pl-PL') : '-';

    const totalNet = Number(inv.subtotalNet) || 0;
    const totalVat = Number(inv.totalVat) || 0;
    const totalGross = Number(inv.totalGross) || 0;

    // Check discounts
    const hasDiscount = items.some((i: any) => Number(i.discountPercent) > 0 || Number(i.originalUnitPriceGross) > 0);
    let totalBefore = 0;
    if (hasDiscount) {
      items.forEach((i: any) => {
        const origG = Number(i.originalUnitPriceGross) || Number(i.unitPriceGross) || 0;
        totalBefore += origG * (Number(i.quantity) || 0);
      });
    }
    const totalDiscount = hasDiscount ? totalBefore - totalGross : 0;

    // Items HTML
    let itemsHtml = '';
    items.forEach((item: any, idx: number) => {
      const qty = Number(item.quantity) || 0;
      const unitGross = Number(item.unitPriceGross) || 0;
      const lineGross = Number(item.totalGross) || 0;
      const discPct = Number(item.discountPercent) || 0;
      const origGross = Number(item.originalUnitPriceGross) || 0;
      itemsHtml += '<div style="font-size:11px;margin-top:3px">' + (idx+1) + '. ' + esc(item.description || '') + '</div>';
      itemsHtml += '<div style="font-size:10px;display:flex;justify-content:space-between;padding-left:10px"><span>' + qty + ' szt x ' + fmt(unitGross) + '</span><span style="font-weight:bold">' + fmt(lineGross) + ' zl</span></div>';
      if (discPct > 0 || origGross > 0) {
        itemsHtml += '<div style="font-size:9px;padding-left:10px;color:#666"><del>' + fmt(origGross || unitGross) + '</del> -' + fmt(discPct) + '%</div>';
      }
    });

    // VAT summary
    const vatGroups: Record<string, {net:number,vat:number,gross:number}> = {};
    items.forEach((item: any) => {
      const rate = fmt(item.vatRate) + '%';
      if (!vatGroups[rate]) vatGroups[rate] = {net:0,vat:0,gross:0};
      vatGroups[rate].net += Number(item.totalNet) || 0;
      vatGroups[rate].vat += (Number(item.totalGross)||0) - (Number(item.totalNet)||0);
      vatGroups[rate].gross += Number(item.totalGross) || 0;
    });
    let vatHtml = '';
    for (const [rate, vals] of Object.entries(vatGroups)) {
      vatHtml += '<div style="font-size:9px;display:flex;justify-content:space-between"><span>' + rate + '</span><span>N:' + fmt(vals.net) + ' V:' + fmt(vals.vat) + ' B:' + fmt(vals.gross) + '</span></div>';
    }

    const dash = '<div style="border-top:1px dashed #000;margin:4px 0"></div>';
    const solid = '<div style="border-top:2px solid #000;margin:4px 0"></div>';
    const discountLine = totalDiscount > 0 ? '<div style="font-size:9px;font-weight:bold;color:#666;margin:2px 0">RABAT: -' + fmt(totalDiscount) + ' zl (przed: ' + fmt(totalBefore) + ' zl)</div>' + dash : '';

    const payLabel = inv.paymentMethod === 'cash' ? 'Gotówka' : inv.paymentMethod === 'card' ? 'Karta' : 'Przelew';
    const buyerNipLabel = buyer.vatEu ? 'VAT-EU: ' + esc(buyer.vatEu) : buyer.nip ? 'NIP: ' + esc(buyer.nip) : '';

    const html = '<div style="font-family:Courier New,Courier,monospace;color:#000;width:100%;padding:0 3mm">' +
      '<div style="text-align:center;font-size:14px;font-weight:bold">FAKTURA VAT</div>' +
      solid +
      '<div style="text-align:center;font-size:12px;font-weight:bold;margin:4px 0">' + esc(inv.invoiceNumber) + '</div>' +
      '<div style="text-align:center;font-size:9px">Data wystawienia: ' + fmtDate(inv.issueDate) + '</div>' +
      '<div style="text-align:center;font-size:9px">Data sprzedaży: ' + fmtDate(inv.saleDate) + '</div>' +
      dash +
      '<div style="font-size:10px;font-weight:bold">SPRZEDAWCA:</div>' +
      '<div style="font-size:10px">' + esc(company.companyName) + '</div>' +
      '<div style="font-size:9px">' + esc(company.street) + '</div>' +
      '<div style="font-size:9px">' + esc(company.postalCode) + ' ' + esc(company.city) + '</div>' +
      '<div style="font-size:9px">NIP: ' + esc(company.nip) + '</div>' +
      dash +
      '<div style="font-size:10px;font-weight:bold">NABYWCA:</div>' +
      '<div style="font-size:10px">' + esc(buyerName) + '</div>' +
      (buyer.street ? '<div style="font-size:9px">' + esc(buyer.street) + '</div>' : '') +
      ((buyer.postalCode || buyer.city) ? '<div style="font-size:9px">' + esc((buyer.postalCode||'') + ' ' + (buyer.city||'')).trim() + '</div>' : '') +
      (buyerNipLabel ? '<div style="font-size:9px">' + buyerNipLabel + '</div>' : '') +
      dash +
      '<div style="font-size:9px;font-weight:bold;margin-bottom:2px">POZYCJE:</div>' +
      itemsHtml +
      dash +
      discountLine +
      '<div style="font-size:9px;font-weight:bold;margin-bottom:2px">PODSUMOWANIE VAT:</div>' +
      vatHtml +
      dash +
      '<div style="font-size:11px;display:flex;justify-content:space-between"><span>Netto:</span><span>' + fmt(totalNet) + ' zl</span></div>' +
      '<div style="font-size:11px;display:flex;justify-content:space-between"><span>VAT:</span><span>' + fmt(totalVat) + ' zl</span></div>' +
      solid +
      '<div style="font-size:14px;font-weight:bold;display:flex;justify-content:space-between"><span>RAZEM:</span><span>' + fmt(totalGross) + ' zl</span></div>' +
      solid +
      '<div style="font-size:10px;margin:4px 0">Forma płatności: <strong>' + payLabel + '</strong></div>' +
      (inv.paymentDeadline ? '<div style="font-size:10px;margin:2px 0">Termin: <strong>' + fmtDate(inv.paymentDeadline) + '</strong></div>' : '') +
      (company.bankAccount ? '<div style="font-size:9px;margin:4px 0;padding:3px;border:1px dashed #000"><div style="font-weight:bold">' + esc(company.bankName || 'Bank') + '</div><div style="letter-spacing:0.3px">' + esc(company.bankAccount) + '</div></div>' : '') +
      dash +
      '<div style="text-align:center;font-size:9px;margin-top:4px"><div style="font-weight:bold">Dziękujemy za zakupy!</div><div style="color:#666">Dokument wygenerowany elektronicznie</div></div>' +
      '</div>';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err: any) {
    console.error('Invoice receipt HTML error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/invoices/:id/edit", requireAuth, requirePermission('invoices:view'), InvoiceController.getForEdit);
app.put("/invoices/:id", requireAuth, requirePermission('invoices:edit'), InvoiceController.updateInvoice);
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
app.post("/ksef/certificate", requireAuth, requirePermission("settings:edit"), KsefController.uploadCertificate);
app.get("/ksef/certificate/status", requireAuth, requirePermission("settings:view"), KsefController.getCertificateStatus);
app.post("/ksef/certificate/generate-csr", requireAuth, requirePermission("settings:edit"), KsefController.generateCsr);
app.post("/ksef/corrections/:id/send", requireAuth, requirePermission("invoices:edit"), KsefController.sendCorrection);
app.get("/ksef/invoices/:id/confirmation-html", requireAuth, requirePermission("invoices:view"), KsefController.getConfirmationHtml);

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

// Receipt PDF via Puppeteer (for Android thermal printing)
// ESC/POS raw data for thermal printer (native quality)
app.get("/ksef/invoices/:id/escpos", (req: any, res: any, next: any) => {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
  next();
}, requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { query: dbQuery } = require('./models/database');
    const { SettingsModel } = require('./models/Settings');
    const { generateEscPosReceipt } = require('./utils/escposReceiptGenerator');

    const invResult = await dbQuery('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invResult.rows.length === 0) return res.status(404).json({ error: 'Faktura nie znaleziona' });
    const inv = invResult.rows[0];

    const itemsResult = await dbQuery('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]);
    const company = await SettingsModel.getCompanySettings();
    const buyer = inv.buyerSnapshot || {};
    const buyerName = buyer.companyName || [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Brak';

    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pl-PL') : '-';

    // Check discounts
    let totalBefore = 0;
    const hasDiscount = itemsResult.rows.some((i: any) => Number(i.discountPercent) > 0 || Number(i.originalUnitPriceGross) > 0);
    if (hasDiscount) {
      itemsResult.rows.forEach((i: any) => {
        const origG = Number(i.originalUnitPriceGross) || Number(i.unitPriceGross) || 0;
        totalBefore += origG * (Number(i.quantity) || 0);
      });
    }

    const totalGross = Number(inv.totalGross) || 0;
    const totalNet = Number(inv.subtotalNet) || 0;
    const totalVat = Number(inv.totalVat) || 0;

    const escposData = {
      title: 'POTWIERDZENIE KSeF',
      invoiceNumber: inv.invoiceNumber,
      issueDate: fmtDate(inv.issueDate),
      saleDate: fmtDate(inv.saleDate),
      seller: { name: company.companyName, street: company.street, postalCode: company.postalCode, city: company.city, nip: company.nip },
      buyer: { name: buyerName, street: buyer.street, postalCode: buyer.postalCode, city: buyer.city, nip: buyer.nip, vatEu: buyer.vatEu },
      items: itemsResult.rows.map((i: any) => ({
        name: i.description, qty: Number(i.quantity), price: Number(i.unitPriceGross),
        total: Number(i.totalGross), discount: Number(i.discountPercent) || 0,
        origPrice: Number(i.originalUnitPriceGross) || 0,
      })),
      totalNet, totalVat, totalGross,
      paymentMethod: inv.paymentMethod || 'transfer',
      paymentDeadline: inv.paymentDeadline ? fmtDate(inv.paymentDeadline) : undefined,
      bankName: company.bankName, bankAccount: company.bankAccount,
      ksefStatus: inv.ksefStatus, ksefRef: inv.ksefReferenceNumber,
      discountTotal: hasDiscount ? totalBefore - totalGross : 0,
      discountBefore: hasDiscount ? totalBefore : 0,
    };

    const buffer = generateEscPosReceipt(escposData);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(buffer);
  } catch (err: any) {
    console.error('ESC/POS error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Receipt ESC/POS
app.get("/receipts/:id/escpos", (req: any, res: any, next: any) => {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
  next();
}, requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { query: dbQuery } = require('./models/database');
    const { SettingsModel } = require('./models/Settings');
    const { generateEscPosReceipt } = require('./utils/escposReceiptGenerator');

    const receiptResult = await dbQuery('SELECT r.*, o.order_number, o.total_amount FROM receipts r LEFT JOIN orders o ON o.id = r.order_id WHERE r.id = $1', [id]);
    if (receiptResult.rows.length === 0) return res.status(404).json({ error: 'Paragon nie znaleziony' });
    const receipt = receiptResult.rows[0];

    const itemsResult = await dbQuery('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [receipt.orderId || receipt.order_id]);
    const company = await SettingsModel.getCompanySettings();

    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pl-PL') : '-';
    const totalGross = Number(receipt.totalAmount || receipt.total_amount) || 0;
    const totalNet = Math.round(totalGross / 1.08 * 100) / 100;
    const totalVat = Math.round((totalGross - totalNet) * 100) / 100;

    const escposData = {
      title: 'POTWIERDZENIE',
      invoiceNumber: receipt.receiptNumber || receipt.receipt_number || 'Paragon',
      issueDate: fmtDate(receipt.createdAt || receipt.created_at),
      seller: { name: company.companyName, street: company.street, postalCode: company.postalCode, city: company.city, nip: company.nip },
      buyer: { name: 'Klient detaliczny' },
      items: itemsResult.rows.map((i: any) => {
        const snap = i.productSnapshot || i.product_snapshot || {};
        return {
          name: snap.plantName || snap.plant_name || 'Produkt', qty: Number(i.quantity),
          price: Number(i.unitPriceGross || i.unit_price_gross), total: Number(i.totalPrice || i.total_price),
        };
      }),
      totalNet, totalVat, totalGross,
      paymentMethod: receipt.paymentMethod || receipt.payment_method || 'cash',
      bankName: company.bankName, bankAccount: company.bankAccount,
    };

    const buffer = generateEscPosReceipt(escposData);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(buffer);
  } catch (err: any) {
    console.error('Receipt ESC/POS error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Receipt as PNG image (for Android thermal printing - full page screenshot)
app.get("/receipts/:id/receipt-image", (req: any, res: any, next: any) => {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
  next();
}, requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;
    const http = require('http');
    const htmlContent = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: 3000, path: `/receipts/${id}/html`, headers: { 'Authorization': token } }, (resp: any) => {
        let data = ''; resp.on('data', (c: string) => data += c);
        resp.on('end', () => resp.statusCode === 200 ? resolve(data) : reject(new Error('Failed')));
      }).on('error', reject);
    });
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 280, height: 2000, deviceScaleFactor: 2 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const png = await page.screenshot({ fullPage: true, type: 'png' });
    await browser.close();
    res.setHeader('Content-Type', 'image/png');
    return res.send(png);
  } catch (err: any) {
    console.error('Receipt image error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// KSeF confirmation as PNG image
app.get("/ksef/invoices/:id/confirmation-image", (req: any, res: any, next: any) => {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
  next();
}, requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;
    const http = require('http');
    const htmlFragment = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: 3000, path: `/ksef/invoices/${id}/confirmation-html?format=receipt`, headers: { 'Authorization': token } }, (resp: any) => {
        let data = ''; resp.on('data', (c: string) => data += c);
        resp.on('end', () => resp.statusCode === 200 ? resolve(data) : reject(new Error('Failed')));
      }).on('error', reject);
    });
    const fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:280px;margin:0;padding:4px 8px;font-family:"Courier New",monospace;font-size:12px;font-weight:bold;color:#000;background:#fff}</style></head><body>' + htmlFragment + '</body></html>';
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 280, height: 2000, deviceScaleFactor: 2 });
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const png = await page.screenshot({ fullPage: true, type: 'png' });
    await browser.close();
    res.setHeader('Content-Type', 'image/png');
    return res.send(png);
  } catch (err: any) {
    console.error('KSeF confirmation image error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Invoice receipt (72mm) as PNG image
app.get("/invoices/:id/invoice-receipt-image", (req: any, res: any, next: any) => {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
  next();
}, requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;
    const http = require('http');
    const htmlFragment = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: 3000, path: `/invoices/${id}/invoice-receipt-html`, headers: { 'Authorization': token } }, (resp: any) => {
        let data = ''; resp.on('data', (c: string) => data += c);
        resp.on('end', () => resp.statusCode === 200 ? resolve(data) : reject(new Error('Failed')));
      }).on('error', reject);
    });
    const fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:280px;margin:0;padding:4px 8px;font-family:"Courier New",monospace;font-size:12px;font-weight:bold;color:#000;background:#fff}</style></head><body>' + htmlFragment + '</body></html>';
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 280, height: 2000, deviceScaleFactor: 2 });
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const png = await page.screenshot({ fullPage: true, type: 'png' });
    await browser.close();
    res.setHeader('Content-Type', 'image/png');
    return res.send(png);
  } catch (err: any) {
    console.error('Invoice receipt image error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/receipts/:id/receipt-pdf", (req: any, res: any, next: any) => {
  // Support token in query string (for window.open from PWA)
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  next();
}, requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;

    // Fetch the HTML internally
    const http = require('http');
    const htmlContent = await new Promise<string>((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: `/receipts/${id}/html`,
        headers: { 'Authorization': token },
      };
      http.get(options, (resp: any) => {
        let data = '';
        resp.on('data', (chunk: string) => data += chunk);
        resp.on('end', () => {
          if (resp.statusCode !== 200) reject(new Error('Failed to get receipt HTML'));
          else resolve(data);
        });
      }).on('error', reject);
    });

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      width: '72mm',
      printBackground: true,
      margin: { top: '1mm', bottom: '1mm', left: '2mm', right: '2mm' },
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=receipt-${id}.pdf`);
    return res.send(pdf);
  } catch (error: any) {
    console.error('Receipt PDF error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// KSeF confirmation PDF (receipt format) via Puppeteer
app.get("/ksef/invoices/:id/confirmation-pdf", (req: any, res: any, next: any) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  next();
}, requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;

    // Fetch the receipt HTML
    const http = require('http');
    const htmlFragment = await new Promise<string>((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: `/ksef/invoices/${id}/confirmation-html?format=receipt`,
        headers: { 'Authorization': token },
      };
      http.get(options, (resp: any) => {
        let data = '';
        resp.on('data', (chunk: string) => data += chunk);
        resp.on('end', () => {
          if (resp.statusCode !== 200) reject(new Error('Failed to get KSeF HTML'));
          else resolve(data);
        });
      }).on('error', reject);
    });

    // Wrap fragment in full HTML for Puppeteer
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:72mm;margin:0;padding:2mm;font-family:"Courier New",monospace;font-size:12px;color:#000;background:#fff}</style>
      </head><body>${htmlFragment}</body></html>`;

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      width: '72mm',
      printBackground: true,
      margin: { top: '1mm', bottom: '1mm', left: '2mm', right: '2mm' },
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=ksef-confirmation-${id}.pdf`);
    return res.send(pdf);
  } catch (error: any) {
    console.error('KSeF confirmation PDF error:', error);
    return res.status(500).json({ error: error.message });
  }
});

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
    const pmLabel = (m: string) => ({ card: 'Karta', cash: 'Gotówka', transfer: 'Przelew' }[m] || m);

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
      paymentHtml = '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Forma płatności:</span><span style="font-weight:600">' + pmLabel(paymentMethod) + '</span></div>';
    }

    const addr = [settings.street, (settings.postalCode || '') + ' ' + (settings.city || '')].filter(Boolean).join(', ');
    const now = formatDateFn(new Date());

    const html = '<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Potwierdzenie ' + documentNumber + '</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:72mm;margin:0;padding:0;font-family:"Courier New",Courier,monospace;font-weight:bold;font-size:14px;line-height:1.3;background:white;color:black}@media print{@page{size:72mm auto;margin:1mm 0}html,body{width:72mm;margin:0;padding:0}.receipt{width:72mm;max-width:72mm;padding:1mm 3mm;margin:0}}.receipt{width:72mm;max-width:72mm;margin:0;padding:2mm 3mm;background:white}.header{text-align:center;border-bottom:2px dashed black;padding-bottom:8px;margin-bottom:8px}.header h1{font-size:15px;font-weight:bold;margin-bottom:2px}.header p{font-size:11px}.title{text-align:center;margin-bottom:8px}.title h2{font-size:13px;font-weight:bold}.date-section{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px;font-size:11px}.items-section{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px}table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}th{text-align:left;padding:2px 1px;border-bottom:1px solid #999;font-size:12px;white-space:nowrap;overflow:hidden}td{padding:2px 1px;font-size:13px;overflow:hidden;text-overflow:ellipsis}th:nth-child(1){width:45%}th:nth-child(2){text-align:center;width:15%}th:nth-child(3),th:nth-child(4){text-align:right;width:20%}.total-section{border-bottom:2px dashed black;padding-bottom:8px;margin-bottom:8px}.total{display:flex;justify-content:space-between;align-items:center;font-size:17px;font-weight:bold}.payment-section{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px}.footer{text-align:center;font-size:13px;margin-top:8px}.footer p{margin-bottom:2px}.footer .timestamp{font-size:10px;color:#666;margin-top:6px;padding-top:6px;border-top:1px dotted #999}</style></head><body><div class="receipt"><div class="header"><h1>' + (settings.companyName || 'Firma') + '</h1><p>' + addr + '</p><p>NIP: ' + (settings.nip || '') + '</p>' + (settings.phone ? '<p>Tel: ' + settings.phone + '</p>' : '') + '</div><div class="title"><h2>POTWIERDZENIE SPRZEDAŻY</h2><p style="font-weight:bold;font-size:12px">do ' + documentNumber + '</p><p style="font-size:11px">Zamowienie: ' + order.orderNumber + '</p></div><div class="date-section"><p>Data: ' + now + '</p></div><div class="items-section"><table><thead><tr><th>Nazwa</th><th>Szt</th><th>Cena</th><th>Wart</th></tr></thead><tbody>' + itemsHtml + '</tbody></table></div><div class="total-section"><div class="total"><span>SUMA:</span><span>' + totalAmount.toFixed(2) + ' PLN</span></div></div><div class="payment-section">' + paymentHtml + ((settings.bankAccount || '').replace(/(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4 $5 $6 $7') ? '<div style="font-size:9px;margin-top:4px;padding:3px;border:1px dashed #000"><div style="font-weight:bold">' + (settings.bankName || 'Bank') + '</div><div>' + (settings.bankAccount || '').replace(/(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4 $5 $6 $7') + '</div></div>' : '') + '</div><div class="footer"><p style="font-weight:600">Dziękujemy za zakupy!</p><p style="color:#666">Zapraszamy ponownie</p><div class="timestamp"><p>' + now + '</p></div></div></div></body></html>';

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
app.post("/suggest-tags", requireAuth, TagsController.suggestTags);
app.get("/tags", requireAuth, TagsController.getAllTags);
app.post("/tags", requireAuth, requirePermission('inventory:edit'), TagsController.createTag);
app.put("/tags/:tagName", requireAuth, requirePermission('inventory:edit'), TagsController.updateTag);
app.delete("/tags/:tagName", requireAuth, requirePermission('inventory:edit'), TagsController.deleteTag);

// Tag keywords management
app.get("/tag-keywords", requireAuth, TagsController.getTagKeywords);
app.post("/tag-keywords", requireAuth, requirePermission('inventory:edit'), TagsController.addTagKeyword);
app.post("/tag-keywords/bulk", requireAuth, requirePermission('inventory:edit'), TagsController.bulkAddTagKeywords);
app.delete("/tag-keywords/:id", requireAuth, requirePermission('inventory:edit'), TagsController.deleteTagKeyword);

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

httpServer.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`🚀 PlantManager Backend running on port ${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}/ws`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);

  // Start cron jobs
  const cronService = new CronService();
  cronService.start();
});

export default app;
