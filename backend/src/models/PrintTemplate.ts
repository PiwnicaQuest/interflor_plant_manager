import { query } from './database';

export interface TemplateElement {
  id: string;
  type: 'text' | 'barcode' | 'image' | 'rectangle' | 'line' | 'qrcode';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    textAlign?: string;
    color?: string;
    backgroundColor?: string;
    borderWidth?: number;
    borderColor?: string;
    rotation?: number;
  };
}

export interface PrintTemplate {
  id: number;
  name: string;
  type: 'label' | 'invoice' | 'receipt' | 'order' | 'report';
  paperWidth: number;
  paperHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  elements: TemplateElement[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class PrintTemplateModel {
  // Get all templates, optionally filtered by type
  static async getAll(type?: string): Promise<PrintTemplate[]> {
    let sql = 'SELECT * FROM print_templates';
    const params: any[] = [];

    if (type) {
      sql += ' WHERE type = $1';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query<PrintTemplate>(sql, params);
    return result.rows;
  }

  // Get single template by ID
  static async getById(id: number): Promise<PrintTemplate | null> {
    const result = await query<PrintTemplate>(
      'SELECT * FROM print_templates WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Get default template for a specific type
  static async getDefaultByType(type: string): Promise<PrintTemplate | null> {
    const result = await query<PrintTemplate>(
      'SELECT * FROM print_templates WHERE type = $1 AND is_default = true',
      [type]
    );
    return result.rows[0] || null;
  }

  // Create new template
  static async create(
    data: Omit<PrintTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PrintTemplate> {
    const {
      name,
      type,
      paperWidth,
      paperHeight,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      elements,
      isDefault = false,
    } = data;

    const result = await query<PrintTemplate>(
      `INSERT INTO print_templates (
        name, type, paper_width, paper_height,
        margin_top, margin_right, margin_bottom, margin_left,
        elements, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        name,
        type,
        paperWidth,
        paperHeight,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        JSON.stringify(elements),
        isDefault,
      ]
    );

    return result.rows[0];
  }

  // Update existing template
  static async update(
    id: number,
    data: Partial<PrintTemplate>
  ): Promise<PrintTemplate | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'name',
      'type',
      'paperWidth',
      'paperHeight',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft',
      'elements',
      'isDefault',
    ];

    const columnMap: { [key: string]: string } = {
      paperWidth: 'paper_width',
      paperHeight: 'paper_height',
      marginTop: 'margin_top',
      marginRight: 'margin_right',
      marginBottom: 'margin_bottom',
      marginLeft: 'margin_left',
      isDefault: 'is_default',
    };

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const columnName = columnMap[key] || key;

        // Handle JSONB field
        if (key === 'elements') {
          fields.push(`${columnName} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${columnName} = $${paramIndex}`);
          values.push(value);
        }

        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const sql = `UPDATE print_templates
                 SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $${paramIndex}
                 RETURNING *`;

    const result = await query<PrintTemplate>(sql, values);
    return result.rows[0] || null;
  }

  // Delete template
  static async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM print_templates WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // Set template as default (and unset others of same type)
  static async setAsDefault(id: number): Promise<boolean> {
    // First, get the template to know its type
    const template = await this.getById(id);
    if (!template) {
      return false;
    }

    // Unset all defaults for this type
    await query(
      'UPDATE print_templates SET is_default = false WHERE type = $1',
      [template.type]
    );

    // Set this template as default
    const result = await query(
      'UPDATE print_templates SET is_default = true WHERE id = $1',
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  // Duplicate template with new name
  static async duplicate(
    id: number,
    newName: string
  ): Promise<PrintTemplate | null> {
    const original = await this.getById(id);
    if (!original) {
      return null;
    }

    // Create a copy with the new name and isDefault set to false
    const result = await query<PrintTemplate>(
      `INSERT INTO print_templates (
        name, type, paper_width, paper_height,
        margin_top, margin_right, margin_bottom, margin_left,
        elements, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        newName,
        original.type,
        original.paperWidth,
        original.paperHeight,
        original.marginTop,
        original.marginRight,
        original.marginBottom,
        original.marginLeft,
        JSON.stringify(original.elements),
        false,
      ]
    );

    return result.rows[0];
  }
}
