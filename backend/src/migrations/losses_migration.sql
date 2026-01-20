-- Losses table migration
-- Creates table for tracking inventory losses

CREATE TABLE IF NOT EXISTS losses (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    is_reversed BOOLEAN NOT NULL DEFAULT false,
    reversed_at TIMESTAMP WITH TIME ZONE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_losses_product_id ON losses(product_id);
CREATE INDEX IF NOT EXISTS idx_losses_created_at ON losses(created_at);
CREATE INDEX IF NOT EXISTS idx_losses_is_reversed ON losses(is_reversed);
