-- Migration: Add settings table and modify products table
-- Created: 2025-11-24

-- 1. Create settings table for storing cost and margin percentages
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insert default settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
  ('cost_percentage', '0', 'Procent kosztów dodawanych do ceny zakupu (np. 15 = 15%)'),
  ('margin_percentage', '100', 'Procent marży dodawanej do Ceny+ (np. 30 = 30%)')
ON CONFLICT (setting_key) DO NOTHING;

-- 3. Drop generated columns and recreate as regular columns
-- First, we need to drop the generated columns
ALTER TABLE products
  DROP COLUMN IF EXISTS base_price_gross CASCADE,
  DROP COLUMN IF EXISTS price_discount_10 CASCADE,
  DROP COLUMN IF EXISTS price_discount_12 CASCADE,
  DROP COLUMN IF EXISTS price_discount_15 CASCADE,
  DROP COLUMN IF EXISTS price_discount_20 CASCADE,
  DROP COLUMN IF EXISTS price_discount_25 CASCADE;

-- 4. Add columns back as regular NUMERIC columns
ALTER TABLE products
  ADD COLUMN base_price_gross NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN price_discount_10 NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN price_discount_12 NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN price_discount_15 NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN price_discount_20 NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN price_discount_25 NUMERIC(10, 2) DEFAULT 0;

-- 5. Update existing products to calculate prices based on current pricePlus
-- Assuming: basePriceGross = pricePlus, then discounts from there
UPDATE products
SET
  base_price_gross = COALESCE(price_plus, 0),
  price_discount_10 = ROUND(COALESCE(price_plus, 0) * 0.90, 2),
  price_discount_12 = ROUND(COALESCE(price_plus, 0) * 0.88, 2),
  price_discount_15 = ROUND(COALESCE(price_plus, 0) * 0.85, 2),
  price_discount_20 = ROUND(COALESCE(price_plus, 0) * 0.80, 2),
  price_discount_25 = ROUND(COALESCE(price_plus, 0) * 0.75, 2)
WHERE price_plus IS NOT NULL;

-- 6. Create function to update settings timestamp
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for settings table
DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_timestamp();

-- 8. Add comments
COMMENT ON TABLE settings IS 'Przechowuje ustawienia systemowe, w tym procenty kosztów i marży';
COMMENT ON COLUMN settings.setting_key IS 'Unikalny klucz ustawienia';
COMMENT ON COLUMN settings.setting_value IS 'Wartość ustawienia (jako tekst)';
COMMENT ON COLUMN products.price_plus IS 'Cena zakupu + % kosztów';
COMMENT ON COLUMN products.base_price_gross IS 'Cena podstawowa = Cena+ × 1.08 (VAT) × (1 + % marży)';
