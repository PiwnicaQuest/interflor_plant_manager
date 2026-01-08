import { query, transaction } from './database';
import { Invoice, InvoiceItem, InvoiceWithItems, PaymentMethod, CustomerSnapshot, PaymentSplit, InvoiceType, ProformaStatus } from '../types';

// Helper function to round to 2 decimal places (for currency calculations)
const round2 = (num: number): number => Math.round(num * 100) / 100;

export class InvoiceModel {
  static async getAll(filters?: {
    startDate?: Date;
    endDate?: Date;
    customerId?: number;
    invoiceType?: InvoiceType;
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
            invoice_id, product_id, description, quantity, unit_price_net, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
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

      // Calculate totals
      let subtotalNet = 0;
      let totalVat = 0;
      let totalGross = 0;

      const invoiceItems: Array<{
        productId: number;
        description: string;
        quantity: number;
        unitPriceNet: number;
        vatRate: number;
        growerPassport?: string;
      }> = [];

      for (const item of orderItems) {
        const vatRate = item.vatRate || 8.0;
        const unitPriceGross = item.unitPriceGross;
        const unitPriceNet = round2(unitPriceGross / (1 + vatRate / 100));

        // Calculate from gross first (preserves original price, avoids rounding error)
        const itemTotalGross = round2(unitPriceGross * item.quantity);
        const itemTotalNet = round2(itemTotalGross / (1 + vatRate / 100));
        const itemTotalVat = round2(itemTotalGross - itemTotalNet);

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
          created_by_user_id, notes, invoice_type
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE, $5, 'unpaid'::payment_status, 0, $6, $7, $8, $9, $10, 'proforma'::invoice_type)
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
            invoice_id, product_id, description, quantity, unit_price_net, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
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
            invoice_id, product_id, description, quantity, unit_price_net, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
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
        vatRate: number;
        growerPassport?: string;
      }> = [];

      for (const item of orderItems) {
        const vatRate = item.vatRate || 8.0;
        const unitPriceGross = item.unitPriceGross;
        const unitPriceNet = round2(unitPriceGross / (1 + vatRate / 100));

        // Calculate from gross first (preserves original price, avoids rounding error)
        const itemTotalGross = round2(unitPriceGross * item.quantity);
        const itemTotalNet = round2(itemTotalGross / (1 + vatRate / 100));
        const itemTotalVat = round2(itemTotalGross - itemTotalNet);

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
          subtotal_net, total_vat, total_gross, created_by_user_id, payment_splits, invoice_type, recipient_snapshot
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE, $5, $6, $7::payment_status, $8, $9, $10, $11, $12, $13, 'invoice'::invoice_type, $14)
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
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Insert invoice items
      const insertedItems: InvoiceItem[] = [];
      for (const item of invoiceItems) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
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
          subtotal_net, total_vat, total_gross, created_by_user_id, invoice_type
        ) VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, $4, $5, $6::payment_status, $7, $8, $9, $10, $11, 'invoice'::invoice_type, )
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
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Insert invoice items
      const insertedItems: InvoiceItem[] = [];
      for (const item of items) {
        const itemResult = await client.query<InvoiceItem>(
          `INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_net, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
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
            invoice_id, product_id, description, quantity, unit_price_net, vat_rate, grower_passport
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            invoice.id,
            item.productId,
            item.description,
            item.quantity,
            item.unitPriceNet,
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
}
