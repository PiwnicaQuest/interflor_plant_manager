import { Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { CSVImportService } from '../services/csvImportService';

// Configure multer for CSV file uploads
const storage = multer.memoryStorage();
export const csvUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki CSV są dozwolone'));
    }
  },
});

export class CSVImportController {
  /**
   * Import produktów z pliku CSV
   * POST /inventory/import-csv
   */
  static async importCSV(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Brak pliku CSV' });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      // Ustawienia cenowe są teraz pobierane z bazy danych przez CSVImportService
      const result = await CSVImportService.importProducts(csvContent);

      return res.json({
        message: `Import zakończony. Sukces: ${result.success}, Błędy: ${result.failed}`,
        result,
      });
    } catch (error: any) {
      console.error('CSV import error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas importu CSV' });
    }
  }

  /**
   * Pobierz przykładowy plik CSV
   * GET /inventory/csv-template
   */
  static async downloadTemplate(_req: AuthRequest, res: Response) {
    try {
      const csvContent = CSVImportService.generateSampleCSV();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="import-template.csv"');
      return res.send(csvContent);
    } catch (error: any) {
      console.error('CSV template download error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas generowania szablonu' });
    }
  }
}
