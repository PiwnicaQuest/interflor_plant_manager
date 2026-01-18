import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../models/database';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';

// PrintTemplate interface based on DB schema
interface PrintTemplate {
  id: number;
  name: string;
  type: 'label' | 'invoice' | 'receipt' | 'order' | 'report';
  paper_width: number;
  paper_height: number;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  elements: TemplateElement[];
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

interface TemplateElement {
  id: string;
  type: 'text' | 'barcode' | 'qrcode' | 'rectangle' | 'line' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style: ElementStyle;
}

interface ElementStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  textAlign: string;
  color: string;
  backgroundColor: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  rotation: number;
}

export class PrintTemplateController {
  /**
   * GET /print-templates - Get all templates (optional ?type=label filter)
   */
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { type } = req.query;

      let sql = 'SELECT * FROM print_templates ORDER BY type, name';
      const params: any[] = [];

      if (type && typeof type === 'string') {
        sql = 'SELECT * FROM print_templates WHERE type = $1 ORDER BY name';
        params.push(type);
      }

      const result = await query<PrintTemplate>(sql, params);

      res.json({
        templates: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('Get all templates error:', error);
      res.status(500).json({ error: 'Błąd pobierania szablonów' });
    }
  }

  /**
   * GET /print-templates/:id - Get single template
   */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID szablonu' });
        return;
      }

      const result = await query<PrintTemplate>(
        'SELECT * FROM print_templates WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Szablon nie znaleziony' });
        return;
      }

      res.json({ template: result.rows[0] });
    } catch (error) {
      console.error('Get template by id error:', error);
      res.status(500).json({ error: 'Błąd pobierania szablonu' });
    }
  }

  /**
   * GET /print-templates/default/:type - Get default template for type
   */
  static async getDefaultByType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { type } = req.params;

      const validTypes = ['label', 'invoice', 'receipt', 'order', 'report'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: 'Nieprawidłowy typ szablonu' });
        return;
      }

      const result = await query<PrintTemplate>(
        'SELECT * FROM print_templates WHERE type = $1 AND is_default = true LIMIT 1',
        [type]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Domyślny szablon nie znaleziony' });
        return;
      }

      res.json({ template: result.rows[0] });
    } catch (error) {
      console.error('Get default template error:', error);
      res.status(500).json({ error: 'Błąd pobierania domyślnego szablonu' });
    }
  }

  /**
   * POST /print-templates - Create new template
   * Requires ADMIN or WAREHOUSE role
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Support both camelCase (frontend) and snake_case (direct API)
      const name = req.body.name;
      const type = req.body.type;
      const paper_width = req.body.paper_width || req.body.paperWidthMm;
      const paper_height = req.body.paper_height || req.body.paperHeightMm;
      const margin_top = req.body.margin_top ?? req.body.marginTopMm ?? 0;
      const margin_right = req.body.margin_right ?? req.body.marginRightMm ?? 0;
      const margin_bottom = req.body.margin_bottom ?? req.body.marginBottomMm ?? 0;
      const margin_left = req.body.margin_left ?? req.body.marginLeftMm ?? 0;
      const elements = req.body.elements || [];
      const is_default = req.body.is_default || req.body.isDefault || false;

      // Validation
      if (!name || !type || !paper_width || !paper_height) {
        res.status(400).json({ error: 'Nazwa, typ, szerokość i wysokość papieru są wymagane' });
        return;
      }

      const validTypes = ['label', 'invoice', 'receipt', 'order', 'report'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: 'Nieprawidłowy typ szablonu' });
        return;
      }

      if (elements !== undefined && !Array.isArray(elements)) {
        res.status(400).json({ error: 'Elementy szablonu muszą być tablicą' });
        return;
      }

      // If setting as default, unset current default for this type
      if (is_default) {
        await query(
          'UPDATE print_templates SET is_default = false WHERE type = $1',
          [type]
        );
      }

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
          paper_width,
          paper_height,
          margin_top || 0,
          margin_right || 0,
          margin_bottom || 0,
          margin_left || 0,
          JSON.stringify(elements),
          is_default || false
        ]
      );

      res.status(201).json({
        message: 'Szablon utworzony pomyślnie',
        template: result.rows[0]
      });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({ error: 'Błąd tworzenia szablonu' });
    }
  }

  /**
   * PUT /print-templates/:id - Update template
   * Requires ADMIN or WAREHOUSE role
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID szablonu' });
        return;
      }

      // Support both camelCase (frontend) and snake_case (direct API)
      const name = req.body.name;
      const type = req.body.type;
      const paper_width = req.body.paper_width || req.body.paperWidthMm;
      const paper_height = req.body.paper_height || req.body.paperHeightMm;
      const margin_top = req.body.margin_top ?? req.body.marginTopMm;
      const margin_right = req.body.margin_right ?? req.body.marginRightMm;
      const margin_bottom = req.body.margin_bottom ?? req.body.marginBottomMm;
      const margin_left = req.body.margin_left ?? req.body.marginLeftMm;
      const elements = req.body.elements;
      const is_default = req.body.is_default ?? req.body.isDefault;

      // Check if template exists
      const checkResult = await query<PrintTemplate>(
        'SELECT * FROM print_templates WHERE id = $1',
        [id]
      );

      if (checkResult.rows.length === 0) {
        res.status(404).json({ error: 'Szablon nie znaleziony' });
        return;
      }

      // Validate type if provided
      if (type) {
        const validTypes = ['label', 'invoice', 'receipt', 'order', 'report'];
        if (!validTypes.includes(type)) {
          res.status(400).json({ error: 'Nieprawidłowy typ szablonu' });
          return;
        }
      }

      // If setting as default, unset current default for this type
      if (is_default) {
        const templateType = type || checkResult.rows[0].type;
        await query(
          'UPDATE print_templates SET is_default = false WHERE type = $1 AND id != $2',
          [templateType, id]
        );
      }

      // Build dynamic update query using normalized values
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      const updateData: Record<string, any> = {
        name,
        type,
        paper_width,
        paper_height,
        margin_top,
        margin_right,
        margin_bottom,
        margin_left,
        elements,
        is_default
      };

      for (const [key, value] of Object.entries(updateData)) {
        if (value !== undefined) {
          if (key === 'elements') {
            fields.push(`${key} = $${paramIndex}`);
            values.push(JSON.stringify(value));
          } else {
            fields.push(`${key} = $${paramIndex}`);
            values.push(value);
          }
          paramIndex++;
        }
      }

      if (fields.length === 0) {
        res.status(400).json({ error: 'Brak pól do aktualizacji' });
        return;
      }

      values.push(id);
      const sql = `UPDATE print_templates SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`;

      const result = await query<PrintTemplate>(sql, values);

      res.json({
        message: 'Szablon zaktualizowany pomyślnie',
        template: result.rows[0]
      });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({ error: 'Błąd aktualizacji szablonu' });
    }
  }

  /**
   * DELETE /print-templates/:id - Delete template
   * Requires ADMIN or WAREHOUSE role
   */
  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID szablonu' });
        return;
      }

      const result = await query(
        'DELETE FROM print_templates WHERE id = $1',
        [id]
      );

      if ((result.rowCount || 0) === 0) {
        res.status(404).json({ error: 'Szablon nie znaleziony' });
        return;
      }

      res.json({ message: 'Szablon usunięty pomyślnie' });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({ error: 'Błąd usuwania szablonu' });
    }
  }

  /**
   * POST /print-templates/:id/set-default - Set as default
   * Requires ADMIN or WAREHOUSE role
   */
  static async setAsDefault(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID szablonu' });
        return;
      }

      // Get template type
      const templateResult = await query<PrintTemplate>(
        'SELECT * FROM print_templates WHERE id = $1',
        [id]
      );

      if (templateResult.rows.length === 0) {
        res.status(404).json({ error: 'Szablon nie znaleziony' });
        return;
      }

      const template = templateResult.rows[0];

      // Unset current default for this type
      await query(
        'UPDATE print_templates SET is_default = false WHERE type = $1',
        [template.type]
      );

      // Set new default
      await query(
        'UPDATE print_templates SET is_default = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      res.json({ message: 'Szablon ustawiony jako domyślny' });
    } catch (error) {
      console.error('Set default template error:', error);
      res.status(500).json({ error: 'Błąd ustawiania domyślnego szablonu' });
    }
  }

  /**
   * POST /print-templates/:id/duplicate - Duplicate template
   */
  static async duplicate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID szablonu' });
        return;
      }

      // Get original template
      const templateResult = await query<PrintTemplate>(
        'SELECT * FROM print_templates WHERE id = $1',
        [id]
      );

      if (templateResult.rows.length === 0) {
        res.status(404).json({ error: 'Szablon nie znaleziony' });
        return;
      }

      const original = templateResult.rows[0];

      // Create duplicate with modified name
      const result = await query<PrintTemplate>(
        `INSERT INTO print_templates (
          name, type, paper_width, paper_height,
          margin_top, margin_right, margin_bottom, margin_left,
          elements, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
        RETURNING *`,
        [
          `${original.name} (Kopia)`,
          original.type,
          original.paper_width,
          original.paper_height,
          original.margin_top,
          original.margin_right,
          original.margin_bottom,
          original.margin_left,
          JSON.stringify(original.elements)
        ]
      );

      res.status(201).json({
        message: 'Szablon zduplikówany pomyślnie',
        template: result.rows[0]
      });
    } catch (error) {
      console.error('Duplicate template error:', error);
      res.status(500).json({ error: 'Błąd duplikówania szablonu' });
    }
  }

  /**
   * POST /print-templates/:id/render - Render template to PDF with data
   */
  static async renderPdf(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Nieprawidłowe ID szablonu' });
        return;
      }

      const { data, copies = 1 } = req.body;

      if (!data || typeof data !== 'object') {
        res.status(400).json({ error: 'Dane są wymagane i muszą być obiektem' });
        return;
      }

      // Get template
      const templateResult = await query<PrintTemplate>(
        'SELECT * FROM print_templates WHERE id = $1',
        [id]
      );

      if (templateResult.rows.length === 0) {
        res.status(404).json({ error: 'Szablon nie znaleziony' });
        return;
      }

      const template = templateResult.rows[0];

      // Convert mm to points (1mm = 2.83465 points)
      const MM_TO_POINTS = 2.83465;

      const pageWidth = template.paper_width * MM_TO_POINTS;
      const pageHeight = template.paper_height * MM_TO_POINTS;

      // Create PDF document
      const doc = new PDFDocument({
        size: [pageWidth, pageHeight],
        margins: {
          top: template.margin_top * MM_TO_POINTS,
          right: template.margin_right * MM_TO_POINTS,
          bottom: template.margin_bottom * MM_TO_POINTS,
          left: template.margin_left * MM_TO_POINTS
        },
        autoFirstPage: false
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${template.name}.pdf"`);

      // Pipe PDF to response
      doc.pipe(res);

      // Generate requested number of copies
      const numCopies = Math.min(Math.max(1, copies), 100);

      for (let i = 0; i < numCopies; i++) {
        doc.addPage();

        // Render each element
        for (const element of template.elements) {
          await PrintTemplateController.renderElement(doc, element, data, MM_TO_POINTS);
        }
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error('Render PDF error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Błąd generowania PDF' });
      }
    }
  }

  /**
   * Generate barcode as PNG buffer using bwip-js
   */
  private static async generateBarcode(
    text: string,
    width: number,
    height: number,
    type: 'barcode' | 'qrcode' = 'barcode'
  ): Promise<Buffer> {
    const options: any = type === 'qrcode'
      ? {
          bcid: 'qrcode',
          text: text,
          scale: 3,
          height: Math.max(10, height / 3),
          width: Math.max(10, width / 3),
          includetext: false,
        }
      : {
          bcid: 'code128',
          text: text,
          scale: 2,
          height: Math.max(8, height * 0.6),
          includetext: true,
          textxalign: 'center',
          textsize: 8,
        };

    return bwipjs.toBuffer(options);
  }

  /**
   * Helper method to render a single element
   */
  private static async renderElement(
    doc: PDFKit.PDFDocument,
    element: TemplateElement,
    data: any,
    MM_TO_POINTS: number
  ): Promise<void> {
    const x = element.x * MM_TO_POINTS;
    const y = element.y * MM_TO_POINTS;
    const width = element.width * MM_TO_POINTS;
    const height = element.height * MM_TO_POINTS;
    const style = element.style || {} as ElementStyle;

    // Replace placeholders in content
    let content = element.content || '';
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    content = content.replace(placeholderRegex, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });

    // Apply rotation if needed
    if (style.rotation && style.rotation !== 0) {
      doc.save();
      doc.rotate(style.rotation, { origin: [x + width / 2, y + height / 2] });
    }

    switch (element.type) {
      case 'text':
        // Draw background if specified
        if (style.backgroundColor && style.backgroundColor !== 'transparent') {
          doc.rect(x, y, width, height).fill(style.backgroundColor);
        }

        // Draw border if specified
        if (style.borderWidth && style.borderWidth > 0) {
          doc.rect(x, y, width, height)
            .lineWidth(style.borderWidth)
            .stroke(style.borderColor || '#000000');
        }

        // Set font
        try {
          if (style.fontWeight === 'bold') {
            doc.font('Helvetica-Bold');
          } else {
            doc.font('Helvetica');
          }
        } catch {
          doc.font('Helvetica');
        }

        // Set font size and color
        doc.fontSize(style.fontSize || 10);
        doc.fillColor(style.color || '#000000');

        // Draw text with alignment
        const textOptions: PDFKit.Mixins.TextOptions = {
          width: width,
          height: height,
          align: (style.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
          ellipsis: true,
          lineBreak: true
        };

        doc.text(content, x + 2, y + 2, textOptions);
        break;

      case 'rectangle':
        // Draw filled rectangle
        if (style.backgroundColor && style.backgroundColor !== 'transparent') {
          if (style.borderRadius && style.borderRadius > 0) {
            doc.roundedRect(x, y, width, height, style.borderRadius * MM_TO_POINTS)
              .fill(style.backgroundColor);
          } else {
            doc.rect(x, y, width, height).fill(style.backgroundColor);
          }
        }

        // Draw border
        if (style.borderWidth && style.borderWidth > 0) {
          if (style.borderRadius && style.borderRadius > 0) {
            doc.roundedRect(x, y, width, height, style.borderRadius * MM_TO_POINTS)
              .lineWidth(style.borderWidth)
              .stroke(style.borderColor || '#000000');
          } else {
            doc.rect(x, y, width, height)
              .lineWidth(style.borderWidth)
              .stroke(style.borderColor || '#000000');
          }
        }
        break;

      case 'line':
        doc.moveTo(x, y)
          .lineTo(x + width, y)
          .lineWidth(style.borderWidth || 1)
          .stroke(style.borderColor || style.color || '#000000');
        break;

      case 'barcode':
        if (content && content.trim()) {
          try {
            const barcodeBuffer = await PrintTemplateController.generateBarcode(
              content,
              width,
              height,
              'barcode'
            );
            doc.image(barcodeBuffer, x, y, {
              width: width,
              height: height,
              fit: [width, height],
              align: 'center',
              valign: 'center'
            });
          } catch (barcodeError) {
            console.error('Barcode generation error:', barcodeError);
            // Fallback: draw placeholder
            doc.rect(x, y, width, height).stroke('#cccccc');
            doc.fontSize(8).fillColor('#999999');
            doc.text(`[${content}]`, x, y + height / 2 - 4, { width, align: 'center' });
          }
        }
        break;

      case 'qrcode':
        if (content && content.trim()) {
          try {
            const qrBuffer = await PrintTemplateController.generateBarcode(
              content,
              width,
              height,
              'qrcode'
            );
            doc.image(qrBuffer, x, y, {
              width: width,
              height: height,
              fit: [width, height],
              align: 'center',
              valign: 'center'
            });
          } catch (qrError) {
            console.error('QR code generation error:', qrError);
            // Fallback: draw placeholder
            doc.rect(x, y, width, height).stroke('#cccccc');
            doc.fontSize(8).fillColor('#999999');
            doc.text('QR', x, y + height / 2 - 4, { width, align: 'center' });
          }
        }
        break;

      case 'image':
        // Image rendering would require image path/buffer
        // For now, draw a placeholder
        doc.rect(x, y, width, height)
          .lineWidth(1)
          .dash(5, { space: 3 })
          .stroke('#cccccc');
        doc.undash();
        doc.fontSize(8);
        doc.fillColor('#666666');
        doc.text('Obrazek', x, y + height / 2 - 4, {
          width: width,
          align: 'center'
        });
        break;
    }

    // Restore rotation
    if (style.rotation && style.rotation !== 0) {
      doc.restore();
    }
  }
}
