import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InvoiceModel } from '../models/Invoice';
import { CustomerModel } from '../models/Customer';
import { OrderModel } from '../models/Order';
import { PaymentMethod } from '../types';

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
   * Konwersja faktury pro forma na fakturę VAT
   */
  static async convertToInvoice(req: AuthRequest, res: Response) {
    try {
      const proformaId = parseInt(req.params.id);
      const { paymentMethod, paymentDeadline } = req.body;

      if (!paymentMethod) {
        return res.status(400).json({ error: 'Brak metody płatności' });
      }

      if (!paymentDeadline) {
        return res.status(400).json({ error: 'Brak terminu płatności' });
      }

      const invoice = await InvoiceModel.convertProformaToInvoice(
        proformaId,
        paymentMethod as PaymentMethod,
        new Date(paymentDeadline),
        req.user?.userId
      );

      return res.status(201).json({
        message: 'Faktura pro forma przekonwertowana na fakturę VAT',
        invoice,
      });
    } catch (error: any) {
      console.error('Convert proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas konwersji faktury pro forma' });
    }
  }

  /**
   * DELETE /proforma/:id
   * Usunięcie faktury pro forma
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

      return res.json({ message: 'Faktura pro forma usunięta' });
    } catch (error: any) {
      console.error('Delete proforma error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas usuwania faktury pro forma' });
    }
  }
}
