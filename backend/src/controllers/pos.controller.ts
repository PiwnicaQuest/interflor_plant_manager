import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OrderModel } from '../models/Order';
import { InvoiceModel } from '../models/Invoice';
import { ReceiptModel } from '../models/Receipt';
import { CustomerModel } from '../models/Customer';
import { SettingsModel } from '../models/Settings';
import { CheckoutRequest, DocumentType, PaymentMethod, PaymentSplit, OrderStatus, DailyReportData, DailyReportTransaction, DailyReportPaymentSummary, DailyReportDocumentSummary, DailyReportVatSummary } from '../types';
import { transaction, query } from '../models/database';
import { generateDailyReportPDF } from '../utils/dailyReportPdfGenerator';

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
              vatEu: customer.vatEu,
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

  /**
   * Generate daily report PDF
   */
  static async getDailyReportPDF(req: AuthRequest, res: Response) {
    try {
      const dateStr = req.query.date as string || new Date().toISOString().split('T')[0];

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: 'Nieprawidłowy format daty. Użyj YYYY-MM-DD' });
      }

      // Get completed orders for the date (including proformas)
      const orders = await OrderModel.getCompletedByDate(dateStr);

      // Get company settings
      const settings = await SettingsModel.getCompanySettings();
      const companyName = settings.companyName || 'Firma';

      // Build transactions list
      const transactions: DailyReportTransaction[] = orders.map((order: any) => {
        const completedAt = new Date(order.completedAt);
        const time = completedAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

        let documentType: 'invoice' | 'receipt' | 'proforma' = 'receipt';
        let documentNumber = order.orderNumber || '';
        let paymentMethod = '-';

        let paymentSplits: { method: string; amount: number }[] | undefined;

        if (order.document) {
          documentType = order.document.type;
          documentNumber = order.document.number || order.orderNumber;
          if (order.document.paymentSplits && Array.isArray(order.document.paymentSplits)) {
            paymentMethod = 'split';
            paymentSplits = order.document.paymentSplits.map((s: any) => ({
              method: s.paymentMethod,
              amount: Number(s.amount) || 0,
            }));
          } else {
            paymentMethod = order.document.paymentMethod || '-';
          }
        }

        return {
          time,
          documentNumber,
          documentType,
          customerName: order.customerName || 'Klient detaliczny',
          paymentMethod,
          paymentSplits,
          amount: Number(order.totalAmount) || 0,
        };
      });

      // Calculate payment summary (excluding proformas)
      const paymentSummary: DailyReportPaymentSummary[] = [];
      const paymentTotals: Record<string, { count: number; total: number }> = {
        cash: { count: 0, total: 0 },
        card: { count: 0, total: 0 },
        transfer: { count: 0, total: 0 },
      };

      transactions.forEach((tx) => {
        if (tx.documentType === 'proforma') return; // Skip proformas

        const amount = tx.amount;
        if (tx.paymentMethod === 'split' && tx.paymentSplits) {
          // Distribute split payment amounts to their respective methods
          for (const split of tx.paymentSplits) {
            if (paymentTotals[split.method]) {
              paymentTotals[split.method].count += 1;
              paymentTotals[split.method].total += split.amount;
            }
          }
        } else if (tx.paymentMethod && paymentTotals[tx.paymentMethod]) {
          paymentTotals[tx.paymentMethod].count += 1;
          paymentTotals[tx.paymentMethod].total += amount;
        }
      });

      for (const [method, data] of Object.entries(paymentTotals)) {
        if (data.count > 0) {
          paymentSummary.push({
            method: method as 'cash' | 'card' | 'transfer',
            transactionCount: data.count,
            total: data.total,
          });
        }
      }

      // Calculate document summary
      const documentSummary: DailyReportDocumentSummary[] = [];
      const docTotals: Record<string, { count: number; total: number }> = {
        invoice: { count: 0, total: 0 },
        receipt: { count: 0, total: 0 },
        proforma: { count: 0, total: 0 },
      };

      transactions.forEach((tx) => {
        if (docTotals[tx.documentType]) {
          docTotals[tx.documentType].count += 1;
          docTotals[tx.documentType].total += tx.amount;
        }
      });

      for (const [type, data] of Object.entries(docTotals)) {
        if (data.count > 0) {
          documentSummary.push({
            type: type as 'invoice' | 'receipt' | 'proforma',
            count: data.count,
            total: data.total,
          });
        }
      }

      // Get VAT breakdown from invoice items (excluding proformas)
      const vatSql = `
        SELECT
          ii.vat_rate,
          SUM(ii.total_net) as net_total,
          SUM(ii.total_vat) as vat_total,
          SUM(ii.total_gross) as gross_total
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE (i.invoice_type = 'invoice' OR i.invoice_type IS NULL)
          AND DATE(i.created_at) = $1
        GROUP BY ii.vat_rate
        ORDER BY ii.vat_rate
      `;
      const vatResult = await query(vatSql, [dateStr]);

      // Also get VAT from receipts - calculate net and vat from gross
      const receiptVatSql = `
        SELECT
          ri.vat_rate,
          SUM(ri.total_gross / (1 + ri.vat_rate / 100)) as net_total,
          SUM(ri.total_gross - (ri.total_gross / (1 + ri.vat_rate / 100))) as vat_total,
          SUM(ri.total_gross) as gross_total
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE DATE(r.created_at) = $1
        GROUP BY ri.vat_rate
        ORDER BY ri.vat_rate
      `;
      const receiptVatResult = await query(receiptVatSql, [dateStr]);

      // Combine VAT summaries
      const vatMap: Record<number, DailyReportVatSummary> = {};

      [...vatResult.rows, ...receiptVatResult.rows].forEach((row: any) => {
        const rate = Number(row.vatRate) || 0;
        if (!vatMap[rate]) {
          vatMap[rate] = { vatRate: rate, netTotal: 0, vatTotal: 0, grossTotal: 0 };
        }
        vatMap[rate].netTotal += Number(row.netTotal) || 0;
        vatMap[rate].vatTotal += Number(row.vatTotal) || 0;
        vatMap[rate].grossTotal += Number(row.grossTotal) || 0;
      });

      const vatSummary: DailyReportVatSummary[] = Object.values(vatMap).sort((a, b) => a.vatRate - b.vatRate);

      // Calculate totals (excluding proformas)
      const nonProformaTx = transactions.filter(tx => tx.documentType !== 'proforma');
      const totals = {
        transactionCount: nonProformaTx.length,
        grandTotal: nonProformaTx.reduce((sum, tx) => sum + tx.amount, 0),
        netTotal: vatSummary.reduce((sum, v) => sum + v.netTotal, 0),
        vatTotal: vatSummary.reduce((sum, v) => sum + v.vatTotal, 0),
        grossTotal: vatSummary.reduce((sum, v) => sum + v.grossTotal, 0),
      };

      // Build report data
      const reportData: DailyReportData = {
        reportDate: dateStr,
        generatedAt: new Date().toLocaleString('pl-PL'),
        operatorName: req.user?.email || 'System',
        companyName,
        transactions,
        paymentSummary,
        documentSummary,
        vatSummary,
        totals,
      };

      // Generate PDF
      const pdfDoc = generateDailyReportPDF(reportData);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="raport-dobowy-${dateStr}.pdf"`);

      // Pipe PDF to response
      pdfDoc.pipe(res);
    } catch (error: any) {
      console.error('Generate daily report PDF error:', error);
      return res.status(500).json({ error: error.message || 'Błąd generowania raportu' });
    }
  }
}
