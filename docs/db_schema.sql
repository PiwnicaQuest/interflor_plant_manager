-- ============================================================
-- PlantManager Database Schema (current)
-- PostgreSQL 16
-- Generated: 2026-02-02
-- ============================================================
-- To regenerate from live DB:
--   PGPASSWORD=plantmanager123 pg_dump -h localhost -U plantmanager \
--     -d plantmanager --schema-only --no-owner --no-privileges \
--     > docs/db_schema.sql
-- ============================================================

-- ==================== ENUMS ====================

CREATE TYPE user_role AS ENUM ('admin', 'warehouse', 'pos', 'customer');
CREATE TYPE order_status AS ENUM ('pending', 'in_progress', 'ready_for_pickup', 'completed', 'cancelled');
CREATE TYPE inventory_status AS ENUM ('ok', 'low');
CREATE TYPE movement_type AS ENUM ('purchase', 'sale', 'correction', 'return', 'loss', 'order', 'order_cancel', 'loss_reverse', 'manual', 'import');
CREATE TYPE payment_method AS ENUM ('card', 'cash', 'transfer');
CREATE TYPE document_type AS ENUM ('invoice', 'receipt');
CREATE TYPE payment_status AS ENUM ('unpaid', 'partial', 'paid', 'overdue');
CREATE TYPE invoice_type AS ENUM ('invoice', 'proforma', 'correction');
CREATE TYPE transaction_type AS ENUM ('domestic', 'eu', 'export', 'import', 'wdt');

-- ==================== USERS ====================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    is_active BOOLEAN DEFAULT true,
    login VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    profile_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== PERMISSION PROFILES ====================

CREATE TABLE permission_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(50),
    is_system BOOLEAN DEFAULT false,
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profile_permissions (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER REFERENCES permission_profiles(id),
    permission VARCHAR(255) NOT NULL
);

-- ==================== PRICE GROUPS ====================

CREATE TABLE price_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== CUSTOMERS ====================

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    company_name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    nip VARCHAR(20) UNIQUE,
    street VARCHAR(255),
    postal_code VARCHAR(20),
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Polska',
    phone VARCHAR(50),
    email VARCHAR(255),
    price_group_id INTEGER REFERENCES price_groups(id) DEFAULT 1,
    notes TEXT,
    customer_code VARCHAR(50),
    vat_eu VARCHAR(50),
    is_eu_company BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== PRODUCTS ====================

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(255),
    plant_name VARCHAR(255) NOT NULL,
    pot_size VARCHAR(50),
    plant_height_cm INTEGER,
    plant_passport VARCHAR(255),
    pallet_count INTEGER DEFAULT 0,
    units_per_pallet INTEGER DEFAULT 0,
    total_units INTEGER,
    purchase_price_pln NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    inventory_status inventory_status DEFAULT 'ok',
    visible_in_shop BOOLEAN DEFAULT false,
    image_url TEXT,
    delivery_date DATE,
    vat_rate NUMERIC(5,2) DEFAULT 8.00,
    base_price_gross NUMERIC(10,2) DEFAULT 0,
    price_discount_10 NUMERIC(10,2) DEFAULT 0,
    price_discount_12 NUMERIC(10,2) DEFAULT 0,
    price_discount_15 NUMERIC(10,2) DEFAULT 0,
    price_discount_20 NUMERIC(10,2) DEFAULT 0,
    price_discount_25 NUMERIC(10,2) DEFAULT 0,
    price_plus NUMERIC(10,2) DEFAULT 0,
    price_auchan8 NUMERIC(10,2),
    grower VARCHAR(255),
    is_archived BOOLEAN DEFAULT false,
    tags TEXT[] DEFAULT '{}',
    loose_units INTEGER DEFAULT 0,
    merged_into_id INTEGER,
    is_merged_slave BOOLEAN DEFAULT false,
    merged_at TIMESTAMP,
    original_barcode VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_tags (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

-- ==================== GROWER PASSPORTS ====================

CREATE TABLE grower_passports (
    id SERIAL PRIMARY KEY,
    grower_name VARCHAR(255) NOT NULL,
    passport_number VARCHAR(255),
    floricode VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ORDERS ====================

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    created_by_user_id INTEGER REFERENCES users(id),
    status order_status DEFAULT 'pending',
    customer_snapshot JSONB,
    notes TEXT,
    customer_notes TEXT,
    total_amount NUMERIC(10,2) DEFAULT 0.00,
    source VARCHAR(50) DEFAULT 'panel',
    recipient_name VARCHAR(255),
    recipient_phone VARCHAR(50),
    recipient_address TEXT,
    recipient_snapshot JSONB,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_snapshot JSONB,
    quantity INTEGER NOT NULL,
    unit_price_gross NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2),
    pallet_count INTEGER DEFAULT 0,
    units_per_pallet INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_status_log (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status order_status,
    new_status order_status NOT NULL,
    changed_by_user_id INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INVOICES ====================

CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    customer_id INTEGER REFERENCES customers(id),
    buyer_snapshot JSONB NOT NULL,
    seller_snapshot JSONB,
    recipient_snapshot JSONB,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_deadline DATE,
    payment_method payment_method,
    payment_status payment_status DEFAULT 'unpaid',
    paid_amount NUMERIC(10,2) DEFAULT 0,
    payment_splits JSONB,
    subtotal_net NUMERIC(10,2) DEFAULT 0.00,
    total_vat NUMERIC(10,2) DEFAULT 0.00,
    total_gross NUMERIC(10,2) DEFAULT 0.00,
    invoice_type invoice_type DEFAULT 'invoice',
    transaction_type transaction_type,
    proforma_id INTEGER,
    notes TEXT,
    pdf_url TEXT,
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_net NUMERIC(10,2) NOT NULL,
    unit_price_gross NUMERIC(10,2),
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8.00,
    total_net NUMERIC(10,2),
    total_vat NUMERIC(10,2),
    total_gross NUMERIC(10,2),
    grower_passport VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INVOICE CORRECTIONS ====================

CREATE TABLE invoice_corrections (
    id SERIAL PRIMARY KEY,
    original_invoice_id INTEGER REFERENCES invoices(id),
    correction_number VARCHAR(100),
    reason TEXT,
    total_amount_before NUMERIC(10,2),
    total_amount_after NUMERIC(10,2),
    difference NUMERIC(10,2),
    difference_gross NUMERIC(10,2) DEFAULT 0,
    difference_net NUMERIC(10,2) DEFAULT 0,
    difference_vat NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',
    issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice_correction_items (
    id SERIAL PRIMARY KEY,
    correction_id INTEGER REFERENCES invoice_corrections(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(255),
    quantity_before INTEGER DEFAULT 0,
    quantity_after INTEGER DEFAULT 0,
    unit_price_before NUMERIC(10,2),
    unit_price_after NUMERIC(10,2),
    total_before NUMERIC(10,2),
    total_after NUMERIC(10,2)
);

-- ==================== PROFORMAS (legacy) ====================

CREATE TABLE proformas (
    id SERIAL PRIMARY KEY,
    proforma_number VARCHAR(100),
    customer_id INTEGER REFERENCES customers(id),
    order_id INTEGER REFERENCES orders(id),
    total_amount NUMERIC(10,2),
    status VARCHAR(50) DEFAULT 'draft',
    notes TEXT,
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proforma_items (
    id SERIAL PRIMARY KEY,
    proforma_id INTEGER REFERENCES proformas(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(255),
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2),
    total_price NUMERIC(10,2),
    vat_rate NUMERIC(5,2) DEFAULT 8.00
);

-- Note: Active proformas are stored in `invoices` table with invoice_type='proforma'

-- ==================== RECEIPTS ====================

CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    customer_id INTEGER REFERENCES customers(id),
    payment_method payment_method NOT NULL,
    payment_splits JSONB,
    total_amount NUMERIC(10,2) NOT NULL,
    buyer_snapshot JSONB,
    recipient_snapshot JSONB,
    notes TEXT,
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE receipt_items (
    id SERIAL PRIMARY KEY,
    receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    description VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price_gross NUMERIC(10,2),
    total_gross NUMERIC(10,2),
    vat_rate NUMERIC(5,2) DEFAULT 8.00
);

-- ==================== LOSSES ====================

CREATE TABLE losses (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) DEFAULT 0,
    total_value NUMERIC(10,2) DEFAULT 0,
    reason TEXT,
    notes TEXT,
    is_reversed BOOLEAN DEFAULT false,
    reversed_at TIMESTAMP,
    reversed_by_user_id INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INVENTORY MOVEMENTS ====================

CREATE TABLE inventory_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    user_id INTEGER REFERENCES users(id),
    movement_type movement_type NOT NULL,
    delta_units INTEGER NOT NULL,
    delta_pallets INTEGER DEFAULT 0,
    reason TEXT,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SESSIONS & AUTH ====================

CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id UUID DEFAULT gen_random_uuid(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    source VARCHAR(50),
    device_info TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    ip_address VARCHAR(45),
    user_agent TEXT,
    source VARCHAR(50),
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SETTINGS ====================

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== PRINT TEMPLATES ====================

CREATE TABLE print_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    html_template TEXT,
    css_template TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== DOCUMENT SEQUENCES ====================

CREATE TABLE document_sequences (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,
    year INTEGER NOT NULL,
    current_number INTEGER DEFAULT 0,
    prefix VARCHAR(20),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type, year)
);

-- ==================== FUNCTIONS ====================

CREATE OR REPLACE FUNCTION get_next_document_number(doc_type VARCHAR, prefix_text VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
    next_num INTEGER;
    result VARCHAR;
BEGIN
    INSERT INTO document_sequences (document_type, year, current_number, prefix)
    VALUES (doc_type, current_year, 1, prefix_text)
    ON CONFLICT (document_type, year)
    DO UPDATE SET current_number = document_sequences.current_number + 1,
                  updated_at = CURRENT_TIMESTAMP
    RETURNING current_number INTO next_num;

    result := prefix_text || '/' || LPAD(next_num::TEXT, 5, '0') || '/' || current_year;
    RETURN result;
END;
$$ LANGUAGE plpgsql;
