import { query, transaction } from './database';
import { InvoiceCorrection, InvoiceCorrectionItem, InvoiceCorrectionWithItems } from '../types';

// Helper function to round to 2 decimal places
const round2 = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;

interface CreateCorrectionData {
  originalInvoiceId: number;
  correctionReason: string;
  items: {
    originalItemId?: number;
    description: string;
    originalQuantity: number;
    originalUnitPriceNet: number;
    originalUnitPriceGross: number;
    originalVatRate: number;
    originalTotalNet: number;
    originalTotalVat: number;
    originalTotalGross: number;
    correctedQuantity: number;
    correctedUnitPriceGross: number;
    correctedVatRate: number;
  }[];
  createdByUserId?: number;
}

export const InvoiceCorrectionModel = {
  // Generate next correction number
  async generateCorrectionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await query(
      "SELECT COUNT(*) as count FROM invoice_corrections WHERE EXTRACT(YEAR FROM issue_date) = $1",
      [year]
    );
    const count = parseInt(result.rows[0].count) + 1;
    return `FK/${count.toString().padStart(3, '0')}/${year}`;
  },

  // Get all corrections with filters
  async getAll(filters?: {
    startDate?: string;
    endDate?: string;
    originalInvoiceId?: number;
  }): Promise<InvoiceCorrection[]> {
    let sql = `
      SELECT
        ic.*,
        i.invoice_number as original_invoice_number_ref
      FROM invoice_corrections ic
      LEFT JOIN invoices i ON ic.original_invoice_id = i.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      sql += ` AND ic.issue_date >= $${paramIndex++}`;
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      sql += ` AND ic.issue_date <= $${paramIndex++}`;
      params.push(filters.endDate);
    }
    if (filters?.originalInvoiceId) {
      sql += ` AND ic.original_invoice_id = $${paramIndex++}`;
      params.push(filters.originalInvoiceId);
    }

    sql += ` ORDER BY ic.issue_date DESC, ic.id DESC`;

    const result = await query(sql, params);
    return result.rows.map((row: Record<string, unknown>) => this.mapRowToCorrection(row));
  },

  // Get correction by ID with items
  async getById(id: number): Promise<InvoiceCorrectionWithItems | null> {
    const correctionResult = await query(
      `SELECT ic.*, i.invoice_number as original_invoice_number_ref
       FROM invoice_corrections ic
       LEFT JOIN invoices i ON ic.original_invoice_id = i.id
       WHERE ic.id = $1`,
      [id]
    );

    if (correctionResult.rows.length === 0) return null;

    const correction = this.mapRowToCorrection(correctionResult.rows[0]);

    const itemsResult = await query(
      `SELECT * FROM invoice_correction_items WHERE correction_id = $1 ORDER BY id`,
      [id]
    );

    return {
      ...correction,
      items: itemsResult.rows.map((row: Record<string, unknown>) => this.mapRowToItem(row))
    };
  },

  // Get corrections for a specific invoice
  async getByInvoiceId(invoiceId: number): Promise<InvoiceCorrection[]> {
    const result = await query(
      `SELECT ic.*, i.invoice_number as original_invoice_number_ref
       FROM invoice_corrections ic
       LEFT JOIN invoices i ON ic.original_invoice_id = i.id
       WHERE ic.original_invoice_id = $1
       ORDER BY ic.issue_date DESC`,
      [invoiceId]
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRowToCorrection(row));
  },

  // Create a new correction
  async create(data: CreateCorrectionData): Promise<{ correctionId: number; correctionNumber: string }> {
    return transaction(async (client) => {
      // Get original invoice data
      const invoiceResult = await client.query(
        `SELECT * FROM invoices WHERE id = $1`,
        [data.originalInvoiceId]
      );

      if (invoiceResult.rows.length === 0) {
        throw new Error('Original invoice not found');
      }

      const invoice = invoiceResult.rows[0];
      const correctionNumber = await this.generateCorrectionNumber();

      // Calculate totals FROM GROSS (same as invoices!)
      let correctedTotalGross = 0;
      let correctedSubtotalNet = 0;
      let correctedTotalVat = 0;

      for (const item of data.items) {
        // Calculate from gross price (same logic as invoice_items table)
        const itemGross = item.correctedQuantity * item.correctedUnitPriceGross;
        const itemNet = round2(itemGross / (1 + item.correctedVatRate / 100));
        const itemVat = round2(itemGross - itemNet);

        correctedTotalGross += itemGross;
        correctedSubtotalNet += itemNet;
        correctedTotalVat += itemVat;
      }

      // Round totals
      correctedTotalGross = round2(correctedTotalGross);
      correctedSubtotalNet = round2(correctedSubtotalNet);
      correctedTotalVat = round2(correctedTotalVat);

      // Insert correction
      const correctionResult = await client.query(
        `INSERT INTO invoice_corrections (
          correction_number, original_invoice_id, correction_reason,
          buyer_snapshot,
          original_subtotal_net, original_total_vat, original_total_gross,
          corrected_subtotal_net, corrected_total_vat, corrected_total_gross,
          issue_date, original_invoice_date, original_invoice_number,
          created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, $11, $12, $13)
        RETURNING id`,
        [
          correctionNumber,
          data.originalInvoiceId,
          data.correctionReason,
          invoice.buyerSnapshot,
          invoice.subtotalNet,
          invoice.totalVat,
          invoice.totalGross,
          correctedSubtotalNet,
          correctedTotalVat,
          correctedTotalGross,
          invoice.issueDate,
          invoice.invoiceNumber,
          data.createdByUserId
        ]
      );

      const correctionId = correctionResult.rows[0].id;

      // Insert correction items with gross price
      for (const item of data.items) {
        // Calculate net price from gross for storage
        const correctedUnitPriceNet = round2(item.correctedUnitPriceGross / (1 + item.correctedVatRate / 100));
        
        await client.query(
          `INSERT INTO invoice_correction_items (
            correction_id, original_item_id, description,
            original_quantity, original_unit_price_net, original_vat_rate,
            original_total_net, original_total_vat, original_total_gross,
            corrected_quantity, corrected_unit_price_net, corrected_unit_price_gross, corrected_vat_rate
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            correctionId,
            item.originalItemId || null,
            item.description,
            item.originalQuantity,
            item.originalUnitPriceNet,
            item.originalVatRate,
            item.originalTotalNet,
            item.originalTotalVat,
            item.originalTotalGross,
            item.correctedQuantity,
            correctedUnitPriceNet,
            item.correctedUnitPriceGross,
            item.correctedVatRate
          ]
        );
      }

      return { correctionId, correctionNumber };
    });
  },

  // Delete correction
  async delete(id: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM invoice_corrections WHERE id = $1 RETURNING id',
      [id]
    );
    return (result.rowCount || 0) > 0;
  },

  // Get statistics
  async getStats(): Promise<{
    totalCorrections: number;
    totalDifferenceGross: number;
    correctionsThisMonth: number;
  }> {
    const result = await query(`
      SELECT
        COUNT(*) as total_corrections,
        COALESCE(SUM(difference_gross), 0) as total_difference_gross,
        COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM issue_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                        AND EXTRACT(YEAR FROM issue_date) = EXTRACT(YEAR FROM CURRENT_DATE)) as corrections_this_month
      FROM invoice_corrections
    `);

    return {
      totalCorrections: parseInt(result.rows[0].total_corrections),
      totalDifferenceGross: parseFloat(result.rows[0].total_difference_gross),
      correctionsThisMonth: parseInt(result.rows[0].corrections_this_month)
    };
  },

  // Helper: Map DB row to InvoiceCorrection
  mapRowToCorrection(row: Record<string, unknown>): InvoiceCorrection {
    return {
      id: row.id as number,
      correctionNumber: row.correctionNumber as string,
      originalInvoiceId: row.originalInvoiceId as number,
      originalInvoiceNumber: row.originalInvoiceNumber as string,
      originalInvoiceDate: row.originalInvoiceDate as Date,
      correctionReason: row.correctionReason as string,
      buyerSnapshot: row.buyerSnapshot as InvoiceCorrection['buyerSnapshot'],
      originalSubtotalNet: parseFloat(row.originalSubtotalNet as string),
      originalTotalVat: parseFloat(row.originalTotalVat as string),
      originalTotalGross: parseFloat(row.originalTotalGross as string),
      correctedSubtotalNet: parseFloat(row.correctedSubtotalNet as string),
      correctedTotalVat: parseFloat(row.correctedTotalVat as string),
      correctedTotalGross: parseFloat(row.correctedTotalGross as string),
      differenceNet: parseFloat(row.differenceNet as string),
      differenceVat: parseFloat(row.differenceVat as string),
      differenceGross: parseFloat(row.differenceGross as string),
      issueDate: row.issueDate as Date,
      createdByUserId: row.createdByUserId as number | undefined,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date
    };
  },

  // Helper: Map DB row to InvoiceCorrectionItem
  mapRowToItem(row: Record<string, unknown>): InvoiceCorrectionItem {
    return {
      id: row.id as number,
      correctionId: row.correctionId as number,
      originalItemId: row.originalItemId as number | undefined,
      description: row.description as string,
      originalQuantity: row.originalQuantity as number,
      originalUnitPriceNet: parseFloat(row.originalUnitPriceNet as string),
      originalVatRate: parseFloat(row.originalVatRate as string),
      originalTotalNet: parseFloat(row.originalTotalNet as string),
      originalTotalVat: parseFloat(row.originalTotalVat as string),
      originalTotalGross: parseFloat(row.originalTotalGross as string),
      correctedQuantity: row.correctedQuantity as number,
      correctedUnitPriceNet: parseFloat(row.correctedUnitPriceNet as string),
      correctedUnitPriceGross: parseFloat(row.correctedUnitPriceGross as string),
      correctedVatRate: parseFloat(row.correctedVatRate as string),
      correctedTotalNet: parseFloat(row.correctedTotalNet as string),
      correctedTotalVat: parseFloat(row.correctedTotalVat as string),
      correctedTotalGross: parseFloat(row.correctedTotalGross as string),
      differenceQuantity: row.differenceQuantity as number,
      differenceNet: parseFloat(row.differenceNet as string),
      differenceVat: parseFloat(row.differenceVat as string),
      differenceGross: parseFloat(row.differenceGross as string),
      createdAt: row.createdAt as Date
    };
  }
};

export default InvoiceCorrectionModel;
