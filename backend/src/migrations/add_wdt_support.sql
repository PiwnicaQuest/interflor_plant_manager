-- Migration: Add WDT (Wewnątrzwspólnotowa Dostawa Towarów) support
-- Date: 2026-01-12

-- Add VAT-EU fields to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_eu VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_eu_company BOOLEAN DEFAULT FALSE;

-- Add transaction type to invoices
DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('domestic', 'wdt', 'export');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS transaction_type transaction_type DEFAULT 'domestic';

-- Add index for EU companies
CREATE INDEX IF NOT EXISTS idx_customers_eu_company ON customers(is_eu_company) WHERE is_eu_company = TRUE;

-- Add VAT-EU to settings for seller's VAT-EU number
-- (will be stored in company_settings JSON)

COMMENT ON COLUMN customers.vat_eu IS 'Numer VAT-UE klienta (np. CZ12345678)';
COMMENT ON COLUMN customers.is_eu_company IS 'Czy klient jest firmą z UE (dla WDT)';
COMMENT ON COLUMN invoices.transaction_type IS 'Typ transakcji: domestic (krajowa), wdt (WDT 0%), export (poza UE)';
