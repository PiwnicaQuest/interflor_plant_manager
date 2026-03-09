import { query } from './database';
import { PriceGroup } from '../types';

export class PriceGroupModel {
  static async getAll(): Promise<PriceGroup[]> {
    const result = await query<PriceGroup>(
      `SELECT
        pg.id,
        pg.name,
        pg.discount_percentage as "discountPercentage",
        pg.description,
        pg.created_at as "createdAt",
        COUNT(c.id) as customer_count
       FROM price_groups pg
       LEFT JOIN customers c ON c.price_group_id = pg.id
       GROUP BY pg.id, pg.name, pg.discount_percentage, pg.description, pg.created_at
       ORDER BY pg.id ASC`
    );
    return result.rows;
  }

  static async getById(id: number): Promise<PriceGroup | null> {
    const result = await query<PriceGroup>(
      `SELECT
        pg.id,
        pg.name,
        pg.discount_percentage as "discountPercentage",
        pg.description,
        pg.created_at as "createdAt",
        COUNT(c.id) as customer_count
       FROM price_groups pg
       LEFT JOIN customers c ON c.price_group_id = pg.id
       WHERE pg.id = $1
       GROUP BY pg.id, pg.name, pg.discount_percentage, pg.description, pg.created_at`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(data: { name: string; discountPercentage: number; description?: string }): Promise<PriceGroup> {
    // Validate discount percentage
    if (data.discountPercentage < -100 || data.discountPercentage > 100) {
      throw new Error('Wartość musi być między -100 a 100%');
    }

    const result = await query<PriceGroup>(
      `INSERT INTO price_groups (name, discount_percentage, description)
       VALUES ($1, $2, $3)
       RETURNING
         id,
         name,
         discount_percentage as "discountPercentage",
         description,
         created_at as "createdAt"`,
      [data.name, data.discountPercentage, data.description || null]
    );

    return result.rows[0];
  }

  static async update(
    id: number,
    data: { name?: string; discountPercentage?: number; description?: string }
  ): Promise<PriceGroup | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Validate discount percentage if provided
    if (data.discountPercentage !== undefined) {
      if (data.discountPercentage < -100 || data.discountPercentage > 100) {
        throw new Error('Wartość musi być między -100 a 100%');
      }
    }

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(data.name);
      paramIndex++;
    }

    if (data.discountPercentage !== undefined) {
      fields.push(`discount_percentage = $${paramIndex}`);
      values.push(data.discountPercentage);
      paramIndex++;
    }

    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const sql = `UPDATE price_groups
                 SET ${fields.join(', ')}
                 WHERE id = $${paramIndex}
                 RETURNING
                   id,
                   name,
                   discount_percentage as "discountPercentage",
                   description,
                   created_at as "createdAt"`;

    const result = await query<PriceGroup>(sql, values);
    return result.rows[0] || null;
  }

  static async delete(id: number): Promise<boolean> {
    // Move customers from this price group to default (id=1)
    await query(
      'UPDATE customers SET price_group_id = 1 WHERE price_group_id = $1',
      [id]
    );

    const result = await query('DELETE FROM price_groups WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static async getCustomersByPriceGroup(priceGroupId: number): Promise<any[]> {
    const result = await query(
      `SELECT
        id,
        company_name as "companyName",
        first_name as "firstName",
        last_name as "lastName",
        email,
        phone
       FROM customers
       WHERE price_group_id = $1
       ORDER BY company_name, last_name, first_name`,
      [priceGroupId]
    );
    return result.rows;
  }
}
