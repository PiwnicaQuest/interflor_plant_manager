-- Migration: Permission Profiles System
-- This migration adds support for dynamic permission profiles

-- Create permission_profiles table
CREATE TABLE IF NOT EXISTS permission_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(20) DEFAULT 'gray',
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create profile_permissions table (many-to-many)
CREATE TABLE IF NOT EXISTS profile_permissions (
    profile_id INTEGER NOT NULL REFERENCES permission_profiles(id) ON DELETE CASCADE,
    permission VARCHAR(100) NOT NULL,
    PRIMARY KEY (profile_id, permission)
);

-- Add profile_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_id INTEGER REFERENCES permission_profiles(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profile_permissions_profile_id ON profile_permissions(profile_id);
CREATE INDEX IF NOT EXISTS idx_users_profile_id ON users(profile_id);

-- Insert default system profiles based on existing roles
INSERT INTO permission_profiles (name, description, color, is_system) VALUES
    ('Administrator', 'Pełny dostęp do wszystkich funkcji systemu', 'purple', TRUE),
    ('Magazynier', 'Zarządzanie magazynem, zamówieniami i skanerem', 'blue', FALSE),
    ('Sprzedawca', 'Obsługa punktu sprzedaży i wystawianie dokumentów', 'green', FALSE),
    ('Klient', 'Dostęp do sklepu internetowego i własnych zamówień', 'gray', FALSE)
ON CONFLICT (name) DO NOTHING;

-- Insert permissions for Administrator (all permissions)
INSERT INTO profile_permissions (profile_id, permission)
SELECT
    (SELECT id FROM permission_profiles WHERE name = 'Administrator'),
    permission
FROM (VALUES
    ('inventory:view'), ('inventory:create'), ('inventory:edit'), ('inventory:delete'), ('inventory:archive'), ('inventory:merge'),
    ('orders:view'), ('orders:create'), ('orders:edit'), ('orders:delete'), ('orders:cancel'), ('orders:reopen'), ('orders:status_change'), ('orders:transfer'),
    ('customers:view'), ('customers:create'), ('customers:edit'), ('customers:delete'),
    ('invoices:view'), ('invoices:create'), ('invoices:edit'), ('invoices:delete'), ('invoices:payment'),
    ('receipts:view'), ('receipts:create'),
    ('reports:view'), ('reports:export'),
    ('users:view'), ('users:create'), ('users:edit'), ('users:delete'),
    ('settings:view'), ('settings:edit'),
    ('pos:access'), ('pos:checkout'),
    ('scanner:access'), ('scanner:scan'), ('scanner:create_order'),
    ('shop:view'), ('shop:order'),
    ('profiles:view'), ('profiles:create'), ('profiles:edit'), ('profiles:delete')
) AS t(permission)
ON CONFLICT DO NOTHING;

-- Insert permissions for Magazynier
INSERT INTO profile_permissions (profile_id, permission)
SELECT
    (SELECT id FROM permission_profiles WHERE name = 'Magazynier'),
    permission
FROM (VALUES
    ('inventory:view'), ('inventory:create'), ('inventory:edit'), ('inventory:archive'), ('inventory:merge'),
    ('orders:view'), ('orders:create'), ('orders:edit'), ('orders:status_change'), ('orders:transfer'),
    ('customers:view'),
    ('scanner:access'), ('scanner:scan'), ('scanner:create_order'),
    ('reports:view')
) AS t(permission)
ON CONFLICT DO NOTHING;

-- Insert permissions for Sprzedawca (POS)
INSERT INTO profile_permissions (profile_id, permission)
SELECT
    (SELECT id FROM permission_profiles WHERE name = 'Sprzedawca'),
    permission
FROM (VALUES
    ('inventory:view'),
    ('orders:view'), ('orders:create'), ('orders:status_change'),
    ('customers:view'), ('customers:create'),
    ('invoices:view'), ('invoices:create'), ('invoices:payment'),
    ('receipts:view'), ('receipts:create'),
    ('pos:access'), ('pos:checkout'),
    ('scanner:access'), ('scanner:scan'), ('scanner:create_order')
) AS t(permission)
ON CONFLICT DO NOTHING;

-- Insert permissions for Klient
INSERT INTO profile_permissions (profile_id, permission)
SELECT
    (SELECT id FROM permission_profiles WHERE name = 'Klient'),
    permission
FROM (VALUES
    ('shop:view'), ('shop:order'), ('orders:view')
) AS t(permission)
ON CONFLICT DO NOTHING;

-- Update existing users to link to their corresponding profile
UPDATE users SET profile_id = (SELECT id FROM permission_profiles WHERE name = 'Administrator') WHERE role = 'admin' AND profile_id IS NULL;
UPDATE users SET profile_id = (SELECT id FROM permission_profiles WHERE name = 'Magazynier') WHERE role = 'warehouse' AND profile_id IS NULL;
UPDATE users SET profile_id = (SELECT id FROM permission_profiles WHERE name = 'Sprzedawca') WHERE role = 'pos' AND profile_id IS NULL;
UPDATE users SET profile_id = (SELECT id FROM permission_profiles WHERE name = 'Klient') WHERE role = 'customer' AND profile_id IS NULL;
