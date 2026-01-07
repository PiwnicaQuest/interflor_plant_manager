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

      // Validate payment: required for INVOICE and RECEIPT, NOT for PROFORMA
      if (data.documentType !== DocumentType.PROFORMA) {
        if (!data.paymentMethod && !data.paymentSplits) {
          return res.status(400).json({ error: 'Wymagana metoda płatności lub podział płatności' });
        }
      }

      // Determine payment method and splits
      let paymentMethod: PaymentMethod;
      let paymentSplits: PaymentSplit[] | undefined;

      if (data.documentType !== DocumentType.PROFORMA) {
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

        if (data.documentType === DocumentType.PROFORMA) {
          // PROFORMA - create proforma, do NOT close order
          if (!customer) {
            throw new Error('Proforma wymaga danych klienta');
          }

          // Calculate validity date (default 14 days)
          const validUntil = new Date();
          validUntil.setDate(validUntil.getDate() + 14);

          const proforma = await InvoiceModel.createProformaFromOrder(
            order.id,
            order.customerId!,
            buyerSnapshot!,
            validUntil,
            undefined, // notes
            req.user?.userId
          );

          documentNumber = proforma.invoiceNumber;
          documentId = proforma.id;
          
          // DO NOT update order status - keep it open
        } else if (data.documentType === DocumentType.INVOICE) {
          if (!customer) {
            throw new Error('Klient nie znaleziony - faktura wymaga danych klienta');
          }

          // Payment deadline ONLY for transfer payments
          // For cash and card payments, deadline is null (immediate payment)
          let paymentDeadline: Date | null = null;

          // Check if payment is transfer (single or dominant in split)
          const isTransferPayment = paymentMethod === PaymentMethod.TRANSFER;

          if (isTransferPayment) {
            // Use provided days or default to 14 days
            const deadlineDays = data.paymentDeadlineDays || 14;
            paymentDeadline = new Date();
            paymentDeadline.setDate(paymentDeadline.getDate() + deadlineDays);
          }

          const invoice = await InvoiceModel.createFromOrder(
            order.id,
            order.customerId!,
            buyerSnapshot!,
            paymentMethod!,
            paymentDeadline,
            req.user?.userId,
            paymentSplits,
            order.recipientSnapshot,
          );

          documentNumber = invoice.invoiceNumber;
          documentId = invoice.id;

          // Mark order as completed for INVOICE
          await OrderModel.updateStatus(order.id, OrderStatus.COMPLETED, req.user?.userId, 'Sprzedaż zamknięta');
        } else {
          // Create receipt with customer info and items - pass transaction client
          const receipt = await ReceiptModel.create(
            order.id,
            paymentMethod!,
            order.totalAmount || documentItems.reduce((sum, item) => sum + (item.quantity * item.unitPriceGross), 0),
            req.user?.userId,
            undefined, // notes
            paymentSplits,
            
            order.customerId || undefined,
            buyerSnapshot || undefined,
            order.recipientSnapshot,
            documentItems,
          );

          documentNumber = receipt.receiptNumber;
          documentId = receipt.id;

          // Mark order as completed for RECEIPT
          await OrderModel.updateStatus(order.id, OrderStatus.COMPLETED, req.user?.userId, 'Sprzedaż zamknięta');
        }

        return {
          documentType: data.documentType,
          documentNumber,
          documentId,
          totalAmount: order.totalAmount || documentItems.reduce((sum, item) => sum + (item.quantity * item.unitPriceGross), 0),
        };
      });

      const message = data.documentType === DocumentType.PROFORMA 
        ? 'Proforma utworzona' 
        : 'Sprzedaż zamknięta';

      return res.json({
        message,
        ...result,
      });
    } catch (error: any) {
      console.error('Checkout error:', error);
      return res.status(500).json({ error: error.message || 'Błąd serwera' });
    }
  }

  static async getTodayCompleted(req: AuthRequest, res: Response) {
    try {
      const orders = await OrderModel.getCompletedToday();

      // Calculate summary by payment method
      let cashTotal = 0;
      let cardTotal = 0;
      let transferTotal = 0;
      let grandTotal = 0;

      orders.forEach((order: any) => {
        const amount = Number(order.totalAmount) || 0;
        grandTotal += amount;

        // Check payment method from document
        if (order.document) {
          // Handle split payments
          if (order.document.paymentSplits && Array.isArray(order.document.paymentSplits)) {
            order.document.paymentSplits.forEach((split: any) => {
              const splitAmount = Number(split.amount) || 0;
              switch (split.paymentMethod) {
                case 'cash':
                  cashTotal += splitAmount;
                  break;
                case 'card':
                  cardTotal += splitAmount;
                  break;
                case 'transfer':
                  transferTotal += splitAmount;
                  break;
              }
            });
          } else {
            // Single payment method
            switch (order.document.paymentMethod) {
              case 'cash':
                cashTotal += amount;
                break;
              case 'card':
                cardTotal += amount;
                break;
              case 'transfer':
                transferTotal += amount;
                break;
            }
          }
        }
      });

      const summary = {
        totalTransactions: orders.length,
        cashTotal,
        cardTotal,
        transferTotal,
        grandTotal,
      };

      return res.json({ orders, summary });
    } catch (error: any) {
      console.error('Get today completed orders error:', error);
      return res.status(500).json({ error: error.message || 'Błąd serwera' });
    }
  }
}
