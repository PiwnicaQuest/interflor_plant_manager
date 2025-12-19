import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OrderModel } from '../models/Order';
import { InvoiceModel } from '../models/Invoice';
import { ReceiptModel } from '../models/Receipt';
import { CustomerModel } from '../models/Customer';
import { CheckoutRequest, DocumentType, PaymentMethod, PaymentSplit, OrderStatus } from '../types';
import { transaction } from '../models/database';

export class POSController {
  static async checkout(req: AuthRequest, res: Response) {
    try {
      const data: CheckoutRequest = req.body;

      // Validate input
      if (!data.orderId || !data.documentType) {
        return res.status(400).json({ error: 'Brak wymaganych pól' });
      }

      // Validate payment: either single payment or split payments
      if (!data.paymentMethod && !data.paymentSplits) {
        return res.status(400).json({ error: 'Wymagana metoda płatności lub podział płatności' });
      }

      // Determine payment method and splits
      let paymentMethod: PaymentMethod;
      let paymentSplits: PaymentSplit[] | undefined;

      if (data.paymentSplits && data.paymentSplits.length > 0) {
        // Split payment
        paymentSplits = data.paymentSplits;

        // Primary payment method is the one with the highest amount
        const primarySplit = paymentSplits.reduce((max, split) =>
          split.amount > max.amount ? split : max
        , paymentSplits[0]);

        paymentMethod = primarySplit.paymentMethod;
      } else if (data.paymentMethod) {
        // Single payment (legacy)
        paymentMethod = data.paymentMethod;
        paymentSplits = undefined;
      } else {
        return res.status(400).json({ error: 'Nieprawidłowa konfiguracja płatności' });
      }

      // Get order
      const order = await OrderModel.getById(data.orderId);
      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      // Check if order is already completed
      if (order.status === OrderStatus.COMPLETED) {
        return res.status(400).json({ error: 'Zamówienie już rozliczone' });
      }

      // Use transaction for checkout
      const result = await transaction(async (client) => {
        // NOTE: Inventory is already deducted when the order is created.
        // POS checkout should NOT deduct inventory again - it only creates
        // the document (invoice/receipt) and marks the order as completed.

        // Create document (invoice or receipt)
        let documentNumber: string;
        let documentId: number;

        // Get customer if exists
        let customer = null;
        let buyerSnapshot = null;
        if (order.customerId) {
          customer = await CustomerModel.getById(order.customerId);
          if (customer) {
            buyerSnapshot = {
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
          }
        }

        // Prepare items for document
        const documentItems = (order.items || []).map(item => ({
          productId: item.productId,
          description: item.productSnapshot?.plantName || 'Produkt',
          quantity: item.quantity,
          unitPriceGross: Number(item.unitPriceGross),
          vatRate: 8.0, // Default VAT rate
        }));

        if (data.documentType === DocumentType.INVOICE) {
          if (!customer) {
            throw new Error('Klient nie znaleziony - faktura wymaga danych klienta');
          }

          // Calculate payment deadline (14 days from now)
          const paymentDeadline = new Date();
          paymentDeadline.setDate(paymentDeadline.getDate() + 14);

          const invoice = await InvoiceModel.createFromOrder(
            order.id,
            order.customerId!,
            buyerSnapshot!,
            paymentMethod,
            paymentDeadline,
            req.user?.userId,
            paymentSplits,
          );

          documentNumber = invoice.invoiceNumber;
          documentId = invoice.id;
        } else {
          // Create receipt with customer info and items - pass transaction client
          const receipt = await ReceiptModel.create(
            order.id,
            paymentMethod,
            order.totalAmount || documentItems.reduce((sum, item) => sum + (item.quantity * item.unitPriceGross), 0),
            req.user?.userId,
            undefined, // notes
            paymentSplits,
            order.customerId || undefined,
            buyerSnapshot || undefined,
            documentItems,
          );

          documentNumber = receipt.receiptNumber;
          documentId = receipt.id;
        }

        // Mark order as completed
        await OrderModel.updateStatus(order.id, OrderStatus.COMPLETED, req.user?.userId, 'Sprzedaż zamknięta');

        return {
          documentType: data.documentType,
          documentNumber,
          documentId,
          totalAmount: order.totalAmount || documentItems.reduce((sum, item) => sum + (item.quantity * item.unitPriceGross), 0),
        };
      });

      return res.json({
        message: 'Sprzedaż zamknięta',
        ...result,
      });
    } catch (error: any) {
      console.error('Checkout error:', error);
      return res.status(500).json({ error: error.message || 'Błąd serwera' });
    }
  }
}
