import { query, transaction } from './database';
import { PoolClient } from 'pg';
import { Receipt, ReceiptItem, ReceiptWithItems, PaymentMethod, PaymentSplit, BuyerSnapshot } from '../types';

export class ReceiptModel {
  static async getAll(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<Receipt[]> {
    let sql = `
      SELECT r.*, c.company_name, c.first_name, c.last_name
      FROM receipts r
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      sql += ' AND r.created_at >= $' + paramIndex;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      sql += ' AND r.created_at <= $' + paramIndex;
      params.push(filters.endDate);
      paramIndex++;
    }

    sql += ' ORDER BY r.created_at DESC';

    const result = await query<Receipt & { company_name?: string; first_name?: string; last_name?: string }>(sql, params);
    
    return result.rows.map(row => ({
      ...row,
      customerName: row.company_name || (row.first_name && row.last_name ? row.first_name + ' ' + row.last_name : undefined),
    }));
  }

  static async getById(id: number): Promise<ReceiptWithItems | null> {
    const receiptResult = await query<Receipt & { company_name?: string; first_name?: string; last_name?: string }>(
      `SELECT r.*, c.company_name, c.first_name, c.last_name
       FROM receipts r
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE r.id = $1`,
      [id]
    );
    
    if (receiptResult.rows.length === 0) {
      return null;
    }

    const receipt = receiptResult.rows[0];

    // Pobierz pozycje paragonu
    const itemsResult = await query<ReceiptItem>(
      `SELECT * FROM receipt_items WHERE receipt_id = $1 ORDER BY id`,
      [id]
    );

    return {
      ...receipt,
      customerName: receipt.company_name || (receipt.first_name && receipt.last_name ? receipt.first_name + ' ' + receipt.last_name : undefined),
      items: itemsResult.rows,
    };
  }

  static async getByReceiptNumber(receiptNumber: string): Promise<ReceiptWithItems | null> {
    const receiptResult = await query<Receipt>(
      'SELECT * FROM receipts WHERE receipt_number = $1',
      [receiptNumber]
    );
    
    if (receiptResult.rows.length === 0) {
      return null;
    }

    const receipt = receiptResult.rows[0];

    const itemsResult = await query<ReceiptItem>(
      'SELECT * FROM receipt_items WHERE receipt_id = $1 ORDER BY id',
      [receipt.id]
    );

    return {
      ...receipt,
      items: itemsResult.rows,
    };
  }

  static async create(
    orderId: number,
    paymentMethod: PaymentMethod,
    totalAmount: number,
    createdByUserId?: number,
    notes?: string,
    paymentSplits?: PaymentSplit[],
    customerId?: number,
    buyerSnapshot?: BuyerSnapshot,
    items?: Array<{
      productId?: number;
      description: string;
      quantity: number;
      unitPriceGross: number;
      vatRate: number;
    }>,
    existingClient?: PoolClient
  ): Promise<ReceiptWithItems> {
    const executeCreate = async (client: PoolClient) => {
      // Generate receipt number
      const receiptNumberResult = await client.query<{ receiptNumber: string }>(
        "SELECT get_next_document_number('receipt', 'PAR') as receipt_number"
      );
      const receiptNumber = receiptNumberResult.rows[0].receiptNumber;

      // Insert receipt
      const receiptResult = await client.query<Receipt>(
        `INSERT INTO receipts (
          receipt_number, order_id, payment_method, total_amount, notes, 
          created_by_user_id, payment_splits, customer_id, buyer_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          receiptNumber, 
          orderId, 
          paymentMethod, 
          totalAmount, 
          notes, 
          createdByUserId, 
          paymentSplits ? JSON.stringify(paymentSplits) : null,
          customerId,
          buyerSnapshot ? JSON.stringify(buyerSnapshot) : null
        ]
      );

      const receipt = receiptResult.rows[0];
      const receiptItems: ReceiptItem[] = [];

      // Insert items
      if (items && items.length > 0) {
        for (const item of items) {
          const itemResult = await client.query<ReceiptItem>(
            `INSERT INTO receipt_items (receipt_id, product_id, description, quantity, unit_price_gross, vat_rate)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [receipt.id, item.productId || null, item.description, item.quantity, item.unitPriceGross, item.vatRate]
          );
          receiptItems.push(itemResult.rows[0]);
        }
      }

      return {
        ...receipt,
        items: receiptItems,
      };
    };

    // If existingClient is provided, use it (we're inside another transaction)
    // Otherwise, create new transaction
    if (existingClient) {
      return executeCreate(existingClient);
    } else {
      return transaction(executeCreate);
    }
  }

  static async update(
    id: number,
    data: {
      paymentMethod?: PaymentMethod;
      totalAmount?: number;
      notes?: string;
      paymentSplits?: PaymentSplit[];
    }
  ): Promise<Receipt | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.paymentMethod !== undefined) {
      fields.push('payment_method = $' + paramIndex);
      params.push(data.paymentMethod);
      paramIndex++;
    }

    if (data.totalAmount !== undefined) {
      fields.push('total_amount = $' + paramIndex);
      params.push(data.totalAmount);
      paramIndex++;
    }

    if (data.notes !== undefined) {
      fields.push('notes = $' + paramIndex);
      params.push(data.notes);
      paramIndex++;
    }

    if (data.paymentSplits !== undefined) {
      fields.push('payment_splits = $' + paramIndex);
      params.push(JSON.stringify(data.paymentSplits));
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    params.push(id);
    const sql = 'UPDATE receipts SET ' + fields.join(', ') + ' WHERE id = $' + paramIndex + ' RETURNING *';

    const result = await query<Receipt>(sql, params);
    return result.rows[0] || null;
  }

  static async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM receipts WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
}
