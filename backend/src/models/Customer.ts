import { query } from './database';
import { Customer } from '../types';

export class CustomerModel {
  static async getAll(): Promise<Customer[]> {
    const result = await query<Customer>(
      `SELECT c.*, pg.name as price_group_name
       FROM customers c
       LEFT JOIN price_groups pg ON c.price_group_id = pg.id
       ORDER BY c.created_at DESC`
    );
    return result.rows;
  }

  static async getById(id: number): Promise<Customer | null> {
    const result = await query<Customer>(
      `SELECT c.*, pg.name as price_group_name
       FROM customers c
       LEFT JOIN price_groups pg ON c.price_group_id = pg.id
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async getByUserId(userId: number): Promise<Customer | null> {
    const result = await query<Customer>(
      `SELECT c.*, pg.name as price_group_name
       FROM customers c
       LEFT JOIN price_groups pg ON c.price_group_id = pg.id
       WHERE c.user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  static async getByNIP(nip: string): Promise<Customer | null> {
    const result = await query<Customer>(
      `SELECT c.*, pg.name as price_group_name
       FROM customers c
       LEFT JOIN price_groups pg ON c.price_group_id = pg.id
       WHERE c.nip = $1`,
      [nip]
    );
    return result.rows[0] || null;
  }

  static async create(data: Partial<Customer>): Promise<Customer> {
    const {
      userId,
      companyName,
      firstName,
      lastName,
      nip,
      street,
      postalCode,
      city,
      country = 'Polska',
      phone,
      email,
      priceGroupId = 1,
      notes,
    } = data;

    const result = await query<Customer>(
      `INSERT INTO customers (
        user_id, company_name, first_name, last_name, nip,
        street, postal_code, city, country, phone, email,
        price_group_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        userId,
        companyName,
        firstName,
        lastName,
        nip,
        street,
        postalCode,
        city,
        country,
        phone,
        email,
        priceGroupId,
        notes,
      ]
    );

    return result.rows[0];
  }

  static async update(id: number, data: Partial<Customer>): Promise<Customer | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'userId',
      'companyName',
      'firstName',
      'lastName',
      'nip',
      'street',
      'postalCode',
      'city',
      'country',
      'phone',
      'email',
      'priceGroupId',
      'notes',
      'recipientCompanyName',
      'recipientFirstName',
      'recipientLastName',
      'recipientStreet',
      'recipientPostalCode',
      'recipientCity',
      'recipientPhone',
    ];

    const columnMap: { [key: string]: string } = {
      userId: 'user_id',
      companyName: 'company_name',
      firstName: 'first_name',
      lastName: 'last_name',
      postalCode: 'postal_code',
      priceGroupId: 'price_group_id',
      recipientCompanyName: 'recipient_company_name',
      recipientFirstName: 'recipient_first_name',
      recipientLastName: 'recipient_last_name',
      recipientStreet: 'recipient_street',
      recipientPostalCode: 'recipient_postal_code',
      recipientCity: 'recipient_city',
      recipientPhone: 'recipient_phone',
    };

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const columnName = columnMap[key] || key;
        fields.push(`${columnName} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const sql = `UPDATE customers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`;

    const result = await query<Customer>(sql, values);
    return result.rows[0] || null;
  }

  static async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM customers WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static async getPriceForCustomer(customerId: number, productId: number): Promise<number> {
    const result = await query<{ price: number }>(
      `SELECT
        CASE pg.name
          WHEN 'podstawowa' THEN p.base_price_gross
          WHEN 'rabat_10' THEN p.price_discount_10
          WHEN 'rabat_12' THEN p.price_discount_12
          WHEN 'rabat_15' THEN p.price_discount_15
          WHEN 'rabat_20' THEN p.price_discount_20
          WHEN 'rabat_25' THEN p.price_discount_25
          ELSE p.base_price_gross
        END as price
       FROM products p
       CROSS JOIN customers c
       LEFT JOIN price_groups pg ON c.price_group_id = pg.id
       WHERE c.id = $1 AND p.id = $2`,
      [customerId, productId]
    );

    return result.rows[0]?.price || 0;
  }
}
