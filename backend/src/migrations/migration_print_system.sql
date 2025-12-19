-- Migration: Print System
-- Creates tables for print queue and printer configuration

-- Table: print_agents (registered print agents/computers)
CREATE TABLE IF NOT EXISTS print_agents (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100) UNIQUE NOT NULL,  -- Unique identifier for the agent
    name VARCHAR(255) NOT NULL,              -- Friendly name (e.g., "Komputer biurowy")
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_online BOOLEAN DEFAULT false,
    available_printers JSONB DEFAULT '[]',   -- List of printers available on this agent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: printer_configs (printer configuration per document type)
CREATE TABLE IF NOT EXISTS printer_configs (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,      -- barcode_labels, orders, invoices, etc.
    agent_id VARCHAR(100),                   -- Which print agent to use
    printer_name VARCHAR(255),               -- Name of the printer on the agent
    paper_size VARCHAR(50) DEFAULT 'A4',
    copies INTEGER DEFAULT 1,
    orientation VARCHAR(20) DEFAULT 'portrait',  -- portrait or landscape
    color_mode VARCHAR(20) DEFAULT 'color',      -- color or grayscale
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type)
);

-- Table: print_jobs (print queue)
CREATE TABLE IF NOT EXISTS print_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(100) UNIQUE NOT NULL,     -- UUID for the job
    document_type VARCHAR(50) NOT NULL,      -- barcode_labels, orders, invoices, etc.
    status VARCHAR(20) DEFAULT 'pending',    -- pending, processing, completed, failed, cancelled
    priority INTEGER DEFAULT 5,              -- 1-10, lower = higher priority

    -- Content to print
    content_type VARCHAR(20) NOT NULL,       -- html, pdf, raw
    content TEXT,                            -- HTML content or base64 encoded PDF
    content_url VARCHAR(500),                -- Or URL to fetch content from

    -- Printer settings (can override config)
    agent_id VARCHAR(100),
    printer_name VARCHAR(255),
    paper_size VARCHAR(50),
    copies INTEGER DEFAULT 1,
    orientation VARCHAR(20),
    color_mode VARCHAR(20),

    -- Metadata
    title VARCHAR(255),                      -- Job title for display
    source_type VARCHAR(50),                 -- order, product, invoice, etc.
    source_id INTEGER,                       -- ID of the source record

    -- Tracking
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_agent ON print_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created ON print_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_print_agents_online ON print_agents(is_online);

-- Insert default printer configurations
INSERT INTO printer_configs (document_type, paper_size, copies) VALUES
    ('barcode_labels', '100x50mm', 1),
    ('orders', 'A4', 1),
    ('invoices', 'A4', 1),
    ('receipts', '80mm', 1),
    ('inventory_reports', 'A4', 1),
    ('delivery_notes', 'A4', 1)
ON CONFLICT (document_type) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_print_agents_updated_at ON print_agents;
CREATE TRIGGER update_print_agents_updated_at
    BEFORE UPDATE ON print_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_printer_configs_updated_at ON printer_configs;
CREATE TRIGGER update_printer_configs_updated_at
    BEFORE UPDATE ON printer_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
