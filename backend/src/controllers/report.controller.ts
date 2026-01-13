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
    if (!startDate || !endDate) {
      return { valid: false, error: 'Daty startDate i endDate są wymagane' };
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return { valid: false, error: 'Nieprawidłowy format daty. Użyj YYYY-MM-DD' };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { valid: false, error: 'Nieprawidłowe daty' };
    }

    if (start > end) {
      return { valid: false, error: 'Data początkowa musi być wcześniejsza niż data końcowa' };
    }

    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      return { valid: false, error: 'Zakres dat nie może przekraczać 1 roku' };
    }

    return { valid: true };
  }

  // ============ SALES REPORTS ============

  /**
   * GET /reports/sales
   */
  static async getSalesReport(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, orderStatus } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const validStatuses = ['all', 'open', 'closed', 'pending', 'in_progress', 'ready_for_pickup', 'completed', 'cancelled'];
      const status = orderStatus && validStatuses.includes(orderStatus as string) ? orderStatus as string : 'all';

      const report = await ReportModel.getSalesReport(startDate as string, endDate as string, status);
      return res.json({ startDate, endDate, orderStatus: status, ...report });
    } catch (error) {
      console.error('Get sales report error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu sprzedaży' });
    }
  }

  /**
   * GET /reports/orders/status-stats
   */
  static async getOrderStatusStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const stats = await ReportModel.getOrderStatusStats(startDate as string, endDate as string);
      return res.json({ startDate, endDate, ...stats });
    } catch (error) {
      console.error('Get order status stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas pobierania statystyk zamówień' });
    }
  }

  /**
   * GET /reports/top-products
   */
  static async getTopProducts(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, limit } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      let productLimit = 10;
      if (limit) {
        productLimit = parseInt(limit as string);
        if (isNaN(productLimit) || productLimit < 1 || productLimit > 100) {
          return res.status(400).json({ error: 'Limit musi być liczbą z zakresu 1-100' });
        }
      }

      const products = await ReportModel.getTopProducts(startDate as string, endDate as string, productLimit);
      return res.json({ startDate, endDate, limit: productLimit, products });
    } catch (error) {
      console.error('Get top products error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu produktów' });
    }
  }

  /**
   * GET /reports/revenue
   */
  static async getRevenueSummary(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const summary = await ReportModel.getRevenueSummary(startDate as string, endDate as string);
      return res.json({ startDate, endDate, ...summary });
    } catch (error) {
      console.error('Get revenue summary error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania podsumowania przychodów' });
    }
  }

  // ============ EMPLOYEE REPORTS ============

  /**
   * GET /reports/employees
   */
  static async getEmployeeSales(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const employees = await ReportModel.getEmployeeSales(startDate as string, endDate as string);
      return res.json({ startDate, endDate, employees });
    } catch (error) {
      console.error('Get employee sales error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu pracowników' });
    }
  }

  /**
   * GET /reports/employees/daily
   */
  static async getEmployeeDailySales(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const dailySales = await ReportModel.getEmployeeDailySales(startDate as string, endDate as string);
      return res.json({ startDate, endDate, dailySales });
    } catch (error) {
      console.error('Get employee daily sales error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania dziennego raportu pracowników' });
    }
  }

  // ============ CUSTOMER REPORTS ============

  /**
   * GET /reports/customers
   */
  static async getTopCustomers(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, limit } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      let customerLimit = 20;
      if (limit) {
        customerLimit = parseInt(limit as string);
        if (isNaN(customerLimit) || customerLimit < 1 || customerLimit > 100) {
          return res.status(400).json({ error: 'Limit musi być liczbą z zakresu 1-100' });
        }
      }

      const customers = await ReportModel.getTopCustomers(startDate as string, endDate as string, customerLimit);
      return res.json({ startDate, endDate, limit: customerLimit, customers });
    } catch (error) {
      console.error('Get top customers error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu klientów' });
    }
  }

  /**
   * GET /reports/customers/stats
   */
  static async getCustomerStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const stats = await ReportModel.getCustomerStats(startDate as string, endDate as string);
      return res.json({ startDate, endDate, ...stats });
    } catch (error) {
      console.error('Get customer stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania statystyk klientów' });
    }
  }

  // ============ DOCUMENT TYPE REPORTS ============

  /**
   * GET /reports/documents
   */
  static async getDocumentTypeStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const stats = await ReportModel.getDocumentTypeStats(startDate as string, endDate as string);
      return res.json({ startDate, endDate, documents: stats });
    } catch (error) {
      console.error('Get document type stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu dokumentów' });
    }
  }

  /**
   * GET /reports/documents/daily
   */
  static async getDocumentTypeDailyStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const dailyStats = await ReportModel.getDocumentTypeDailyStats(startDate as string, endDate as string);
      return res.json({ startDate, endDate, dailyStats });
    } catch (error) {
      console.error('Get document type daily stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania dziennego raportu dokumentów' });
    }
  }

  // ============ PAYMENT REPORTS ============

  /**
   * GET /reports/payments
   */
  static async getPaymentStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const stats = await ReportModel.getPaymentStats(startDate as string, endDate as string);
      return res.json({ startDate, endDate, payments: stats });
    } catch (error) {
      console.error('Get payment stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu płatności' });
    }
  }

  /**
   * GET /reports/payments/aging
   */
  static async getAgingReport(req: AuthRequest, res: Response) {
    try {
      const aging = await ReportModel.getAgingReport();
      return res.json({ aging });
    } catch (error) {
      console.error('Get aging report error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu wiekowania' });
    }
  }

  /**
   * GET /reports/payments/methods
   */
  static async getPaymentMethodStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const methods = await ReportModel.getPaymentMethodStats(startDate as string, endDate as string);
      return res.json({ startDate, endDate, methods });
    } catch (error) {
      console.error('Get payment method stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu metod płatności' });
    }
  }

  /**
   * GET /reports/payments/overdue
   */
  static async getOverdueInvoices(req: AuthRequest, res: Response) {
    try {
      const { limit } = req.query;
      let invoiceLimit = 50;
      if (limit) {
        invoiceLimit = parseInt(limit as string);
        if (isNaN(invoiceLimit) || invoiceLimit < 1 || invoiceLimit > 200) {
          return res.status(400).json({ error: 'Limit musi być liczbą z zakresu 1-200' });
        }
      }

      const invoices = await ReportModel.getOverdueInvoices(invoiceLimit);
      return res.json({ invoices });
    } catch (error) {
      console.error('Get overdue invoices error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu przeterminowanych faktur' });
    }
  }

  // ============ PRODUCT CATEGORY REPORTS ============

  /**
   * GET /reports/products/by-pot-size
   */
  static async getSalesByPotSize(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const categories = await ReportModel.getSalesByPotSize(startDate as string, endDate as string);
      return res.json({ startDate, endDate, categories });
    } catch (error) {
      console.error('Get sales by pot size error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania raportu kategorii' });
    }
  }

  /**
   * GET /reports/trends/monthly
   */
  static async getMonthlySalesTrend(req: AuthRequest, res: Response) {
    try {
      const { months } = req.query;
      let monthsCount = 12;
      if (months) {
        monthsCount = parseInt(months as string);
        if (isNaN(monthsCount) || monthsCount < 1 || monthsCount > 24) {
          return res.status(400).json({ error: 'Liczba miesięcy musi być z zakresu 1-24' });
        }
      }

      const trend = await ReportModel.getMonthlySalesTrend(monthsCount);
      return res.json({ months: monthsCount, trend });
    } catch (error) {
      console.error('Get monthly sales trend error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania trendu sprzedaży' });
    }
  }

  // ============ KPI DASHBOARD ============

  /**
   * GET /reports/kpi
   */
  static async getKPIComparison(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const validation = ReportController.validateDateRange(startDate as string, endDate as string);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const kpi = await ReportModel.getKPIComparison(startDate as string, endDate as string);
      return res.json({ startDate, endDate, ...kpi });
    } catch (error) {
      console.error('Get KPI comparison error:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas generowania KPI' });
    }
  }
}
