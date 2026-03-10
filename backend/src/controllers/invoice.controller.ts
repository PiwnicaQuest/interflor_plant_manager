import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InvoiceModel } from '../models/Invoice';
import { CustomerModel } from '../models/Customer';
import { OrderModel } from '../models/Order';
import { PaymentMethod } from '../types';
import { generateInvoicePdfDirect } from '../utils/invoicePdfGenerator';
import { emailService } from '../services/emailService';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';

// Helper function to convert PDFKit stream to Buffer
async function pdfToBuffer(pdfDoc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
  });
}

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

  // Helper to create recipient snapshot from customer if recipient fields are set
  private static createRecipientSnapshot(customer: any) {
    const hasRecipient = customer.recipientCompanyName || 
                         customer.recipientFirstName || 
                         customer.recipientLastName || 
                         customer.recipientStreet;
    
    if (!hasRecipient) {
      return undefined;
    }

    return {
      companyName: customer.recipientCompanyName,
      firstName: customer.recipientFirstName,
      lastName: customer.recipientLastName,
      street: customer.recipientStreet || '',
      postalCode: customer.recipientPostalCode || '',
      city: customer.recipientCity || '',
      country: '',
      phone: customer.recipientPhone || '',
      email: '',
    };
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
          vatEu: customer.vatEu,
        };

        // Create recipient snapshot if customer has recipient data
        const recipientSnapshot = InvoiceController.createRecipientSnapshot(customer);

        const deadline = paymentDeadline ? new Date(paymentDeadline) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const invoice = await InvoiceModel.createFromOrder(
          orderId,
          customerId,
          buyerSnapshot,
          paymentMethod as PaymentMethod,
          deadline,
          req.user?.userId,
          undefined, // paymentSplits
          recipientSnapshot
        );

        return res.status(201).json({
          message: 'Faktura utworzona',
          invoiceNumber: invoice.invoiceNumber,
          invoiceId: invoice.id,
        });
      } else {
        // Create standalone invoice - also create an order so it shows in POS history
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
          vatEu: customer.vatEu,
        };

        const recipientSnapshot = InvoiceController.createRecipientSnapshot(customer);
        const deadline = paymentDeadline ? new Date(paymentDeadline) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        // Create order from invoice items so it appears in POS history
        const orderItems = items.filter((i: any) => i.productId).map((i: any) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPriceGross: i.unitPriceGross || Math.round(i.unitPriceNet * (1 + (i.vatRate || 8) / 100) * 100) / 100,
        }));

        let createdOrderId: number | undefined;

        if (orderItems.length > 0) {
          try {
            const order = await OrderModel.create(
              customerId,
              orderItems,
              buyerSnapshot as any,
              req.user?.userId,
              undefined,
              recipientSnapshot as any,
              'panel'
            );
            createdOrderId = order.id;

            // Mark order as completed immediately
            await OrderModel.updateStatus(order.id, 'completed' as any, req.user?.userId, 'Faktura z panelu');
          } catch (orderErr) {
            console.error('Error creating order for invoice:', orderErr);
            // Continue - invoice can still be created without order
          }
        }

        const invoice = await InvoiceModel.create(
          customerId,
          buyerSnapshot,
          items,
          paymentMethod as PaymentMethod,
          deadline,
          req.user?.userId,
          recipientSnapshot,
          createdOrderId
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

      // Generate PDF using new unified generator
      const pdfDoc = await generateInvoicePdfDirect(invoice);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Faktura_${invoice.invoiceNumber.replace(/\//g, '_')}.pdf`);

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
        res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        return;
      }

      const invoice = await InvoiceModel.getById(id);

      if (!invoice) {
        res.status(404).json({ error: 'Faktura nie znaleziona' });
        return;
      }
      // Generate HTML
      const html = await generateInvoiceHtml(invoice);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error('Get HTML error:', error);
      res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async sendEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { email: customEmail, subject, message } = req.body;

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
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

      // Generate PDF using new unified generator
      const pdfDoc = await generateInvoicePdfDirect(invoice);
      const pdfBuffer = await pdfToBuffer(pdfDoc);

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
        res.json({ success: true, message: 'Faktura wysłana na adres ' + recipientEmail });
      } else {
        res.status(500).json({ error: 'Nie udało się wysłać emaila. Sprawdź konfigurację SMTP.' });
      }
    } catch (error) {
      console.error('Send invoice email error:', error);
      res.status(500).json({ error: 'Błąd serwera podczas wysyłania faktury' });
    }
  }

  static async updatePaymentMethod(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { paymentMethod } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
      }

      const validMethods = ['cash', 'card', 'transfer'];
      if (!paymentMethod || !validMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: 'Nieprawidłowa forma płatności. Dozwolone: cash, card, transfer' });
      }

      const invoice = await InvoiceModel.updatePaymentMethod(
        id,
        paymentMethod as PaymentMethod,
        req.user?.userId
      );

      if (!invoice) {
        return res.status(404).json({ error: 'Faktura nie znaleziona' });
      }

      return res.json({
        message: 'Forma płatności zaktualizowana',
        invoice,
      });
    } catch (error) {
      console.error('Update payment method error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getAuditLog(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
      }

      const auditLog = await InvoiceModel.getAuditLog(id);

      return res.json({ auditLog });
    } catch (error) {
      console.error('Get audit log error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }
}
