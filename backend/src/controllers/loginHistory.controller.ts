import { Request, Response } from 'express';
import { LoginHistoryModel } from '../models/LoginHistory';

export class LoginHistoryController {
  /**
   * Get login history with filters and pagination
   */
  static async getAll(req: Request, res: Response) {
    try {
      const {
        userId,
        source,
        success,
        startDate,
        endDate,
        search,
        limit = '50',
        offset = '0'
      } = req.query;

      const filters = {
        userId: userId ? parseInt(userId as string) : undefined,
        source: source as 'panel' | 'shop' | undefined,
        success: success !== undefined ? success === 'true' : undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        search: search as string | undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const result = await LoginHistoryModel.getAll(filters);

      return res.json({
        entries: result.entries,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      });
    } catch (error) {
      console.error('Get login history error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Get login history for a specific user
   */
  static async getByUserId(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { limit = '50' } = req.query;

      const entries = await LoginHistoryModel.getByUserId(
        parseInt(userId),
        parseInt(limit as string)
      );

      return res.json({ entries });
    } catch (error) {
      console.error('Get user login history error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Get login statistics
   */
  static async getStats(req: Request, res: Response) {
    try {
      const { days = '30' } = req.query;
      const stats = await LoginHistoryModel.getStats(parseInt(days as string));
      return res.json(stats);
    } catch (error) {
      console.error('Get login stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Export login history to CSV
   */
  static async exportCsv(req: Request, res: Response) {
    try {
      const { startDate, endDate, source } = req.query;

      const result = await LoginHistoryModel.getAll({
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        source: source as 'panel' | 'shop' | undefined,
        limit: 10000 // Max export limit
      });

      // Build CSV
      const headers = ['Data', 'Email', 'Rola', 'Kontrahent', 'Źródło', 'IP', 'Status', 'Błąd'];
      const rows = result.entries.map(entry => [
        new Date(entry.loginAt).toLocaleString('pl-PL'),
        entry.userEmail || '-',
        entry.userRole || '-',
        entry.customerName || '-',
        entry.source === 'shop' ? 'Sklep' : 'Panel',
        entry.ipAddress || '-',
        entry.success ? 'Sukces' : 'Błąd',
        entry.errorMessage || '-'
      ]);

      const csv = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
      ].join('\n');

      // Add BOM for Excel compatibility
      const bom = '\uFEFF';

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=historia-logowan-${new Date().toISOString().split('T')[0]}.csv`);

      return res.send(bom + csv);
    } catch (error) {
      console.error('Export login history error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }
}
