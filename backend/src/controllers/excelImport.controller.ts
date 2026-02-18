import { Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { ExcelImportService } from '../services/excelImportService';

// Configure multer for Excel/ODS file uploads
const storage = multer.memoryStorage();
export const excelUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const validExtensions = ['.xls', '.xlsx', '.ods'];
    const validMimeTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/octet-stream',
    ];

    const hasValidExtension = validExtensions.some(ext =>
      file.originalname.toLowerCase().endsWith(ext)
    );
    const hasValidMimeType = validMimeTypes.includes(file.mimetype);

    if (hasValidExtension || hasValidMimeType) {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki Excel (.xls, .xlsx) i LibreOffice (.ods) są dozwolone'));
    }
  },
});

export class ExcelImportController {
  /**
   * Import produktów z pliku Excel/ODS (szablon dostaw)
   * POST /inventory/import-excel
   */
  static async importExcel(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Brak pliku' });
      }

      // Odczyt waluty z body (multer fields)
      const currency = req.body.currency === 'PLN' ? 'PLN' : 'EUR';

      console.log(
        'Otrzymano plik:',
        req.file.originalname,
        'rozmiar:',
        req.file.size,
        'waluta:',
        currency
      );

      const result = await ExcelImportService.importProducts(req.file.buffer, currency);

      return res.json({
        message: `Import zakończony. Sukces: ${result.success}, Błędy: ${result.failed}`,
        result,
      });
    } catch (error: any) {
      console.error('Excel import error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas importu' });
    }
  }
}
