import { query } from './database';

export interface GrowerPassport {
  id: number;
  growerName: string;
  passportNumber: string;
  floricode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GrowerPassportModel {
  static async getAll(): Promise<GrowerPassport[]> {
    const result = await query<GrowerPassport>(
      'SELECT * FROM grower_passports ORDER BY grower_name'
    );
    return result.rows;
  }

  static async getByGrowerName(growerName: string): Promise<GrowerPassport | null> {
    const result = await query<GrowerPassport>(
      'SELECT * FROM grower_passports WHERE grower_name = $1',
      [growerName]
    );
    return result.rows[0] || null;
  }

  static async getByFloricode(floricode: string): Promise<GrowerPassport | null> {
    const result = await query<GrowerPassport>(
      'SELECT * FROM grower_passports WHERE floricode = $1',
      [floricode]
    );
    return result.rows[0] || null;
  }

  static async getById(id: number): Promise<GrowerPassport | null> {
    const result = await query<GrowerPassport>(
      'SELECT * FROM grower_passports WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(growerName: string, passportNumber: string, floricode?: string): Promise<GrowerPassport> {
    const result = await query<GrowerPassport>(
      `INSERT INTO grower_passports (grower_name, passport_number, floricode)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [growerName, passportNumber, floricode || null]
    );
    return result.rows[0];
  }

  static async update(id: number, passportNumber: string, floricode?: string): Promise<GrowerPassport | null> {
    const result = await query<GrowerPassport>(
      `UPDATE grower_passports
       SET passport_number = $1, floricode = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [passportNumber, floricode || null, id]
    );
    return result.rows[0] || null;
  }

  static async upsert(growerName: string, passportNumber: string, floricode?: string): Promise<GrowerPassport> {
    // First try to find by floricode if provided
    if (floricode) {
      const existingByFloricode = await this.getByFloricode(floricode);
      if (existingByFloricode) {
        // Update existing record found by floricode
        const result = await query<GrowerPassport>(
          `UPDATE grower_passports
           SET grower_name = $1, passport_number = $2, updated_at = CURRENT_TIMESTAMP
           WHERE floricode = $3
           RETURNING *`,
          [growerName, passportNumber, floricode]
        );
        return result.rows[0];
      }
    }

    // Try upsert by grower_name
    const result = await query<GrowerPassport>(
      `INSERT INTO grower_passports (grower_name, passport_number, floricode)
       VALUES ($1, $2, $3)
       ON CONFLICT (grower_name)
       DO UPDATE SET passport_number = $2, floricode = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [growerName, passportNumber, floricode || null]
    );
    return result.rows[0];
  }

  static async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM grower_passports WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static async deleteAll(): Promise<number> {
    const result = await query('DELETE FROM grower_passports');
    return result.rowCount || 0;
  }

  // Get passport map for multiple growers (for efficient lookup)
  static async getPassportMap(): Promise<Map<string, string>> {
    const result = await query<{ growerName: string; passportNumber: string }>(
      'SELECT grower_name, passport_number FROM grower_passports'
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.growerName, row.passportNumber);
    }
    return map;
  }

  // Get floricode to grower name map (for EDI import)
  static async getFloricodeMap(): Promise<Map<string, { growerName: string; passportNumber: string }>> {
    const result = await query<{ floricode: string; growerName: string; passportNumber: string }>(
      'SELECT floricode, grower_name, passport_number FROM grower_passports WHERE floricode IS NOT NULL'
    );
    const map = new Map<string, { growerName: string; passportNumber: string }>();
    for (const row of result.rows) {
      map.set(row.floricode, { growerName: row.growerName, passportNumber: row.passportNumber });
    }
    return map;
  }

  // Bulk import - delete all and insert new
  static async bulkImport(data: Array<{ growerName: string; passportNumber: string; floricode?: string }>): Promise<number> {
    if (data.length === 0) return 0;

    // Delete all existing
    await query('DELETE FROM grower_passports');

    // Reset sequence
    await query('ALTER SEQUENCE grower_passports_id_seq RESTART WITH 1');

    // Insert all new records
    let inserted = 0;
    for (const row of data) {
      try {
        await query(
          `INSERT INTO grower_passports (grower_name, passport_number, floricode) VALUES ($1, $2, $3)`,
          [row.growerName, row.passportNumber || '', row.floricode || null]
        );
        inserted++;
      } catch (err: any) {
        // Skip duplicates
        if (!err.message?.includes('duplicate')) {
          console.error(`Error inserting grower ${row.growerName}:`, err.message);
        }
      }
    }

    return inserted;
  }
}
