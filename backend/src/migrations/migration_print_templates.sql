-- Migration: Print Templates System
-- Created: 2025-11-27
-- Description: Creates print_templates table with JSONB elements storage and default templates

-- Create print_templates table
CREATE TABLE IF NOT EXISTS print_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('label', 'invoice', 'receipt', 'order', 'report')),
    paper_width NUMERIC(10,2) NOT NULL,
    paper_height NUMERIC(10,2) NOT NULL,
    margin_top NUMERIC(10,2) DEFAULT 0,
    margin_right NUMERIC(10,2) DEFAULT 0,
    margin_bottom NUMERIC(10,2) DEFAULT 0,
    margin_left NUMERIC(10,2) DEFAULT 0,
    elements JSONB NOT NULL DEFAULT '[]',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on type for faster lookups
CREATE INDEX IF NOT EXISTS idx_print_templates_type ON print_templates(type);

-- Create index on is_default for faster default template lookups
CREATE INDEX IF NOT EXISTS idx_print_templates_is_default ON print_templates(is_default);

-- Create unique constraint to ensure only one default template per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_templates_unique_default
ON print_templates(type) WHERE is_default = true;

-- Insert default label template (50x30mm)
INSERT INTO print_templates (name, type, paper_width, paper_height, margin_top, margin_right, margin_bottom, margin_left, elements, is_default)
VALUES (
    'Default Label Template',
    'label',
    50.00,
    30.00,
    2.00,
    2.00,
    2.00,
    2.00,
    '[
        {
            "id": "label-product-name",
            "type": "text",
            "x": 3,
            "y": 3,
            "width": 44,
            "height": 8,
            "content": "{{productName}}",
            "style": {
                "fontSize": 12,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "left",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "label-pot-size",
            "type": "text",
            "x": 3,
            "y": 12,
            "width": 20,
            "height": 5,
            "content": "Pot: {{potSize}}",
            "style": {
                "fontSize": 9,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#333333",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "label-units-per-pallet",
            "type": "text",
            "x": 3,
            "y": 18,
            "width": 20,
            "height": 5,
            "content": "Units/Pallet: {{unitsPerPallet}}",
            "style": {
                "fontSize": 9,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#333333",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "label-barcode",
            "type": "barcode",
            "x": 28,
            "y": 11,
            "width": 18,
            "height": 14,
            "content": "{{barcode}}",
            "style": {
                "fontSize": 8,
                "fontFamily": "monospace",
                "fontWeight": "normal",
                "textAlign": "center",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        }
    ]'::jsonb,
    true
);

-- Insert default invoice template (A4 210x297mm)
INSERT INTO print_templates (name, type, paper_width, paper_height, margin_top, margin_right, margin_bottom, margin_left, elements, is_default)
VALUES (
    'Default Invoice Template',
    'invoice',
    210.00,
    297.00,
    10.00,
    10.00,
    10.00,
    10.00,
    '[
        {
            "id": "invoice-header-title",
            "type": "text",
            "x": 15,
            "y": 15,
            "width": 180,
            "height": 12,
            "content": "INVOICE",
            "style": {
                "fontSize": 24,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "center",
                "color": "#2c3e50",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "invoice-header-line",
            "type": "line",
            "x": 15,
            "y": 28,
            "width": 180,
            "height": 0,
            "content": "",
            "style": {
                "fontSize": 0,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#2c3e50",
                "backgroundColor": "transparent",
                "borderWidth": 2,
                "borderColor": "#2c3e50",
                "rotation": 0
            }
        },
        {
            "id": "invoice-number",
            "type": "text",
            "x": 130,
            "y": 35,
            "width": 65,
            "height": 6,
            "content": "Invoice No: {{invoiceNumber}}",
            "style": {
                "fontSize": 11,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "right",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "invoice-date",
            "type": "text",
            "x": 130,
            "y": 42,
            "width": 65,
            "height": 6,
            "content": "Date: {{invoiceDate}}",
            "style": {
                "fontSize": 11,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "right",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "seller-label",
            "type": "text",
            "x": 15,
            "y": 35,
            "width": 90,
            "height": 6,
            "content": "Seller:",
            "style": {
                "fontSize": 11,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "left",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "seller-info",
            "type": "text",
            "x": 15,
            "y": 42,
            "width": 90,
            "height": 25,
            "content": "{{sellerName}}\n{{sellerAddress}}\n{{sellerCity}}, {{sellerPostalCode}}\n{{sellerCountry}}\nTax ID: {{sellerTaxId}}",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#333333",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "buyer-label",
            "type": "text",
            "x": 15,
            "y": 70,
            "width": 90,
            "height": 6,
            "content": "Buyer:",
            "style": {
                "fontSize": 11,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "left",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "buyer-info",
            "type": "text",
            "x": 15,
            "y": 77,
            "width": 90,
            "height": 25,
            "content": "{{buyerName}}\n{{buyerAddress}}\n{{buyerCity}}, {{buyerPostalCode}}\n{{buyerCountry}}\nTax ID: {{buyerTaxId}}",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#333333",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "items-table-header-bg",
            "type": "rectangle",
            "x": 15,
            "y": 110,
            "width": 180,
            "height": 8,
            "content": "",
            "style": {
                "fontSize": 0,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#000000",
                "backgroundColor": "#2c3e50",
                "borderWidth": 1,
                "borderColor": "#2c3e50",
                "rotation": 0
            }
        },
        {
            "id": "items-table-header-item",
            "type": "text",
            "x": 18,
            "y": 112,
            "width": 70,
            "height": 6,
            "content": "Item",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "left",
                "color": "#ffffff",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "items-table-header-qty",
            "type": "text",
            "x": 90,
            "y": 112,
            "width": 25,
            "height": 6,
            "content": "Qty",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "center",
                "color": "#ffffff",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "items-table-header-price",
            "type": "text",
            "x": 120,
            "y": 112,
            "width": 30,
            "height": 6,
            "content": "Price",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "right",
                "color": "#ffffff",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "items-table-header-total",
            "type": "text",
            "x": 155,
            "y": 112,
            "width": 35,
            "height": 6,
            "content": "Total",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "right",
                "color": "#ffffff",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "items-table-content",
            "type": "text",
            "x": 15,
            "y": 120,
            "width": 180,
            "height": 100,
            "content": "{{items}}",
            "style": {
                "fontSize": 9,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 1,
                "borderColor": "#cccccc",
                "rotation": 0
            }
        },
        {
            "id": "totals-subtotal-label",
            "type": "text",
            "x": 130,
            "y": 225,
            "width": 35,
            "height": 6,
            "content": "Subtotal:",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "right",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "totals-subtotal-value",
            "type": "text",
            "x": 165,
            "y": 225,
            "width": 30,
            "height": 6,
            "content": "{{subtotal}}",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "right",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "totals-tax-label",
            "type": "text",
            "x": 130,
            "y": 232,
            "width": 35,
            "height": 6,
            "content": "Tax ({{taxRate}}%):",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "right",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "totals-tax-value",
            "type": "text",
            "x": 165,
            "y": 232,
            "width": 30,
            "height": 6,
            "content": "{{tax}}",
            "style": {
                "fontSize": 10,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "right",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "totals-total-bg",
            "type": "rectangle",
            "x": 130,
            "y": 240,
            "width": 65,
            "height": 8,
            "content": "",
            "style": {
                "fontSize": 0,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#000000",
                "backgroundColor": "#f8f9fa",
                "borderWidth": 1,
                "borderColor": "#2c3e50",
                "rotation": 0
            }
        },
        {
            "id": "totals-total-label",
            "type": "text",
            "x": 133,
            "y": 242,
            "width": 35,
            "height": 6,
            "content": "TOTAL:",
            "style": {
                "fontSize": 11,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "right",
                "color": "#2c3e50",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "totals-total-value",
            "type": "text",
            "x": 165,
            "y": 242,
            "width": 27,
            "height": 6,
            "content": "{{total}}",
            "style": {
                "fontSize": 11,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "right",
                "color": "#2c3e50",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "footer-notes-label",
            "type": "text",
            "x": 15,
            "y": 255,
            "width": 180,
            "height": 5,
            "content": "Notes:",
            "style": {
                "fontSize": 9,
                "fontFamily": "Arial",
                "fontWeight": "bold",
                "textAlign": "left",
                "color": "#000000",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "footer-notes",
            "type": "text",
            "x": 15,
            "y": 261,
            "width": 180,
            "height": 10,
            "content": "{{notes}}",
            "style": {
                "fontSize": 8,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#666666",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        },
        {
            "id": "footer-line",
            "type": "line",
            "x": 15,
            "y": 273,
            "width": 180,
            "height": 0,
            "content": "",
            "style": {
                "fontSize": 0,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "left",
                "color": "#cccccc",
                "backgroundColor": "transparent",
                "borderWidth": 1,
                "borderColor": "#cccccc",
                "rotation": 0
            }
        },
        {
            "id": "footer-text",
            "type": "text",
            "x": 15,
            "y": 276,
            "width": 180,
            "height": 5,
            "content": "Thank you for your business!",
            "style": {
                "fontSize": 9,
                "fontFamily": "Arial",
                "fontWeight": "normal",
                "textAlign": "center",
                "color": "#666666",
                "backgroundColor": "transparent",
                "borderWidth": 0,
                "borderColor": "#000000",
                "rotation": 0
            }
        }
    ]'::jsonb,
    true
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_print_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_print_templates_updated_at
BEFORE UPDATE ON print_templates
FOR EACH ROW
EXECUTE FUNCTION update_print_templates_updated_at();

-- Display success message
SELECT 'Print templates migration completed successfully!' AS message;
SELECT 'Created table: print_templates' AS info;
SELECT 'Inserted 2 default templates (label and invoice)' AS info;
