import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../models/database';

export class MigrationController {
  /**
   * POST /api/migration/run-settings
   * Wykonaj migrację dla tabeli settings
   * TYLKO DLA ADMINA
   */
  static async runSettingsMigration(_req: AuthRequest, res: Response) {
    try {
      console.log('[Migration] Starting settings migration...');

      // 1. Create settings table
      await query(`
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(255) UNIQUE NOT NULL,
          setting_value TEXT NOT NULL,
          description TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[Migration] ✅ Settings table created');

      // 2. Insert default settings
      await query(`
        INSERT INTO settings (setting_key, setting_value, description) VALUES
          ('cost_percentage', '0', 'Procent kosztów dodawanych do ceny zakupu (np. 15 = 15%)'),
          ('margin_percentage', '100', 'Procent marży dodawanej do Ceny+ (np. 30 = 30%)')
        ON CONFLICT (setting_key) DO NOTHING
      `);
      console.log('[Migration] ✅ Default settings inserted');

      // 3. Check if columns are GENERATED (they might be)
      const columnCheck = await query(`
        SELECT column_name, is_generated
        FROM information_schema.columns
        WHERE table_name = 'products'
        AND column_name IN ('base_price_gross', 'price_discount_10', 'price_discount_12', 'price_discount_15', 'price_discount_20', 'price_discount_25')
      `);

      const generatedColumns = columnCheck.rows.filter((row: any) => row.is_generated === 'ALWAYS');

      if (generatedColumns.length > 0) {
        console.log('[Migration] Found GENERATED columns, dropping them...');

        // Drop GENERATED columns
        await query(`
          ALTER TABLE products
            DROP COLUMN IF EXISTS base_price_gross CASCADE,
            DROP COLUMN IF EXISTS price_discount_10 CASCADE,
            DROP COLUMN IF EXISTS price_discount_12 CASCADE,
            DROP COLUMN IF EXISTS price_discount_15 CASCADE,
            DROP COLUMN IF EXISTS price_discount_20 CASCADE,
            DROP COLUMN IF EXISTS price_discount_25 CASCADE
        `);
        console.log('[Migration] ✅ GENERATED columns dropped');

        // Add columns back as regular NUMERIC columns
        await query(`
          ALTER TABLE products
            ADD COLUMN base_price_gross NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN price_discount_10 NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN price_discount_12 NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN price_discount_15 NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN price_discount_20 NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN price_discount_25 NUMERIC(10, 2) DEFAULT 0
        `);
        console.log('[Migration] ✅ Regular columns added');

        // Update existing products to calculate prices based on current pricePlus
        await query(`
          UPDATE products
          SET
            base_price_gross = COALESCE(price_plus, 0),
            price_discount_10 = ROUND(COALESCE(price_plus, 0) * 0.90, 2),
            price_discount_12 = ROUND(COALESCE(price_plus, 0) * 0.88, 2),
            price_discount_15 = ROUND(COALESCE(price_plus, 0) * 0.85, 2),
            price_discount_20 = ROUND(COALESCE(price_plus, 0) * 0.80, 2),
            price_discount_25 = ROUND(COALESCE(price_plus, 0) * 0.75, 2)
          WHERE price_plus IS NOT NULL
        `);
        console.log('[Migration] ✅ Existing products updated');
      } else {
        console.log('[Migration] ℹ️ Columns are already regular (not GENERATED)');
      }

      // 4. Create update timestamp function and trigger for settings
      await query(`
        CREATE OR REPLACE FUNCTION update_settings_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);

      await query(`
        DROP TRIGGER IF EXISTS settings_updated_at ON settings
      `);

      await query(`
        CREATE TRIGGER settings_updated_at
          BEFORE UPDATE ON settings
          FOR EACH ROW
          EXECUTE FUNCTION update_settings_timestamp()
      `);
      console.log('[Migration] ✅ Triggers created');

      return res.json({
        success: true,
        message: 'Migration completed successfully',
      });
    } catch (error: any) {
      console.error('[Migration] ❌ Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
