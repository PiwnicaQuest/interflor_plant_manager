import { query, transaction } from './database';
import { Invoice, InvoiceItem, InvoiceWithItems, PaymentMethod, CustomerSnapshot, PaymentSplit, InvoiceType, ProformaStatus } from '../types';

// Helper function to round to 2 decimal places (for currency calculations)
const round2 = (num: number): number => Math.round(num * 100) / 100;

// EU VAT number prefixes (excluding PL)
const EU_VAT_PREFIXES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'RO', 'SE', 'SI', 'SK'];

// Helper function to detect WDT (Intra-Community Supply)
const isWdtTransaction = (buyerSnapshot: CustomerSnapshot): boolean => {
  const country = buyerSnapshot.country?.toLowerCase() || '';
  const isPolish = country === 'polska' || country === 'poland' || country === '';
  
  if (isPolish) return false;
  
  // Check vatEu field
  if (buyerSnapshot.vatEu && buyerSnapshot.vatEu.trim() !== '') {
    return true;
  }
  
  // Check if NIP starts with EU country prefix (e.g., CZ12345678)
  const nip = (buyerSnapshot.nip || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const prefix of EU_VAT_PREFIXES) {
    if (nip.startsWith(prefix)) {
      return true;
    }
  }
  
  return false;
};

export class InvoiceModel {
  static async getAll(filters?: {
    startDate?: Date;
    endDate?: Date;
    customerId?: number;
    invoiceType?: InvoiceType;
    paymentStatus?: string;
    paymentMethod?: string;
  }): Promise<(Invoice & { customerName?: string })[]> {
    let sql = `SELECT *,
      COALESCE(
        buyer_snapshot->>'companyName',
        CONCAT(buyer_snapshot->>'firstName', ' ', buyer_snapshot->>'lastName')
      ) as customer_name
      FROM invoices WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      sql += ` AND issue_date >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      sql += ` AND issue_date <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.customerId) {
      sql += ` AND customer_id = $${paramIndex}`;
      params.push(filters.customerId);
      paramIndex++;
    }

    if (filters?.paymentStatus) {
      if (filters.paymentStatus === 'not_paid') {
        // Special filter: all not fully paid (unpaid, partially_paid, overdue)
        sql += ` AND payment_status IN ('unpaid', 'partially_paid', 'overdue')`;
      } else {
        sql += ` AND payment_status = $${paramIndex}`;
        params.push(filters.paymentStatus);
        paramIndex++;
      }
    }


    if (filters?.paymentMethod) {
      sql += ` AND payment_method = $${paramIndex}`;
      params.push(filters.paymentMethod);
      paramIndex++;
    }
    if (filters?.invoiceType) {
      sql += ` AND invoice_type = $${paramIndex}`;
      params.push(filters.invoiceType);
      paramIndex++;
    } else {
      // Default: show only regular invoices (not proforma)
      sql += ` AND (invoice_type = 'invoice' OR invoice_type IS NULL)`;
    }

    sql += ' ORDER BY issue_date DESC, id DESC';

    const result = await query<Invoice & { customerName?: string }>(sql, params);
    return result.rows;
  }

  static async getAllProforma(filters?: {
    startDate?: Date;
    endDate?: Date;
    customerId?: number;
  }): Promise<(Invoice & { customerName?: string })[]> {
    let sql = `SELECT *,
      COALESCE(
        buyer_snapshot->>'companyName',
        CONCAT(buyer_snapshot->>'firstName', ' ', buyer_snapshot->>'lastName')
      ) as customer_name
      FROM invoices WHERE invoice_type = 'proforma'`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      sql += ` AND issue_date >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      sql += ` AND issue_date <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.customerId) {
      sql += ` AND customer_id = $${paramIndex}`;
      params.push(filters.customerId);
      paramIndex++;
    }

    sql += ' ORDER BY issue_date DESC, id DESC';

    const result = await query<Invoice & { customerName?: string }>(sql, params);
    return result.rows;
  }

  static async getById(id: number): Promise<(InvoiceWithItems & { customerName?: string }) | null> {
    const invoiceResult = await query<Invoice & { customerName?: string }>(
      `SELECT *,
        COALESCE(
          buyer_snapshot->>'companyName',
          CONCAT(buyer_snapshot->>'firstName', ' ', buyer_snapshot->>'lastName')
        ) as customer_name
        FROM invoices WHERE id = $1`,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      return null;
    }

    const invoice = invoiceResult.rows[0];

    const itemsResult = await query<InvoiceItem>(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY description ASC NULLS LAST, id ASC',
      [id]
    );

    return {
      ...invoice,
      items: itemsResult.rows,
    };
  }

  static async getByInvoiceNumber(invoiceNumber: string): Promise<InvoiceWithItems | null> {
    const invoiceResult = await query<Invoice>(
      'SELECT * FROM invoices WHERE invoice_number = $1',
      [invoiceNumber]
    );

    if (invoiceResult.rows.length === 0) {
      return null;
    }

    return this.getById(invoiceResult.rows[0].id);
  }

  static async createProforma(
    customerId: number,
    buyerSnapshot: CustomerSnapshot,
    items: Array<{
      productId?: number;
      description: string;
      quantity: number;
      unitPriceNet: number;
      unitPriceGross?: number;
      vatRate: number;
      growerPassport?: string;
    }>,
    validUntil?: Date,
    notes?: string,
    createdByUserId?: number
  ): Promise<InvoiceWithItems> {
    return transaction(async (client) => {
      // Generate proforma number
      const proformaNumberResult = await client.query<{ getNextProformaNumber: string }>(
        "SELECT get_next_proforma_number()"
      );
      const proformaNumber = proformaNumberResult.rows[0].getNextProformaNumber;

      // Calculate totals
      let subtotalNet = 0;
      let totalVat = 0;
      let totalGross = 0;

      for (const item of items) {
        const itemTotalNet = round2(item.unitPriceNet * item.quantity);
        const itemTotalVat = round2(itemTotalNet * (item.vatRate / 100));
        const itemTotalGross = round2(itemTotalNet + itemTotalVat);

        subtotalNet += itemTotalNet;
        totalVat += itemTotalVat;
        totalGross += itemTotalGross;
      }

      // Round final totals
      subtotalNet = round2(subtotalNet);
      totalVat = round2(totalVat);
      totalGross = round2(totalGross);

      // Insert proforma invoice
      const invoiceResult = await client.query<Invoice>(
        `INSERT INTO invoices (
          invoice_number, customer_id, buyer_snapshot,
          issue_date, sale_date, payment_deadline,
          payment_status, paid_amount,
          subtotal_net, total_vat, total_gross,
          created_by_user_id, notes, invoice_type
        ) VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, $4, 'unpaid'::payment_status, 0, $5, $6, $7, $8, $9, 'proforma'::invoice_type)
        RETURNING *`,
        [
          proformaNumber,
          customerId,
          JSON.stringify(buyerSnapshot),
          validUntil,
          subtotalNet,
          totalVat,
          totalGross,
          createdByUserId,
          notes,
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Insert invoice items
      const insertedItems: InvoiceItem[] = [];
      for (const item of items) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, unit_price_gross, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
            (item.unitPriceGross ?? Number((item.unitPriceNet * (1 + item.vatRate / 100)).toFixed(2))),
            item.vatRate,
            item.growerPassport,
          ]
        );

        insertedItems.push(itemResult.rows[0]);
      }

      return {
        ...invoice,
        items: insertedItems,
      };
    });
  }

  static async createProformaFromOrder(
    orderId: number,
    customerId: number,
    buyerSnapshot: CustomerSnapshot,
    validUntil?: Date,
    notes?: string,
    createdByUserId?: number
  ): Promise<InvoiceWithItems> {
    return transaction(async (client) => {
      // Generate proforma number
      const proformaNumberResult = await client.query<{ getNextProformaNumber: string }>(
        "SELECT get_next_proforma_number()"
      );
      const proformaNumber = proformaNumberResult.rows[0].getNextProformaNumber;

      // Get order items
      const orderItemsResult = await client.query(
        `SELECT oi.*, p.vat_rate
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      const orderItems = orderItemsResult.rows;

      // Check if WDT (EU company with VAT-EU number, not Poland)
      const isWdt = isWdtTransaction(buyerSnapshot);
      const transactionType = isWdt ? 'wdt' : 'domestic';

      // Calculate totals
      let subtotalNet = 0;
      let totalVat = 0;
      let totalGross = 0;

      const invoiceItems: Array<{
        productId: number;
        description: string;
        quantity: number;
        unitPriceNet: number;
      unitPriceGross?: number;
        vatRate: number;
        growerPassport?: string;
      }> = [];

      for (const item of orderItems) {
        // Original VAT rate from product
        const originalVatRate = item.vatRate || 8.0;
        // For WDT, VAT rate is 0%
        const vatRate = isWdt ? 0 : originalVatRate;
        
        // Calculate original net price from gross (removing Polish VAT)
        const originalUnitPriceGross = item.unitPriceGross;
        const originalUnitPriceNet = round2(originalUnitPriceGross / (1 + originalVatRate / 100));
        
        // For WDT: customer pays NET price (no Polish VAT), gross = net because VAT = 0%
        // For domestic: normal gross/net calculation
        const unitPriceNet = originalUnitPriceNet;
        const unitPriceGross = isWdt ? originalUnitPriceNet : originalUnitPriceGross;

        // Calculate totals
        const itemTotalNet = round2(unitPriceNet * item.quantity);
        const itemTotalGross = round2(unitPriceGross * item.quantity);
        const itemTotalVat = isWdt ? 0 : round2(itemTotalGross - itemTotalNet);

        subtotalNet += itemTotalNet;
        totalVat += itemTotalVat;
        totalGross += itemTotalGross;

        const productSnapshot = item.productSnapshot || {};
        const description = productSnapshot.plantName || 'Produkt';

        invoiceItems.push({
          productId: item.productId,
          description,
          quantity: item.quantity,
          unitPriceNet,
          unitPriceGross,
          vatRate,
          growerPassport: productSnapshot.growerPassport,
        });
      }

      // Round final totals
      subtotalNet = round2(subtotalNet);
      totalVat = round2(totalVat);
      totalGross = round2(totalGross);

      // Insert proforma invoice
      const invoiceResult = await client.query<Invoice>(
        `INSERT INTO invoices (
          invoice_number, order_id, customer_id, buyer_snapshot,
          issue_date, sale_date, payment_deadline,
          payment_status, paid_amount,
          subtotal_net, total_vat, total_gross,
          created_by_user_id, notes, invoice_type, transaction_type
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE, $5, 'unpaid'::payment_status, 0, $6, $7, $8, $9, $10, 'proforma'::invoice_type, $11::transaction_type)
        RETURNING *`,
        [
          proformaNumber,
          orderId,
          customerId,
          JSON.stringify(buyerSnapshot),
          validUntil,
          subtotalNet,
          totalVat,
          totalGross,
          createdByUserId,
          notes,
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Insert invoice items
      const insertedItems: InvoiceItem[] = [];
      for (const item of invoiceItems) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, unit_price_gross, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
            (item.unitPriceGross ?? Number((item.unitPriceNet * (1 + item.vatRate / 100)).toFixed(2))),
            item.vatRate,
            item.growerPassport,
          ]
        );

        insertedItems.push(itemResult.rows[0]);
      }

      return {
        ...invoice,
        items: insertedItems,
      };
    });
  }

  static async convertProformaToInvoice(
    proformaId: number,
    paymentMethod: PaymentMethod,
    paymentDeadline: Date | null,
    createdByUserId?: number
  ): Promise<InvoiceWithItems> {
    return transaction(async (client) => {
      // Get proforma
      const proformaResult = await client.query<Invoice>(
        'SELECT * FROM invoices WHERE id = $1 AND invoice_type = \'proforma\'',
        [proformaId]
      );

      if (proformaResult.rows.length === 0) {
        throw new Error('Faktura pro forma nie istnieje');
      }

      const proforma = proformaResult.rows[0];

      // Get proforma items
      const itemsResult = await client.query<InvoiceItem>(
        'SELECT * FROM invoice_items WHERE invoice_id = $1',
        [proformaId]
      );

      // Generate invoice number
      const invoiceNumberResult = await client.query(
        "SELECT get_next_document_number('invoice', 'FV')"
      );
      const invoiceNumber = invoiceNumberResult.rows[0].getNextDocumentNumber || invoiceNumberResult.rows[0].get_next_document_number;

      // Determine payment status based on payment method
      const isImmediatePayment = paymentMethod === 'cash' || paymentMethod === 'card';
      const initialPaymentStatus = isImmediatePayment ? 'paid' : 'unpaid';
      const initialPaidAmount = isImmediatePayment ? proforma.totalGross : 0;

      // Insert new invoice
      const invoiceResult = await client.query<Invoice>(
        `INSERT INTO invoices (
          invoice_number, order_id, customer_id, buyer_snapshot,
          issue_date, sale_date, payment_deadline, payment_method,
          payment_status, paid_amount,
          subtotal_net, total_vat, total_gross,
          created_by_user_id, notes, invoice_type, proforma_id
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE, $5, $6, $7::payment_status, $8, $9, $10, $11, $12, $13, 'invoice'::invoice_type, $14)
        RETURNING *`,
        [
          invoiceNumber,
          proforma.orderId,
          proforma.customerId,
          JSON.stringify(proforma.buyerSnapshot),
          paymentDeadline,
          paymentMethod,
          initialPaymentStatus,
          initialPaidAmount,
          proforma.subtotalNet,
          proforma.totalVat,
          proforma.totalGross,
          createdByUserId,
          proforma.notes,
          proformaId,
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Copy invoice items
      const insertedItems: InvoiceItem[] = [];
      for (const item of itemsResult.rows) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, unit_price_gross, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
            (item.unitPriceGross ?? Number((item.unitPriceNet * (1 + item.vatRate / 100)).toFixed(2))),
            item.vatRate,
            item.growerPassport,
          ]
        );

        insertedItems.push(itemResult.rows[0]);
      }

      return {
        ...invoice,
        items: insertedItems,
      };
    });
  }

  static async createFromOrder(
    orderId: number,
    customerId: number,
    buyerSnapshot: CustomerSnapshot,
    paymentMethod: PaymentMethod,
    paymentDeadline: Date | null,
    createdByUserId?: number,
    paymentSplits?: PaymentSplit[],
    recipientSnapshot?: CustomerSnapshot
  ): Promise<InvoiceWithItems> {
    return transaction(async (client) => {
      // Generate invoice number
      const invoiceNumberResult = await client.query(
        "SELECT get_next_document_number('invoice', 'FV')"
      );
      const invoiceNumber = invoiceNumberResult.rows[0].getNextDocumentNumber || invoiceNumberResult.rows[0].get_next_document_number;

      // Get order items
      const orderItemsResult = await client.query(
        `SELECT oi.*, p.vat_rate
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      const orderItems = orderItemsResult.rows;

      // Calculate totals
      let subtotalNet = 0;
      let totalVat = 0;
      let totalGross = 0;

      const invoiceItems: Array<{
        productId: number;
        description: string;
        quantity: number;
        unitPriceNet: number;
      unitPriceGross?: number;
        vatRate: number;
        growerPassport?: string;
      }> = [];

      // Check if WDT (EU company with VAT-EU number, not Poland)
      const isWdt = isWdtTransaction(buyerSnapshot);
      const transactionType = isWdt ? 'wdt' : 'domestic';

      for (const item of orderItems) {
        // Original VAT rate from product
        const originalVatRate = item.vatRate || 8.0;
        // For WDT, VAT rate is 0%
        const vatRate = isWdt ? 0 : originalVatRate;
        
        // Calculate original net price from gross (removing Polish VAT)
        const originalUnitPriceGross = item.unitPriceGross;
        const originalUnitPriceNet = round2(originalUnitPriceGross / (1 + originalVatRate / 100));
        
        // For WDT: customer pays NET price (no Polish VAT), gross = net because VAT = 0%
        // For domestic: normal gross/net calculation
        const unitPriceNet = originalUnitPriceNet;
        const unitPriceGross = isWdt ? originalUnitPriceNet : originalUnitPriceGross;

        // Calculate totals
        const itemTotalNet = round2(unitPriceNet * item.quantity);
        const itemTotalGross = round2(unitPriceGross * item.quantity);
        const itemTotalVat = isWdt ? 0 : round2(itemTotalGross - itemTotalNet);

        subtotalNet += itemTotalNet;
        totalVat += itemTotalVat;
        totalGross += itemTotalGross;

        const productSnapshot = item.productSnapshot || {};
        const description = productSnapshot.plantName || 'Produkt';

        invoiceItems.push({
          productId: item.productId,
          description,
          quantity: item.quantity,
          unitPriceNet,
          unitPriceGross,
          vatRate,
          growerPassport: productSnapshot.growerPassport,
        });
      }

      // Round final totals
      subtotalNet = round2(subtotalNet);
      totalVat = round2(totalVat);
      totalGross = round2(totalGross);

      // Determine payment status based on payment method
      const isImmediatePayment = paymentMethod === 'cash' || paymentMethod === 'card';
      const initialPaymentStatus = isImmediatePayment ? 'paid' : 'unpaid';
      const initialPaidAmount = isImmediatePayment ? totalGross : 0;

      // Insert invoice
      const invoiceResult = await client.query<Invoice>(
        `INSERT INTO invoices (
          invoice_number, order_id, customer_id, buyer_snapshot,
          issue_date, sale_date, payment_deadline, payment_method,
          payment_status, paid_amount,
          subtotal_net, total_vat, total_gross, created_by_user_id, payment_splits, invoice_type, recipient_snapshot, transaction_type
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE, $5, $6, $7::payment_status, $8, $9, $10, $11, $12, $13, 'invoice'::invoice_type, $14, $15::transaction_type)
        RETURNING *`,
        [
          invoiceNumber,
          orderId,
          customerId,
          JSON.stringify(buyerSnapshot),
          paymentDeadline,
          paymentMethod,
          initialPaymentStatus,
          initialPaidAmount,
          subtotalNet,
          totalVat,
          totalGross,
          createdByUserId,
          JSON.stringify(paymentSplits),
          recipientSnapshot ? JSON.stringify(recipientSnapshot) : null,
          transactionType,
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Insert invoice items
      const insertedItems: InvoiceItem[] = [];
      for (const item of invoiceItems) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, unit_price_gross, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
            (item.unitPriceGross ?? Number((item.unitPriceNet * (1 + item.vatRate / 100)).toFixed(2))),
            item.vatRate,
            item.growerPassport,
          ]
        );

        insertedItems.push(itemResult.rows[0]);
      }

      return {
        ...invoice,
        items: insertedItems,
      };
    });
  }

  static async create(
    customerId: number,
    buyerSnapshot: CustomerSnapshot,
    items: Array<{
      productId?: number;
      description: string;
      quantity: number;
      unitPriceNet: number;
      unitPriceGross?: number;
      vatRate: number;
      growerPassport?: string;
    }>,
    paymentMethod: PaymentMethod,
    paymentDeadline: Date | null,
    createdByUserId?: number
  ): Promise<InvoiceWithItems> {
    return transaction(async (client) => {
      // Generate invoice number
      const invoiceNumberResult = await client.query(
        "SELECT get_next_document_number('invoice', 'FV')"
      );
      const invoiceNumber = invoiceNumberResult.rows[0].getNextDocumentNumber || invoiceNumberResult.rows[0].get_next_document_number;

      // Check if WDT (EU company with VAT-EU number, not Poland)
      const isWdt = isWdtTransaction(buyerSnapshot);
      const transactionType = isWdt ? 'wdt' : 'domestic';

      // Calculate totals
      let subtotalNet = 0;
      let totalVat = 0;
      let totalGross = 0;

      // Prepare items with adjusted VAT for WDT
      const adjustedItems = items.map(item => ({
        ...item,
        vatRate: isWdt ? 0 : item.vatRate,
      }));

      for (const item of adjustedItems) {
        const itemTotalNet = round2(item.unitPriceNet * item.quantity);
        const itemTotalVat = round2(itemTotalNet * (item.vatRate / 100));
        const itemTotalGross = round2(itemTotalNet + itemTotalVat);

        subtotalNet += itemTotalNet;
        totalVat += itemTotalVat;
        totalGross += itemTotalGross;
      }

      // Round final totals
      subtotalNet = round2(subtotalNet);
      totalVat = round2(totalVat);
      totalGross = round2(totalGross);

      // Determine payment status based on payment method
      const isImmediatePayment = paymentMethod === 'cash' || paymentMethod === 'card';
      const initialPaymentStatus = isImmediatePayment ? 'paid' : 'unpaid';
      const initialPaidAmount = isImmediatePayment ? totalGross : 0;

      // Insert invoice
      const invoiceResult = await client.query<Invoice>(
        `INSERT INTO invoices (
          invoice_number, customer_id, buyer_snapshot,
          issue_date, sale_date, payment_deadline, payment_method,
          payment_status, paid_amount,
          subtotal_net, total_vat, total_gross, created_by_user_id, invoice_type, transaction_type
        ) VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, $4, $5, $6::payment_status, $7, $8, $9, $10, $11, 'invoice'::invoice_type, $12::transaction_type)
        RETURNING *`,
        [
          invoiceNumber,
          customerId,
          JSON.stringify(buyerSnapshot),
          paymentDeadline,
          paymentMethod,
          initialPaymentStatus,
          initialPaidAmount,
          subtotalNet,
          totalVat,
          totalGross,
          createdByUserId,
          transactionType,
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Insert invoice items (use adjustedItems for correct VAT rate in WDT)
      const insertedItems: InvoiceItem[] = [];
      for (const item of adjustedItems) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, unit_price_gross, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
            (item.unitPriceGross ?? Number((item.unitPriceNet * (1 + item.vatRate / 100)).toFixed(2))),
            item.vatRate,
            item.growerPassport,
          ]
        );

        insertedItems.push(itemResult.rows[0]);
      }

      return {
        ...invoice,
        items: insertedItems,
      };
    });
  }

  static async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM invoices WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static async updatePaymentStatus(
    id: number,
    paidAmount: number
  ): Promise<Invoice | null> {
    // Get invoice to calculate new status
    const invoice = await this.getById(id);
    if (!invoice) {
      return null;
    }

    let paymentStatus: string;

    if (paidAmount >= invoice.totalGross) {
      paymentStatus = 'paid';
    } else if (paidAmount > 0) {
      paymentStatus = 'partially_paid';
    } else {
      // Check if overdue
      if (invoice.paymentDeadline && new Date(invoice.paymentDeadline) < new Date()) {
        paymentStatus = 'overdue';
      } else {
        paymentStatus = 'unpaid';
      }
    }

    const result = await query<Invoice>(
      `UPDATE invoices
       SET paid_amount = $1, payment_status = $2::payment_status, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [paidAmount, paymentStatus, id]
    );

    return result.rows[0] || null;
  }
  static async updateProforma(
    id: number,
    customerId: number,
    buyerSnapshot: CustomerSnapshot,
    items: Array<{
      productId?: number;
      description: string;
      quantity: number;
      unitPriceNet: number;
      unitPriceGross?: number;
      vatRate: number;
      growerPassport?: string;
    }>,
    validUntil?: Date,
    notes?: string
  ): Promise<InvoiceWithItems> {
    return transaction(async (client) => {
      // Check if proforma exists
      const proformaCheck = await client.query<Invoice>(
        'SELECT * FROM invoices WHERE id = $1 AND invoice_type = \'proforma\'',
        [id]
      );

      if (proformaCheck.rows.length === 0) {
        throw new Error('Faktura pro forma nie istnieje');
      }

      // Calculate totals
      let subtotalNet = 0;
      let totalVat = 0;
      let totalGross = 0;

      for (const item of items) {
        const itemTotalNet = round2(item.unitPriceNet * item.quantity);
        const itemTotalVat = round2(itemTotalNet * (item.vatRate / 100));
        const itemTotalGross = round2(itemTotalNet + itemTotalVat);

        subtotalNet += itemTotalNet;
        totalVat += itemTotalVat;
        totalGross += itemTotalGross;
      }

      // Round final totals
      subtotalNet = round2(subtotalNet);
      totalVat = round2(totalVat);
      totalGross = round2(totalGross);

      // Update proforma invoice
      const invoiceResult = await client.query<Invoice>(
        `UPDATE invoices SET 
          customer_id = $1,
          buyer_snapshot = $2,
          payment_deadline = $3,
          subtotal_net = $4,
          total_vat = $5,
          total_gross = $6,
          notes = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *`,
        [
          customerId,
          JSON.stringify(buyerSnapshot),
          validUntil,
          subtotalNet,
          totalVat,
          totalGross,
          notes,
          id,
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Delete old items
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

      // Insert new invoice items
      const insertedItems: InvoiceItem[] = [];
      for (const item of items) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, unit_price_gross, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
            (item.unitPriceGross ?? Number((item.unitPriceNet * (1 + item.vatRate / 100)).toFixed(2))),
            item.vatRate,
            item.growerPassport,
          ]
        );

        insertedItems.push(itemResult.rows[0]);
      }

      return {
        ...invoice,
        items: insertedItems,
      };
    });
  }

  static async updateProformaBasic(
    id: number,
    data: { validUntil?: Date; notes?: string }
  ): Promise<Invoice | null> {
    const result = await query<Invoice>(
      `UPDATE invoices
       SET payment_deadline = COALESCE($1, payment_deadline),
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND invoice_type = 'proforma'
       RETURNING *`,
      [data.validUntil, data.notes, id]
    );
    return result.rows[0] || null;
  }

  static async updateProformaStatus(
    id: number,
    proformaStatus: ProformaStatus
  ): Promise<Invoice | null> {
    const result = await query<Invoice>(
      `UPDATE invoices
       SET proforma_status = $1::proforma_status, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND invoice_type = 'proforma'
       RETURNING *`,
      [proformaStatus, id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get proformas expiring within X days
   * Returns proformas where validUntil is within X days from today
   * Excludes already expired and converted proformas
   */
  static async getExpiringProformas(days: number = 7): Promise<(Invoice & { customerName?: string })[]> {
    const sql = `SELECT *,
      COALESCE(
        buyer_snapshot->>'companyName',
        CONCAT(buyer_snapshot->>'firstName', ' ', buyer_snapshot->>'lastName')
      ) as customer_name
      FROM invoices 
      WHERE invoice_type = 'proforma'
        AND payment_deadline IS NOT NULL
        AND payment_deadline >= CURRENT_DATE
        AND payment_deadline <= CURRENT_DATE + INTERVAL '${days} days'
        AND (proforma_status IS NULL OR proforma_status != 'converted')
      ORDER BY payment_deadline ASC, id DESC`;

    const result = await query<Invoice & { customerName?: string }>(sql);
    return result.rows;
  }

  /**
   * Get expired proformas
   * Returns proformas where validUntil < today and status != 'converted'
   */
  static async getExpiredProformas(): Promise<(Invoice & { customerName?: string })[]> {
    const sql = `SELECT *,
      COALESCE(
        buyer_snapshot->>'companyName',
        CONCAT(buyer_snapshot->>'firstName', ' ', buyer_snapshot->>'lastName')
      ) as customer_name
      FROM invoices 
      WHERE invoice_type = 'proforma'
        AND payment_deadline IS NOT NULL
        AND payment_deadline < CURRENT_DATE
        AND (proforma_status IS NULL OR proforma_status != 'converted')
      ORDER BY payment_deadline DESC, id DESC`;

    const result = await query<Invoice & { customerName?: string }>(sql);
    return result.rows;
  }

  static async getProformaStats(): Promise<{
    total: number;
    byStatus: {
      draft: number;
      sent: number;
      accepted: number;
      expired: number;
      converted: number;
    };
    conversionRate: number;
    totalValue: number;
    convertedValue: number;
    averageConversionTimeDays: number | null;
    last30Days: {
      total: number;
      converted: number;
      totalValue: number;
      convertedValue: number;
    };
  }> {
    // Get overall stats
    const overallResult = await query<{
      total: string;
      draft: string;
      sent: string;
      accepted: string;
      expired: string;
      converted: string;
      totalValue: string;
      convertedValue: string;
    }>(`
      SELECT 
        COUNT(*)::text as total,
        COUNT(*) FILTER (WHERE proforma_status = 'draft' OR proforma_status IS NULL)::text as draft,
        COUNT(*) FILTER (WHERE proforma_status = 'sent')::text as sent,
        COUNT(*) FILTER (WHERE proforma_status = 'accepted')::text as accepted,
        COUNT(*) FILTER (WHERE proforma_status = 'expired')::text as expired,
        COUNT(*) FILTER (WHERE proforma_status = 'converted')::text as converted,
        COALESCE(SUM(total_gross), 0)::text as total_value,
        COALESCE(SUM(total_gross) FILTER (WHERE proforma_status = 'converted'), 0)::text as converted_value
      FROM invoices
      WHERE invoice_type = 'proforma'
    `);

    // Get average conversion time (for converted proformas)
    const conversionTimeResult = await query<{ avg_days: string | null }>(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (
          (SELECT MIN(created_at) FROM invoices i2 WHERE i2.proforma_id = i.id) - i.created_at
        )) / 86400)::text as avg_days
      FROM invoices i
      WHERE invoice_type = 'proforma' AND proforma_status = 'converted'
    `);

    // Get last 30 days stats
    const last30DaysResult = await query<{
      total: string;
      converted: string;
      totalValue: string;
      convertedValue: string;
    }>(`
      SELECT 
        COUNT(*)::text as total,
        COUNT(*) FILTER (WHERE proforma_status = 'converted')::text as converted,
        COALESCE(SUM(total_gross), 0)::text as total_value,
        COALESCE(SUM(total_gross) FILTER (WHERE proforma_status = 'converted'), 0)::text as converted_value
      FROM invoices
      WHERE invoice_type = 'proforma' AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const overall = overallResult.rows[0];
    const total = parseInt(overall.total) || 0;
    const converted = parseInt(overall.converted) || 0;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;

    const avgDays = conversionTimeResult.rows[0]?.avg_days;

    const last30 = last30DaysResult.rows[0];

    return {
      total,
      byStatus: {
        draft: parseInt(overall.draft) || 0,
        sent: parseInt(overall.sent) || 0,
        accepted: parseInt(overall.accepted) || 0,
        expired: parseInt(overall.expired) || 0,
        converted: parseInt(overall.converted) || 0,
      },
      conversionRate: Math.round(conversionRate * 100) / 100,
      totalValue: parseFloat(overall.totalValue) || 0,
      convertedValue: parseFloat(overall.convertedValue) || 0,
      averageConversionTimeDays: avgDays ? Math.round(parseFloat(avgDays) * 10) / 10 : null,
      last30Days: {
        total: parseInt(last30.total) || 0,
        converted: parseInt(last30.converted) || 0,
        totalValue: parseFloat(last30.totalValue) || 0,
        convertedValue: parseFloat(last30.convertedValue) || 0,
      }
    };
  }

  /**
   * Update payment method for an invoice
   * If changing to cash/card, automatically marks as paid
   */
  static async updatePaymentMethod(
    invoiceId: number,
    newPaymentMethod: PaymentMethod,
    userId?: number
  ): Promise<Invoice | null> {
    // Get current invoice
    const currentResult = await query<any>(
      'SELECT * FROM invoices WHERE id = $1',
      [invoiceId]
    );

    if (currentResult.rows.length === 0) {
      return null;
    }

    const currentInvoice = currentResult.rows[0];
    const oldPaymentMethod = currentInvoice.payment_method;
    const totalGross = parseFloat(currentInvoice.total_gross) || 0;

    // Determine if we should auto-mark as paid
    const isImmediatePayment = newPaymentMethod === 'cash' || newPaymentMethod === 'card';
    const wasTransfer = oldPaymentMethod === 'transfer';
    
    let newPaymentStatus = currentInvoice.payment_status;
    let newPaidAmount = parseFloat(currentInvoice.paid_amount) || 0;
    let newPaymentDeadline = currentInvoice.payment_deadline;

    // If changing from transfer to cash/card, mark as paid
    if (isImmediatePayment && wasTransfer) {
      newPaymentStatus = 'paid';
      newPaidAmount = totalGross;
      newPaymentDeadline = null;
    }

    // Update invoice
    const updateResult = await query<any>(
      `UPDATE invoices 
       SET payment_method = $1, 
           payment_status = $2::payment_status, 
           paid_amount = $3,
           payment_deadline = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [newPaymentMethod, newPaymentStatus, newPaidAmount, newPaymentDeadline, invoiceId]
    );

    if (updateResult.rows.length === 0) {
      return null;
    }

    // Log the change
    await query(
      `INSERT INTO invoice_audit_log 
       (invoice_id, action, field_name, old_value, new_value, changed_by_user_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        invoiceId,
        'payment_method_change',
        'payment_method',
        oldPaymentMethod,
        newPaymentMethod,
        userId || null,
        isImmediatePayment && wasTransfer 
          ? 'Automatycznie oznaczono jako opłacone po zmianie na płatność natychmiastową'
          : null
      ]
    );

    // If payment status also changed, log that too
    if (newPaymentStatus !== currentInvoice.payment_status) {
      await query(
        `INSERT INTO invoice_audit_log 
         (invoice_id, action, field_name, old_value, new_value, changed_by_user_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          invoiceId,
          'payment_status_change',
          'payment_status',
          currentInvoice.payment_status,
          newPaymentStatus,
          userId || null,
          'Automatyczna zmiana po zmianie formy płatności'
        ]
      );
    }

    const row = updateResult.rows[0];
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceType: row.invoice_type,
      orderId: row.order_id,
      customerId: row.customer_id,
      buyerSnapshot: row.buyer_snapshot,
      issueDate: row.issue_date,
      saleDate: row.sale_date,
      paymentDeadline: row.payment_deadline,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      paidAmount: parseFloat(row.paid_amount) || 0,
      subtotalNet: parseFloat(row.subtotal_net) || 0,
      totalVat: parseFloat(row.total_vat) || 0,
      totalGross: parseFloat(row.total_gross) || 0,
      notes: row.notes,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get audit log for an invoice
   */
  static async getAuditLog(invoiceId: number): Promise<any[]> {
    const result = await query<any>(
      `SELECT ial.*, u.email as changed_by_email, u.first_name, u.last_name
       FROM invoice_audit_log ial
       LEFT JOIN users u ON ial.changed_by_user_id = u.id
       WHERE ial.invoice_id = $1
       ORDER BY ial.changed_at DESC`,
      [invoiceId]
    );

    return result.rows.map(row => ({
      id: row.id,
      invoiceId: row.invoice_id,
      action: row.action,
      fieldName: row.field_name,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedByUserId: row.changed_by_user_id,
      changedByEmail: row.changed_by_email,
      changedByName: row.first_name && row.last_name 
        ? row.first_name + ' ' + row.last_name 
        : row.changed_by_email,
      changedAt: row.changed_at,
      notes: row.notes,
    }));
  }
}
