-- PlantManager Database Schema
-- PostgreSQL 14+

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'warehouse', 'pos', 'customer');
CREATE TYPE order_status AS ENUM ('pending', 'in_progress', 'ready_for_pickup', 'completed', 'cancelled');
CREATE TYPE inventory_status AS ENUM ('ok', 'low');
CREATE TYPE movement_type AS ENUM ('purchase', 'sale', 'correction', 'return');
CREATE TYPE payment_method AS ENUM ('card', 'cash', 'transfer');
CREATE TYPE document_type AS ENUM ('invoice', 'receipt');

-- ============================================
-- USERS (pracownicy i klienci)
-- ============================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- PRICE GROUPS (grupy cenowe)
-- ============================================

CREATE TABLE price_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Domyślne grupy cenowe
INSERT INTO price_groups (name, discount_percentage, description) VALUES
    ('podstawowa', 0.00, 'Cena podstawowa brutto (marża 100%)'),
    ('rabat_10', 10.00, 'Rabat 10%'),
    ('rabat_12', 12.00, 'Rabat 12%'),
    ('rabat_15', 15.00, 'Rabat 15%'),
    ('rabat_20', 20.00, 'Rabat 20%'),
    ('rabat_25', 25.00, 'Rabat 25%');

-- ============================================
-- CUSTOMERS (kontrahenci)
-- ============================================

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_nip ON customers(nip);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_price_group ON customers(price_group_id);

-- ============================================
-- PRODUCTS / INVENTORY_ITEMS (magazyn roślin)
-- ============================================

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(255) UNIQUE,
    plant_name VARCHAR(255) NOT NULL,
    pot_size VARCHAR(50),
    plant_height_cm INTEGER,
    plant_passport VARCHAR(255),

    -- Ilości
    pallet_count INTEGER DEFAULT 0,
    units_per_pallet INTEGER DEFAULT 0,
    total_units INTEGER GENERATED ALWAYS AS (pallet_count * units_per_pallet) STORED,

    -- Ceny w PLN brutto
    purchase_price_pln DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    base_price_gross DECIMAL(10,2) GENERATED ALWAYS AS (purchase_price_pln * 2.0) STORED,
    price_discount_10 DECIMAL(10,2) GENERATED ALWAYS AS (purchase_price_pln * 2.0 * 0.90) STORED,
    price_discount_12 DECIMAL(10,2) GENERATED ALWAYS AS (purchase_price_pln * 2.0 * 0.88) STORED,
    price_discount_15 DECIMAL(10,2) GENERATED ALWAYS AS (purchase_price_pln * 2.0 * 0.85) STORED,
    price_discount_20 DECIMAL(10,2) GENERATED ALWAYS AS (purchase_price_pln * 2.0 * 0.80) STORED,
    price_discount_25 DECIMAL(10,2) GENERATED ALWAYS AS (purchase_price_pln * 2.0 * 0.75) STORED,

    -- Status i widoczność
    inventory_status inventory_status DEFAULT 'ok',
    visible_in_shop BOOLEAN DEFAULT false,

    -- Dodatkowe informacje
    image_url TEXT,
    delivery_date DATE,
    vat_rate DECIMAL(5,2) DEFAULT 8.00,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger do automatycznej aktualizacji inventory_status
CREATE OR REPLACE FUNCTION update_inventory_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pallet_count < 2 THEN
        NEW.inventory_status = 'low';
    ELSE
        NEW.inventory_status = 'ok';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_status
BEFORE INSERT OR UPDATE OF pallet_count ON products
FOR EACH ROW
EXECUTE FUNCTION update_inventory_status();

CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_plant_name ON products(plant_name);
CREATE INDEX idx_products_inventory_status ON products(inventory_status);
CREATE INDEX idx_products_visible_in_shop ON products(visible_in_shop);

-- ============================================
-- INVENTORY_MOVEMENTS (historia ruchów magazynowych)
-- ============================================

CREATE TABLE inventory_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    movement_type movement_type NOT NULL,
    delta_units INTEGER NOT NULL, -- ujemne dla rozchodów, dodatnie dla przychodów
    delta_pallets INTEGER DEFAULT 0,
    reason TEXT,
    reference_type VARCHAR(50), -- 'order', 'invoice', 'receipt', 'manual'
    reference_id INTEGER, -- id zamówienia/faktury/paragonu
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements(created_at);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);

-- ============================================
-- ORDERS (zamówienia)
-- ============================================

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    status order_status DEFAULT 'pending',

    -- Snapshot danych klienta (na moment utworzenia zamówienia)
    customer_snapshot JSONB,

    notes TEXT,
    customer_notes TEXT,

    total_amount DECIMAL(10,2) DEFAULT 0.00,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- ============================================
-- ORDER_ITEMS (pozycje zamówień)
-- ============================================

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

    -- Snapshot produktu na moment zamówienia
    product_snapshot JSONB,

    quantity INTEGER NOT NULL,
    unit_price_gross DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price_gross) STORED,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ============================================
-- INVOICES (faktury VAT)
-- ============================================

CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

    -- Snapshot danych nabywcy z momentu wystawienia
    buyer_snapshot JSONB NOT NULL,

    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_deadline DATE,
    payment_method payment_method,

    subtotal_net DECIMAL(10,2) DEFAULT 0.00,
    total_vat DECIMAL(10,2) DEFAULT 0.00,
    total_gross DECIMAL(10,2) DEFAULT 0.00,

    notes TEXT,
    pdf_url TEXT,

    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);

-- ============================================
-- INVOICE_ITEMS (pozycje faktur)
-- ============================================

CREATE TABLE invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_net DECIMAL(10,2) NOT NULL,
    vat_rate DECIMAL(5,2) NOT NULL DEFAULT 8.00,

    total_net DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price_net) STORED,
    total_vat DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price_net * vat_rate / 100) STORED,
    total_gross DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price_net * (1 + vat_rate / 100)) STORED,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON invoice_items(product_id);

-- ============================================
-- RECEIPTS (paragony fiskalne / sprzedaż detaliczna)
-- ============================================

CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,

    payment_method payment_method NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,

    notes TEXT,

    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_receipts_receipt_number ON receipts(receipt_number);
CREATE INDEX idx_receipts_order ON receipts(order_id);
CREATE INDEX idx_receipts_created_at ON receipts(created_at);

-- ============================================
-- SEQUENCES (numeracje dokumentów)
-- ============================================

CREATE TABLE document_sequences (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) UNIQUE NOT NULL,
    year INTEGER NOT NULL,
    current_number INTEGER DEFAULT 0,
    prefix VARCHAR(20),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type, year)
);

-- Funkcja do generowania kolejnego numeru dokumentu
CREATE OR REPLACE FUNCTION get_next_document_number(doc_type VARCHAR, prefix_text VARCHAR DEFAULT '')
RETURNS VARCHAR AS $$
DECLARE
    current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
    next_num INTEGER;
    result VARCHAR;
BEGIN
    -- Upsert: wstaw lub zaktualizuj
    INSERT INTO document_sequences (document_type, year, current_number, prefix)
    VALUES (doc_type, current_year, 1, prefix_text)
    ON CONFLICT (document_type, year)
    DO UPDATE SET current_number = document_sequences.current_number + 1,
                  updated_at = CURRENT_TIMESTAMP
    RETURNING current_number INTO next_num;

    -- Formatuj numer: PREFIX/NNN/YYYY
    result := prefix_text || '/' || LPAD(next_num::TEXT, 5, '0') || '/' || current_year;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- WEBSOCKET NOTIFICATIONS (opcjonalnie, dla logów)
-- ============================================

CREATE TABLE order_status_log (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status order_status,
    new_status order_status NOT NULL,
    changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_status_log_order ON order_status_log(order_id);
CREATE INDEX idx_order_status_log_created_at ON order_status_log(created_at);

-- ============================================
-- TRIGGERS DO AKTUALIZACJI TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PRZYKŁADOWE DANE TESTOWE
-- ============================================

-- Admin user
INSERT INTO users (email, password_hash, role) VALUES
    ('admin@plantmanager.pl', '$2b$10$example_hash_here', 'admin'),
    ('magazyn@plantmanager.pl', '$2b$10$example_hash_here', 'warehouse'),
    ('kasa@plantmanager.pl', '$2b$10$example_hash_here', 'pos');

-- Przykładowy klient
INSERT INTO users (email, password_hash, role) VALUES
    ('klient@example.pl', '$2b$10$example_hash_here', 'customer');

INSERT INTO customers (user_id, company_name, nip, street, postal_code, city, phone, email, price_group_id) VALUES
    (4, 'Kwiaciarnia Róża Sp. z o.o.', '1234567890', 'ul. Kwiatowa 15', '00-001', 'Warszawa', '+48 123 456 789', 'klient@example.pl', 3);

-- Przykładowe produkty
INSERT INTO products (barcode, plant_name, pot_size, plant_height_cm, plant_passport, pallet_count, units_per_pallet, purchase_price_pln, visible_in_shop, delivery_date) VALUES
    ('5901234567890', 'Monstera Deliciosa', '21 cm', 60, 'PL-123456', 5, 12, 25.00, true, '2025-01-15'),
    ('5901234567891', 'Ficus Elastica', '17 cm', 45, 'PL-123457', 3, 15, 18.00, true, '2025-01-15'),
    ('5901234567892', 'Sansevieria Trifasciata', '12 cm', 30, 'PL-123458', 1, 20, 12.00, true, '2025-01-10'),
    ('5901234567893', 'Pothos Aureus', '14 cm', 35, 'PL-123459', 8, 18, 15.00, true, '2025-01-20');

-- ============================================
-- KONIEC SCHEMATU
-- ============================================
