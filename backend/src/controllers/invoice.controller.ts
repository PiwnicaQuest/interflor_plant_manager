import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InvoiceModel } from '../models/Invoice';
import { CustomerModel } from '../models/Customer';
import { PaymentMethod } from '../types';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import { generateInvoicePDFPuppeteer } from '../utils/invoicePdfPuppeteer';
import { emailService } from '../services/emailService';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';

export class InvoiceController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, customerId, paymentStatus, paymentMethod } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (customerId) filters.customerId = parseInt(customerId as string);
      if (paymentStatus) filters.paymentStatus = paymentStatus as string;
      if (paymentMethod) filters.paymentMethod = paymentMethod as string;

      const invoices = await InvoiceModel.getAll(filters);

      return res.json({ invoices });
    } catch (error) {
      console.error('Get invoices error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      const invoice = await InvoiceModel.getById(id);

      if (!invoice) {
        return res.status(404).json({ error: 'Faktura nie znaleziona' });
      }

      return res.json({ invoice });
    } catch (error) {
      console.error('Get invoice error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { orderId, customerId, paymentMethod, paymentDeadline, items } = req.body;

      if (orderId) {
        // Create from order
        const customer = await CustomerModel.getById(customerId);
        if (!customer) {
          return res.status(404).json({ error: 'Klient nie znaleziony' });
        }

        const buyerSnapshot = {
          customerCode: customer.customerCode,
          companyName: customer.companyName,
          firstName: customer.firstName,
          lastName: customer.lastName,
          nip: customer.nip,
          street: customer.street,
          postalCode: customer.postalCode,
          city: customer.city,
          country: customer.country,
          phone: customer.phone,
          email: customer.email,
        };

        const deadline = paymentDeadline ? new Date(paymentDeadline) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const invoice = await InvoiceModel.createFromOrder(
          orderId,
          customerId,
          buyerSnapshot,
          paymentMethod as PaymentMethod,
          deadline,
          req.user?.userId
        );

        return res.status(201).json({
          message: 'Faktura utworzona',
          invoiceNumber: invoice.invoiceNumber,
          invoiceId: invoice.id,
        });
      } else {
        // Create standalone invoice
        if (!customerId || !items || items.length === 0) {
          return res.status(400).json({ error: 'Brak wymaganych pól' });
        }

        const customer = await CustomerModel.getById(customerId);
        if (!customer) {
          return res.status(404).json({ error: 'Klient nie znaleziony' });
        }

        const buyerSnapshot = {
          customerCode: customer.customerCode,
          companyName: customer.companyName,
          firstName: customer.firstName,
          lastName: customer.lastName,
          nip: customer.nip,
          street: customer.street,
          postalCode: customer.postalCode,
          city: customer.city,
          country: customer.country,
          phone: customer.phone,
          email: customer.email,
        };

        const deadline = paymentDeadline ? new Date(paymentDeadline) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const invoice = await InvoiceModel.create(
          customerId,
          buyerSnapshot,
          items,
          paymentMethod as PaymentMethod,
          deadline,
          req.user?.userId
        );

        return res.status(201).json({
          message: 'Faktura utworzona',
          invoiceNumber: invoice.invoiceNumber,
          invoiceId: invoice.id,
        });
      }
    } catch (error) {
      console.error('Create invoice error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getPDF(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        return;
      }

      // Get invoice with items
      const invoice = await InvoiceModel.getById(id);

      if (!invoice) {
        res.status(404).json({ error: 'Faktura nie znaleziona' });
        return;
      }

      // Generate PDF (now async to fetch company settings)
      const pdfDoc = await generateInvoicePDF(invoice);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Faktura_${invoice.invoiceNumber}.pdf`);

      // Pipe PDF to response
      pdfDoc.pipe(res);
    } catch (error) {
      console.error('Get PDF error:', error);
      res.status(500).json({ error: 'Błąd serwera podczas generowania PDF' });
    }
  }

  static async updatePaymentStatus(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { paidAmount } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
      }

      if (paidAmount === undefined || paidAmount < 0) {
        return res.status(400).json({ error: 'Nieprawidłowa kwota płatności' });
      }

      const invoice = await InvoiceModel.updatePaymentStatus(id, paidAmount);

      if (!invoice) {
        return res.status(404).json({ error: 'Faktura nie znaleziona' });
      }

      return res.json({
        message: 'Status płatności zaktualizowany',
        invoice,
      });
    } catch (error) {
      console.error('Update payment status error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getHTML(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: "Nieprawidłowe ID faktury" });
        return;
      }

      const invoice = await InvoiceModel.getById(id);

      if (!invoice) {
        res.status(404).json({ error: "Faktura nie znaleziona" });
        return;
      }

      const html = await generateInvoiceHtml(invoice);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("Get HTML error:", error);
      res.status(500).json({ error: "Błąd serwera podczas generowania HTML" });
    }
  }


  static async sendEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { email: customEmail, subject, message } = req.body;

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidlowe ID faktury' });
        return;
      }

      const invoice = await InvoiceModel.getById(id);

      if (!invoice) {
        res.status(404).json({ error: 'Faktura nie znaleziona' });
        return;
      }

      // Get email - custom or from buyer snapshot
      const recipientEmail = customEmail || invoice.buyerSnapshot?.email;

      if (!recipientEmail) {
        res.status(400).json({ error: 'Brak adresu email klienta' });
        return;
      }

      // Generate PDF using puppeteer for consistent styling with print
      const pdfBuffer = await generateInvoicePDFPuppeteer(invoice);

      // Get customer name
      const buyerSnapshot = invoice.buyerSnapshot;
      let customerName: string | undefined;
      if (buyerSnapshot?.companyName) {
        customerName = buyerSnapshot.companyName;
      } else if (buyerSnapshot?.firstName) {
        customerName = buyerSnapshot.firstName + (buyerSnapshot.lastName ? ' ' + buyerSnapshot.lastName : '');
      }

      // Format payment deadline
      let paymentDeadline: string | undefined;
      if (invoice.paymentDeadline) {
        paymentDeadline = new Date(invoice.paymentDeadline).toLocaleDateString('pl-PL');
      }

      // Send email
      const sent = await emailService.sendInvoiceEmail(
        recipientEmail,
        invoice.invoiceNumber,
        pdfBuffer,
        customerName,
        invoice.totalGross,
        paymentDeadline,
        subject,
        message
      );

      if (sent) {
        res.json({ success: true, message: 'Faktura wyslana na adres ' + recipientEmail });
      } else {
        res.status(500).json({ error: 'Nie udalo sie wyslac emaila. Sprawdz konfiguracje SMTP.' });
      }
    } catch (error) {
      console.error('Send invoice email error:', error);
      res.status(500).json({ error: 'Blad serwera podczas wysylania faktury' });
    }
  }

}
