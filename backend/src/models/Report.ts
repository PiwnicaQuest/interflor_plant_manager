import { query } from './database';

// Report interfaces
export interface DailySales {
  date: string;
  ordersCount: number;
  totalRevenue: number;
  totalNet: number;
  totalVat: number;
}

export interface SalesReportResult {
  dailySales: DailySales[];
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalNet: number;
    totalVat: number;
    avgDailyRevenue: number;
  };
}

export interface TopProduct {
  productId: number;
  plantName: string;
  quantitySold: number;
  revenue: number;
}

export interface RevenueSummary {
  totalGross: number;
  totalNet: number;
  totalVat: number;
  ordersCount: number;
  avgOrderValue: number;
}

export class ReportModel {
  /**
   * Generates sales report with daily aggregation
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Sales report with daily breakdown and summary
   */
  static async getSalesReport(startDate: string, endDate: string): Promise<any> {
    // Daily sales aggregation
    const dailySalesResult = await query<DailySales>(
      `SELECT
        DATE(i.issue_date) as date,
        COUNT(DISTINCT i.id) as "ordersCount",
        COALESCE(SUM(i.total_gross), 0) as "totalRevenue",
        COALESCE(SUM(i.subtotal_net), 0) as "totalNet",
        COALESCE(SUM(i.total_vat), 0) as "totalVat"
      FROM invoices i
      WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date
      GROUP BY DATE(i.issue_date)
      ORDER BY DATE(i.issue_date) ASC`,
      [startDate, endDate]
    );

    const dailySales = dailySalesResult.rows;

    // Calculate summary
    const totalOrders = dailySales.reduce((sum, day) => sum + Number(day.ordersCount), 0);
    const totalRevenue = dailySales.reduce((sum, day) => sum + Number(day.totalRevenue), 0);
    const totalNet = dailySales.reduce((sum, day) => sum + Number(day.totalNet), 0);
    const totalVat = dailySales.reduce((sum, day) => sum + Number(day.totalVat), 0);

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalGross: totalRevenue,
      totalNet,
      totalVat,
      orderCount: totalOrders,
      averageOrderValue: avgOrderValue,
      dailySales: dailySales.map(day => ({
        date: day.date,
        orderCount: Number(day.ordersCount),
        totalGross: Number(day.totalRevenue),
        totalNet: Number(day.totalNet),
        totalVat: Number(day.totalVat),
      })),
    };
  }

  /**
   * Gets top selling products for a given period
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @param limit - Maximum number of products to return
   * @returns Array of top products sorted by revenue
   */
  static async getTopProducts(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<TopProduct[]> {
    const result = await query<TopProduct>(
      `SELECT
        p.id as "productId",
        p.plant_name as "plantName",
        COALESCE(SUM(ii.quantity), 0) as "quantitySold",
        COALESCE(SUM(ii.total_gross), 0) as revenue
      FROM products p
      INNER JOIN invoice_items ii ON p.id = ii.product_id
      INNER JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date
      GROUP BY p.id, p.plant_name
      ORDER BY revenue DESC
      LIMIT $3`,
      [startDate, endDate, limit]
    );

    return result.rows.map(product => ({
      productId: Number(product.productId),
      plantName: product.plantName,
      quantitySold: Number(product.quantitySold),
      revenue: Number(product.revenue),
    }));
  }

  /**
   * Gets revenue summary for a given period
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Revenue summary with totals and averages
   */
  static async getRevenueSummary(startDate: string, endDate: string): Promise<RevenueSummary> {
    const result = await query<{
      totalGross: number;
      totalNet: number;
      totalVat: number;
      ordersCount: number;
    }>(
      `SELECT
        COALESCE(SUM(i.total_gross), 0) as "totalGross",
        COALESCE(SUM(i.subtotal_net), 0) as "totalNet",
        COALESCE(SUM(i.total_vat), 0) as "totalVat",
        COUNT(i.id) as "ordersCount"
      FROM invoices i
      WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date`,
      [startDate, endDate]
    );

    const data = result.rows[0];
    const totalGross = Number(data.totalGross);
    const totalNet = Number(data.totalNet);
    const totalVat = Number(data.totalVat);
    const ordersCount = Number(data.ordersCount);
    const avgOrderValue = ordersCount > 0 ? totalGross / ordersCount : 0;

    return {
      totalGross,
      totalNet,
      totalVat,
      ordersCount,
      avgOrderValue,
    };
  }
}
