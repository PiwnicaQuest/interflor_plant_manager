import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ReportModel } from '../models/Report';

export class ReportController {
  /**
   * Validates date range and ensures it doesn't exceed 1 year
   */
  private static validateDateRange(
    startDate: string,
    endDate: string
  ): { valid: boolean; error?: string } {
    // Check if dates are provided
    if (!startDate || !endDate) {
      return { valid: false, error: 'Daty startDate i endDate są wymagane' };
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return { valid: false, error: 'Nieprawidłowy format daty. Użyj YYYY-MM-DD' };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { valid: false, error: 'Nieprawidłowe daty' };
    }

    // Check if startDate <= endDate
    if (start > end) {
      return { valid: false, error: 'Data początkowa musi być wcześniejsza niż data końcowa' };
    }

    // Check if range is not more than 1 year (365 days)
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      return { valid: false, error: 'Zakres dat nie może przekraczać 1 roku' };
    }

    return { valid: true };
  }

  /**
   * GET /reports/sales
   * Returns sales report with daily breakdown
   * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
   */
  static async getSalesReport(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      // Validate dates
      const validation = ReportController.validateDateRange(
        startDate as string,
        endDate as string
      );

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const report = await ReportModel.getSalesReport(
        startDate as string,
        endDate as string
      );

      return res.json({
        startDate,
        endDate,
        ...report,
      });
    } catch (error) {
      console.error('Get sales report error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu sprzedaży' });
    }
  }

  /**
   * GET /reports/top-products
   * Returns top selling products
   * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), limit (default: 10)
   */
  static async getTopProducts(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, limit } = req.query;

      // Validate dates
      const validation = ReportController.validateDateRange(
        startDate as string,
        endDate as string
      );

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Parse and validate limit
      let productLimit = 10;
      if (limit) {
        productLimit = parseInt(limit as string);
        if (isNaN(productLimit) || productLimit < 1 || productLimit > 100) {
          return res.status(400).json({ error: 'Limit musi być liczbą z zakresu 1-100' });
        }
      }

      const products = await ReportModel.getTopProducts(
        startDate as string,
        endDate as string,
        productLimit
      );

      return res.json({
        startDate,
        endDate,
        limit: productLimit,
        products,
      });
    } catch (error) {
      console.error('Get top products error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu produktów' });
    }
  }

  /**
   * GET /reports/revenue
   * Returns revenue summary
   * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
   */
  static async getRevenueSummary(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      // Validate dates
      const validation = ReportController.validateDateRange(
        startDate as string,
        endDate as string
      );

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const summary = await ReportModel.getRevenueSummary(
        startDate as string,
        endDate as string
      );

      return res.json({
        startDate,
        endDate,
        ...summary,
      });
    } catch (error) {
      console.error('Get revenue summary error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania podsumowania przychodów' });
    }
  }
}
