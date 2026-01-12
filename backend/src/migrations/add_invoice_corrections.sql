-- Migration: Add invoice corrections tables
-- Date: 2026-01-12

-- Create correction_type enum if not exists
DO $$ BEGIN
    CREATE TYPE correction_type AS ENUM ('partial', 'full');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main corrections table
CREATE TABLE IF NOT EXISTS invoice_corrections (
    id SERIAL PRIMARY KEY,
    correction_number VARCHAR(50) UNIQUE NOT NULL,
    original_invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    correction_reason TEXT NOT NULL,
    
    -- Buyer snapshot (copied from original invoice)
    buyer_snapshot JSONB NOT NULL,
    
    -- Original totals (before correction)
    original_subtotal_net DECIMAL(10,2) NOT NULL,
    original_total_vat DECIMAL(10,2) NOT NULL,
    original_total_gross DECIMAL(10,2) NOT NULL,
    
    -- Corrected totals (after correction)
    corrected_subtotal_net DECIMAL(10,2) NOT NULL,
    corrected_total_vat DECIMAL(10,2) NOT NULL,
    corrected_total_gross DECIMAL(10,2) NOT NULL,
    
    -- Difference (can be negative)
    difference_net DECIMAL(10,2) GENERATED ALWAYS AS (corrected_subtotal_net - original_subtotal_net) STORED,
    difference_vat DECIMAL(10,2) GENERATED ALWAYS AS (corrected_total_vat - original_total_vat) STORED,
    difference_gross DECIMAL(10,2) GENERATED ALWAYS AS (corrected_total_gross - original_total_gross) STORED,
    
    -- Dates
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    original_invoice_date DATE NOT NULL,
    original_invoice_number VARCHAR(50) NOT NULL,
    
    -- Metadata
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Correction items table
CREATE TABLE IF NOT EXISTS invoice_correction_items (
    id SERIAL PRIMARY KEY,
    correction_id INTEGER NOT NULL REFERENCES invoice_corrections(id) ON DELETE CASCADE,
    original_item_id INTEGER REFERENCES invoice_items(id) ON DELETE SET NULL,
    
    -- Item description
    description TEXT NOT NULL,
    
    -- Original values (before correction)
    original_quantity INTEGER NOT NULL DEFAULT 0,
    original_unit_price_net DECIMAL(10,2) NOT NULL DEFAULT 0,
    original_vat_rate DECIMAL(5,2) NOT NULL DEFAULT 8.00,
    original_total_net DECIMAL(10,2) NOT NULL DEFAULT 0,
    original_total_vat DECIMAL(10,2) NOT NULL DEFAULT 0,
    original_total_gross DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- Corrected values (after correction)
    corrected_quantity INTEGER NOT NULL DEFAULT 0,
    corrected_unit_price_net DECIMAL(10,2) NOT NULL DEFAULT 0,
    corrected_vat_rate DECIMAL(5,2) NOT NULL DEFAULT 8.00,
    corrected_total_net DECIMAL(10,2) GENERATED ALWAYS AS (corrected_quantity * corrected_unit_price_net) STORED,
    corrected_total_vat DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(corrected_quantity * corrected_unit_price_net * corrected_vat_rate / 100, 2)) STORED,
    corrected_total_gross DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(corrected_quantity * corrected_unit_price_net * (1 + corrected_vat_rate / 100), 2)) STORED,
    
    -- Difference
    difference_quantity INTEGER GENERATED ALWAYS AS (corrected_quantity - original_quantity) STORED,
    difference_net DECIMAL(10,2) GENERATED ALWAYS AS (corrected_quantity * corrected_unit_price_net - original_total_net) STORED,
    difference_vat DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(corrected_quantity * corrected_unit_price_net * corrected_vat_rate / 100, 2) - original_total_vat) STORED,
    difference_gross DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(corrected_quantity * corrected_unit_price_net * (1 + corrected_vat_rate / 100), 2) - original_total_gross) STORED,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoice_corrections_original_invoice ON invoice_corrections(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_corrections_number ON invoice_corrections(correction_number);
CREATE INDEX IF NOT EXISTS idx_invoice_corrections_issue_date ON invoice_corrections(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoice_correction_items_correction ON invoice_correction_items(correction_id);

-- Add column to invoices to track if it has corrections
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS has_corrections BOOLEAN DEFAULT FALSE;

-- Trigger to update has_corrections flag
CREATE OR REPLACE FUNCTION update_invoice_has_corrections()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE invoices SET has_corrections = TRUE WHERE id = NEW.original_invoice_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE invoices SET has_corrections = EXISTS(
            SELECT 1 FROM invoice_corrections WHERE original_invoice_id = OLD.original_invoice_id
        ) WHERE id = OLD.original_invoice_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invoice_has_corrections ON invoice_corrections;
CREATE TRIGGER trigger_update_invoice_has_corrections
AFTER INSERT OR DELETE ON invoice_corrections
FOR EACH ROW EXECUTE FUNCTION update_invoice_has_corrections();

COMMENT ON TABLE invoice_corrections IS 'Faktury korygujące - korekty do faktur VAT';
COMMENT ON TABLE invoice_correction_items IS 'Pozycje faktur korygujących';
