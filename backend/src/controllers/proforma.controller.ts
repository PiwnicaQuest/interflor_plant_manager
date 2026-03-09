import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InvoiceModel } from '../models/Invoice';
import { CustomerModel } from '../models/Customer';
import { OrderModel } from '../models/Order';
import { PaymentMethod } from '../types';
import { emailService } from '../services/emailService';
import { generateProformaPdfDirect } from "../utils/proformaPdfGenerator";

async function pdfToBuffer(pdfDoc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
  });
}

export class ProformaController {
  /**
   * GET /proforma
   * Lista wszystkich faktur pro forma
   */
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, customerId } = req.query;

      const filters: {
        startDate?: Date;
        endDate?: Date;
        customerId?: number;
      } = {};

      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (customerId) filters.customerId = parseInt(customerId as string);

      const proformas = await InvoiceModel.getAllProforma(filters);

      return res.json({ proformas });
    } catch (error: any) {
      console.error('Get proformas error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas pobierania faktur pro forma' });
    }
  }

  /**
   * GET /proforma/:id
   * Szczegóły faktury pro forma
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      const proforma = await InvoiceModel.getById(id);

      if (!proforma) {
        return res.status(404).json({ error: 'Faktura pro forma nie znaleziona' });
      }

      if (proforma.invoiceType !== 'proforma') {
        return res.status(400).json({ error: 'To nie jest faktura pro forma' });
      }

      return res.json({ proforma });
    } catch (error: any) {
      console.error('Get proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas pobierania faktury pro forma' });
    }
  }

  /**
   * POST /proforma
   * Utworzenie nowej faktury pro forma
   */
  static async create(req: AuthRequest, res: Response) {
    try {
      const {
        customerId,
        items,
        validUntil,
        notes,
      } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: 'Brak ID klienta' });
      }

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Brak pozycji na fakturze' });
      }

      // Get customer data
      const customer = await CustomerModel.getById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Klient nie znaleziony' });
      }

      const buyerSnapshot = {
        companyName: customer.companyName,
        customerCode: customer.customerCode,
        firstName: customer.firstName,
        lastName: customer.lastName,
        nip: customer.nip,
        street: customer.street,
        postalCode: customer.postalCode,
        city: customer.city,
        country: customer.country,
        phone: customer.phone,
        email: customer.email,
        vatEu: customer.vatEu,
      };

      const proforma = await InvoiceModel.createProforma(
        customerId,
        buyerSnapshot,
        items,
        validUntil ? new Date(validUntil) : undefined,
        notes,
        req.user?.userId
      );

      return res.status(201).json({
        message: 'Faktura pro forma utworzona',
        proforma,
      });
    } catch (error: any) {
      console.error('Create proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas tworzenia faktury pro forma' });
    }
  }

  /**
   * POST /proforma/from-order/:orderId
   * Utworzenie faktury pro forma z zamówienia
   */
  static async createFromOrder(req: AuthRequest, res: Response) {
    try {
      const orderId = parseInt(req.params.orderId);
      const { validUntil, notes } = req.body;

      // Get order
      const order = await OrderModel.getById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      if (!order.customerId) {
        return res.status(400).json({ error: 'Zamówienie nie ma przypisanego klienta' });
      }

      // Get customer data
      const customer = await CustomerModel.getById(order.customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Klient nie znaleziony' });
      }

      const buyerSnapshot = {
        companyName: customer.companyName,
        customerCode: customer.customerCode,
        firstName: customer.firstName,
        lastName: customer.lastName,
        nip: customer.nip,
        street: customer.street,
        postalCode: customer.postalCode,
        city: customer.city,
        country: customer.country,
        phone: customer.phone,
        email: customer.email,
        vatEu: customer.vatEu,
      };

      const proforma = await InvoiceModel.createProformaFromOrder(
        orderId,
        order.customerId,
        buyerSnapshot,
        validUntil ? new Date(validUntil) : undefined,
        notes,
        req.user?.userId
      );

      return res.status(201).json({
        message: 'Faktura pro forma utworzona z zamówienia',
        proforma,
      });
    } catch (error: any) {
      console.error('Create proforma from order error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas tworzenia faktury pro forma' });
    }
  }

  /**
   * POST /proforma/:id/convert
   * Konwersja faktury pro forma na fakture VAT
   */
  static async convertToInvoice(req: AuthRequest, res: Response) {
    try {
      const proformaId = parseInt(req.params.id);
      const { paymentMethod, paymentDeadline } = req.body;

      if (!paymentMethod) {
        return res.status(400).json({ error: 'Brak metody platnosci' });
      }

      if (!paymentDeadline) {
        return res.status(400).json({ error: 'Brak terminu platnosci' });
      }

      const invoice = await InvoiceModel.convertProformaToInvoice(
        proformaId,
        paymentMethod as PaymentMethod,
        new Date(paymentDeadline),
        req.user?.userId
      );

      return res.status(201).json({
        message: 'Faktura pro forma przekonwertowana na fakture VAT',
        invoice,
      });
    } catch (error: any) {
      console.error('Convert proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas konwersji faktury pro forma' });
    }
  }

  /**
   * POST /proforma/:id/clone
   * Klonowanie faktury pro forma
   */
  static async clone(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      // Get original proforma
      const originalProforma = await InvoiceModel.getById(id);

      if (!originalProforma) {
        return res.status(404).json({ error: 'Faktura pro forma nie znaleziona' });
      }

      if (originalProforma.invoiceType !== 'proforma') {
        return res.status(400).json({ error: 'To nie jest faktura pro forma' });
      }

      if (!originalProforma.customerId) {
        return res.status(400).json({ error: 'Proforma nie ma przypisanego klienta' });
      }

      const cloneCustomerId = originalProforma.customerId;

      // Get customer data
      const customer = await CustomerModel.getById(cloneCustomerId);
      if (!customer) {
        return res.status(404).json({ error: 'Klient nie znaleziony' });
      }

      const buyerSnapshot = {
        companyName: customer.companyName,
        customerCode: customer.customerCode,
        firstName: customer.firstName,
        lastName: customer.lastName,
        nip: customer.nip,
        street: customer.street,
        postalCode: customer.postalCode,
        city: customer.city,
        country: customer.country,
        phone: customer.phone,
        email: customer.email,
        vatEu: customer.vatEu,
      };

      // Prepare items for cloning
      const items = originalProforma.items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPriceNet: item.unitPriceNet,
        vatRate: item.vatRate,
        growerPassport: item.growerPassport,
      }));

      // Set new validUntil to today + 14 days
      const newValidUntil = new Date();
      newValidUntil.setDate(newValidUntil.getDate() + 14);

      // Create cloned proforma
      const clonedProforma = await InvoiceModel.createProforma(
        cloneCustomerId,
        buyerSnapshot,
        items,
        newValidUntil,
        originalProforma.notes,
        req.user?.userId
      );

      return res.status(201).json({
        message: 'Faktura pro forma sklonowana',
        proforma: clonedProforma,
      });
    } catch (error: any) {
      console.error('Clone proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas klonowania faktury pro forma' });
    }
  }

  /**
   * POST /proforma/:id/send-email
   * Wyslanie faktury pro forma emailem
   */
  static async sendEmail(req: AuthRequest, res: Response) {
    try {
      const proformaId = parseInt(req.params.id);
      const { email: customEmail, subject, message } = req.body;

      // Get proforma
      const proforma = await InvoiceModel.getById(proformaId);

      if (!proforma) {
        return res.status(404).json({ error: 'Faktura pro forma nie znaleziona' });
      }

      if (proforma.invoiceType !== 'proforma') {
        return res.status(400).json({ error: 'To nie jest faktura pro forma' });
      }

      // Get email - custom or from buyer snapshot
      const email = customEmail || proforma.buyerSnapshot?.email;

      if (!email) {
        return res.status(400).json({ error: 'Brak adresu email klienta' });
      }

      // Generate PDF
      const pdfDoc = await generateProformaPdfDirect(proforma);
      const pdfBuffer = await pdfToBuffer(pdfDoc);

      // Get customer name from buyer snapshot
      const customerName = proforma.buyerSnapshot?.companyName ||
        (proforma.buyerSnapshot?.firstName && proforma.buyerSnapshot?.lastName
          ? proforma.buyerSnapshot.firstName + ' ' + proforma.buyerSnapshot.lastName
          : undefined);

      // Send email with PDF attachment
      const sent = await emailService.sendProformaEmailWithPdf(
        email,
        proforma.invoiceNumber,
        pdfBuffer,
        customerName,
        proforma.totalGross,
        subject,
        message
      );

      if (!sent) {
        return res.status(500).json({ error: 'Nie udało się wysłać emaila' });
      }

      return res.json({
        message: 'Email zostal wyslany',
        sentTo: email,
        proformaNumber: proforma.invoiceNumber
      });
    } catch (error: any) {
      console.error('Send proforma email error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas wysyłania emaila' });
    }
  }

  /**
   * PUT /proforma/:id
   * Aktualizacja faktury pro forma
   */
  static async update(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { validUntil, notes } = req.body;

      // Check if it's a proforma
      const proforma = await InvoiceModel.getById(id);
      if (!proforma) {
        return res.status(404).json({ error: 'Faktura pro forma nie znaleziona' });
      }

      if (proforma.invoiceType !== 'proforma') {
        return res.status(400).json({ error: 'To nie jest faktura pro forma' });
      }

      const updated = await InvoiceModel.updateProformaBasic(id, {
        validUntil: validUntil ? new Date(validUntil) : undefined,
        notes
      });

      return res.json({ message: 'Faktura pro forma zaktualizowana', proforma: updated });
    } catch (error: any) {
      console.error('Update proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas aktualizacji faktury pro forma' });
    }
  }

  /**
   * DELETE /proforma/:id
   * Usuniecie faktury pro forma
   */
  static async delete(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      // Check if it's a proforma
      const proforma = await InvoiceModel.getById(id);
      if (!proforma) {
        return res.status(404).json({ error: 'Faktura pro forma nie znaleziona' });
      }

      if (proforma.invoiceType !== 'proforma') {
        return res.status(400).json({ error: 'To nie jest faktura pro forma' });
      }

      const deleted = await InvoiceModel.delete(id);

      if (!deleted) {
        return res.status(404).json({ error: 'Faktura pro forma nie znaleziona' });
      }

      return res.json({ message: 'Faktura pro forma usunieta' });
    } catch (error: any) {
      console.error('Delete proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas usuwania faktury pro forma' });
    }
  }

  /**
   * PATCH /proforma/:id/status
   * Aktualizacja statusu faktury pro forma
   */
  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Brak statusu' });
      }

      // Check if proforma exists
      const proforma = await InvoiceModel.getById(id);
      if (!proforma) {
        return res.status(404).json({ error: 'Faktura pro forma nie znaleziona' });
      }

      if (proforma.invoiceType !== 'proforma') {
        return res.status(400).json({ error: 'To nie jest faktura pro forma' });
      }

      const updated = await InvoiceModel.updateProformaStatus(id, status);

      return res.json({
        message: 'Status faktury pro forma zaktualizowany',
        proforma: updated,
      });
    } catch (error: any) {
      console.error('Update proforma status error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas aktualizacji statusu faktury pro forma' });
    }
  }

  /**
   * GET /proforma/expiring
   * Lista proform wygasajacych w ciagu X dni
   */
  static async getExpiring(req: AuthRequest, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 7;

      const proformas = await InvoiceModel.getExpiringProformas(days);

      return res.json({ proformas });
    } catch (error: any) {
      console.error("Get expiring proformas error:", error);
      return res.status(500).json({ error: error.message || "Błąd podczas pobierania wygasajacych proform" });
    }
  }

  /**
   * GET /proforma/expired
   * Lista wygaslych proform
   */
  static async getExpired(req: AuthRequest, res: Response) {
    try {
      const proformas = await InvoiceModel.getExpiredProformas();

      return res.json({ proformas });
    } catch (error: any) {
      console.error("Get expired proformas error:", error);
      return res.status(500).json({ error: error.message || "Błąd podczas pobierania wygaslych proform" });
    }
  }

  /**
   * GET /proforma/stats
   * Statystyki faktur pro forma
   */
  static async getStats(req: AuthRequest, res: Response) {
    try {
      const stats = await InvoiceModel.getProformaStats();
      return res.json(stats);
    } catch (error: any) {
      console.error('Get proforma stats error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas pobierania statystyk proform' });
    }
  }

  /**
   * GET /proforma/:id/html - Get proforma as printable HTML
   */
  static async getHTML(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Nieprawidlowe ID proformy" });
        return;
      }
      const proforma = await InvoiceModel.getById(id);
      if (!proforma) {
        res.status(404).json({ error: "Pro forma nie znaleziona" });
        return;
      }
      if (proforma.invoiceType !== "proforma") {
        res.status(400).json({ error: "To nie jest pro forma" });
        return;
      }
      const pdfDoc = await generateProformaPdfDirect(proforma);
      res.setHeader("Content-Type", "application/pdf");
      pdfDoc.pipe(res);
    } catch (error) {
      console.error("Get HTML error:", error);
      res.status(500).json({ error: "Błąd serwera podczas generowania HTML" });
    }
  }

  /**
   * GET /proforma/:id/pdf - Get proforma as PDF
   */
  static async getPdf(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Nieprawidlowe ID proformy" });
        return;
      }
      const proforma = await InvoiceModel.getById(id);
      if (!proforma) {
        res.status(404).json({ error: "Pro forma nie znaleziona" });
        return;
      }
      if (proforma.invoiceType !== "proforma") {
        res.status(400).json({ error: "To nie jest pro forma" });
        return;
      }
      const pdfDoc = await generateProformaPdfDirect(proforma);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="proforma-${proforma.invoiceNumber}.pdf"`);
      pdfDoc.pipe(res);
    } catch (error) {
      console.error("Get PDF error:", error);
      res.status(500).json({ error: "Blad serwera podczas generowania PDF" });
    }
  }
}
