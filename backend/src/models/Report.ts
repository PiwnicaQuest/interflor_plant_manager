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
  productName: string;
  quantity: number;
  totalRevenue: number;
}

export interface RevenueSummary {
  totalGross: number;
  totalNet: number;
  totalVat: number;
  ordersCount: number;
  avgOrderValue: number;
}

// Employee sales report
export interface EmployeeSales {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  ordersCount: number;
  totalGross: number;
  totalNet: number;
  avgOrderValue: number;
  percentShare: number;
}

export interface EmployeeDailySales {
  date: string;
  userId: number;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalGross: number;
}

// Customer sales report
export interface CustomerSales {
  customerId: number;
  companyName: string;
  firstName: string;
  lastName: string;
  city: string;
  ordersCount: number;
  totalGross: number;
  totalNet: number;
  avgOrderValue: number;
  lastOrderDate: string;
}

// Document type report
export interface DocumentTypeStats {
  documentType: string;
  count: number;
  totalGross: number;
  totalNet: number;
  totalVat: number;
}

// Payment report
export interface PaymentStats {
  status: string;
  count: number;
  totalAmount: number;
}

export interface AgingBucket {
  bucket: string;
  count: number;
  totalAmount: number;
}

export interface PaymentMethodStats {
  method: string;
  count: number;
  totalAmount: number;
}

// Product category report
export interface CategorySales {
  category: string;
  productsCount: number;
  quantitySold: number;
  totalGross: number;
  totalNet: number;
}

export class ReportModel {
  /**
   * Generates sales report with daily aggregation
   * @param orderStatus - 'all' | 'open' | 'closed' | specific status
   */
  static async getSalesReport(startDate: string, endDate: string, orderStatus: string = 'all'): Promise<any> {
    // Build status filter
    let statusFilter = '';
    const openStatuses = ['pending', 'ready_for_pickup'];
    const closedStatuses = ['completed', 'cancelled'];

    if (orderStatus === 'open') {
      statusFilter = `AND o.status IN ('${openStatuses.join("','")}')`;
    } else if (orderStatus === 'closed') {
      statusFilter = `AND o.status IN ('${closedStatuses.join("','")}')`;
    } else if (orderStatus !== 'all') {
      statusFilter = `AND o.status = '${orderStatus}'`;
    }

    const dailySalesResult = await query<DailySales>(
      `SELECT
        date,
        SUM("ordersCount") as "ordersCount",
        SUM("totalRevenue") as "totalRevenue",
        SUM("totalNet") as "totalNet",
        SUM("totalVat") as "totalVat"
      FROM (
        SELECT
          DATE(i.issue_date) as date,
          COUNT(DISTINCT i.id) as "ordersCount",
          COALESCE(SUM(i.total_gross), 0) as "totalRevenue",
          COALESCE(SUM(i.subtotal_net), 0) as "totalNet",
          COALESCE(SUM(i.total_vat), 0) as "totalVat"
        FROM invoices i
        LEFT JOIN orders o ON i.order_id = o.id
        WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date AND i.invoice_type != 'proforma'
        ${statusFilter}
        GROUP BY DATE(i.issue_date)
        UNION ALL
        SELECT
          DATE(r.created_at) as date,
          COUNT(DISTINCT r.id) as "ordersCount",
          COALESCE(SUM(ri.total_gross), 0) as "totalRevenue",
          COALESCE(SUM(ri.total_gross / (1 + ri.vat_rate/100)), 0) as "totalNet",
          COALESCE(SUM(ri.total_gross - ri.total_gross / (1 + ri.vat_rate/100)), 0) as "totalVat"
        FROM receipts r
        INNER JOIN receipt_items ri ON ri.receipt_id = r.id
        LEFT JOIN orders o ON r.order_id = o.id
        WHERE r.created_at >= $1::date AND r.created_at < ($2::date + interval '1 day')
        ${statusFilter}
        GROUP BY DATE(r.created_at)
      ) combined
      GROUP BY date
      ORDER BY date ASC`,
      [startDate, endDate]
    );

    const dailySales = dailySalesResult.rows;
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
   * Gets order statistics grouped by status
   */
  static async getOrderStatusStats(startDate: string, endDate: string): Promise<any> {
    const result = await query<any>(
      `SELECT
        o.status,
        COUNT(DISTINCT o.id) as "ordersCount",
        COALESCE(SUM(o.total_amount), 0) as "totalGross",
        COALESCE(SUM(
          CASE
            WHEN i.id IS NOT NULL THEN i.subtotal_net
            WHEN r.id IS NOT NULL THEN r_totals.total_net
            ELSE o.total_amount / 1.08
          END
        ), 0) as "totalNet"
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id AND i.invoice_type != 'proforma'
      LEFT JOIN receipts r ON r.order_id = o.id AND i.id IS NULL
      LEFT JOIN LATERAL (
        SELECT
          SUM(ri.total_gross / (1 + ri.vat_rate/100)) as total_net
        FROM receipt_items ri
        WHERE ri.receipt_id = r.id
      ) r_totals ON r.id IS NOT NULL
      WHERE o.created_at >= $1::date AND o.created_at < ($2::date + interval '1 day')
      GROUP BY o.status
      ORDER BY "totalGross" DESC`,
      [startDate, endDate]
    );

    const statusLabels: Record<string, string> = {
      pending: 'Oczekujące',
      ready_for_pickup: 'Gotowe do odbióru',
      completed: 'Zrealizowane',
      cancelled: 'Anulowane',
    };

    const stats = result.rows.map((row: any) => ({
      status: row.status,
      label: statusLabels[row.status] || row.status,
      ordersCount: Number(row.ordersCount),
      totalGross: Number(row.totalGross),
      totalNet: Number(row.totalNet),
    }));

    // Calculate totals for open and closed
    const openStatuses = ['pending', 'ready_for_pickup'];
    const closedStatuses = ['completed', 'cancelled'];

    const openStats = stats.filter((s: any) => openStatuses.includes(s.status));
    const closedStats = stats.filter((s: any) => closedStatuses.includes(s.status));

    return {
      byStatus: stats,
      summary: {
        open: {
          ordersCount: openStats.reduce((sum: number, s: any) => sum + s.ordersCount, 0),
          totalGross: openStats.reduce((sum: number, s: any) => sum + s.totalGross, 0),
          totalNet: openStats.reduce((sum: number, s: any) => sum + s.totalNet, 0),
        },
        closed: {
          ordersCount: closedStats.reduce((sum: number, s: any) => sum + s.ordersCount, 0),
          totalGross: closedStats.reduce((sum: number, s: any) => sum + s.totalGross, 0),
          totalNet: closedStats.reduce((sum: number, s: any) => sum + s.totalNet, 0),
        },
        all: {
          ordersCount: stats.reduce((sum: number, s: any) => sum + s.ordersCount, 0),
          totalGross: stats.reduce((sum: number, s: any) => sum + s.totalGross, 0),
          totalNet: stats.reduce((sum: number, s: any) => sum + s.totalNet, 0),
        },
      },
    };
  }

  /**
   * Gets top selling products for a given period
   */
  static async getTopProducts(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<TopProduct[]> {
    const result = await query<any>(
      `SELECT
        "productId",
        "productName",
        SUM(quantity) as quantity,
        SUM("totalRevenue") as "totalRevenue"
      FROM (
        SELECT
          p.id as "productId",
          p.plant_name as "productName",
          COALESCE(SUM(ii.quantity), 0) as quantity,
          COALESCE(SUM(ii.total_gross), 0) as "totalRevenue"
        FROM products p
        INNER JOIN invoice_items ii ON p.id = ii.product_id
        INNER JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date AND i.invoice_type != 'proforma'
        GROUP BY p.id, p.plant_name
        UNION ALL
        SELECT
          p.id as "productId",
          p.plant_name as "productName",
          COALESCE(SUM(ri.quantity), 0) as quantity,
          COALESCE(SUM(ri.total_gross), 0) as "totalRevenue"
        FROM products p
        INNER JOIN receipt_items ri ON p.id = ri.product_id
        INNER JOIN receipts r ON ri.receipt_id = r.id
        WHERE r.created_at >= $1::date AND r.created_at < ($2::date + interval '1 day')
        GROUP BY p.id, p.plant_name
      ) combined
      GROUP BY "productId", "productName"
      ORDER BY "totalRevenue" DESC
      LIMIT $3`,
      [startDate, endDate, limit]
    );

    return result.rows.map(product => ({
      productId: Number(product.productId),
      productName: product.productName,
      quantity: Number(product.quantity),
      totalRevenue: Number(product.totalRevenue),
    }));
  }

  /**
   * Gets revenue summary for a given period
   */
  static async getRevenueSummary(startDate: string, endDate: string): Promise<RevenueSummary> {
    const result = await query<any>(
      `SELECT
        SUM("totalGross") as "totalGross",
        SUM("totalNet") as "totalNet",
        SUM("totalVat") as "totalVat",
        SUM("ordersCount") as "ordersCount"
      FROM (
        SELECT
          COALESCE(SUM(i.total_gross), 0) as "totalGross",
          COALESCE(SUM(i.subtotal_net), 0) as "totalNet",
          COALESCE(SUM(i.total_vat), 0) as "totalVat",
          COUNT(i.id) as "ordersCount"
        FROM invoices i
        WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date AND i.invoice_type != 'proforma'
        UNION ALL
        SELECT
          COALESCE(SUM(ri.total_gross), 0) as "totalGross",
          COALESCE(SUM(ri.total_gross / (1 + ri.vat_rate/100)), 0) as "totalNet",
          COALESCE(SUM(ri.total_gross - ri.total_gross / (1 + ri.vat_rate/100)), 0) as "totalVat",
          COUNT(DISTINCT r.id) as "ordersCount"
        FROM receipts r
        INNER JOIN receipt_items ri ON ri.receipt_id = r.id
        WHERE r.created_at >= $1::date AND r.created_at < ($2::date + interval '1 day')
      ) combined`,
      [startDate, endDate]
    );

    const data = result.rows[0];
    const totalGross = Number(data.totalGross);
    const ordersCount = Number(data.ordersCount);

    return {
      totalGross,
      totalNet: Number(data.totalNet),
      totalVat: Number(data.totalVat),
      ordersCount,
      avgOrderValue: ordersCount > 0 ? totalGross / ordersCount : 0,
    };
  }

  // ============ EMPLOYEE REPORTS ============

  /**
   * Gets sales grouped by employee
   */
  static async getEmployeeSales(startDate: string, endDate: string): Promise<EmployeeSales[]> {
    const result = await query<any>(
      `SELECT
        u.id as "userId",
        COALESCE(u.first_name, '') as "firstName",
        COALESCE(u.last_name, '') as "lastName",
        u.email,
        u.role,
        COUNT(DISTINCT o.id) as "ordersCount",
        COALESCE(SUM(i.total_gross), 0) as "totalGross",
        COALESCE(SUM(i.subtotal_net), 0) as "totalNet"
      FROM users u
      INNER JOIN orders o ON o.created_by_user_id = u.id
      LEFT JOIN invoices i ON i.order_id = o.id AND i.invoice_type != 'proforma'
      WHERE o.created_at >= $1::date AND o.created_at < ($2::date + interval '1 day')
        AND o.status NOT IN ('cancelled')
        AND u.role IN ('admin', 'warehouse', 'pos')
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.role
      ORDER BY "totalGross" DESC`,
      [startDate, endDate]
    );

    const totalGrossAll = result.rows.reduce((sum: number, row: any) => sum + Number(row.totalGross), 0);

    return result.rows.map((row: any) => {
      const totalGross = Number(row.totalGross);
      const ordersCount = Number(row.ordersCount);
      return {
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        role: row.role,
        ordersCount,
        totalGross,
        totalNet: Number(row.totalNet),
        avgOrderValue: ordersCount > 0 ? totalGross / ordersCount : 0,
        percentShare: totalGrossAll > 0 ? (totalGross / totalGrossAll) * 100 : 0,
      };
    });
  }

  /**
   * Gets daily sales breakdown by employee
   */
  static async getEmployeeDailySales(startDate: string, endDate: string): Promise<EmployeeDailySales[]> {
    const result = await query<any>(
      `SELECT
        DATE(o.created_at) as date,
        u.id as "userId",
        COALESCE(u.first_name, '') as "firstName",
        COALESCE(u.last_name, '') as "lastName",
        COUNT(DISTINCT o.id) as "ordersCount",
        COALESCE(SUM(i.total_gross), 0) as "totalGross"
      FROM users u
      INNER JOIN orders o ON o.created_by_user_id = u.id
      LEFT JOIN invoices i ON i.order_id = o.id AND i.invoice_type != 'proforma'
      WHERE o.created_at >= $1::date AND o.created_at < ($2::date + interval '1 day')
        AND o.status NOT IN ('cancelled')
        AND u.role IN ('admin', 'warehouse', 'pos')
      GROUP BY DATE(o.created_at), u.id, u.first_name, u.last_name
      ORDER BY date ASC, "totalGross" DESC`,
      [startDate, endDate]
    );

    return result.rows.map((row: any) => ({
      date: row.date,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      ordersCount: Number(row.ordersCount),
      totalGross: Number(row.totalGross),
    }));
  }

  // ============ CUSTOMER REPORTS ============

  /**
   * Gets top customers by revenue
   */
  static async getTopCustomers(startDate: string, endDate: string, limit: number = 20): Promise<CustomerSales[]> {
    const result = await query<any>(
      `SELECT
        c.id as "customerId",
        COALESCE(c.company_name, '') as "companyName",
        COALESCE(c.first_name, '') as "firstName",
        COALESCE(c.last_name, '') as "lastName",
        COALESCE(c.city, '') as city,
        COUNT(DISTINCT i.id) as "ordersCount",
        COALESCE(SUM(i.total_gross), 0) as "totalGross",
        COALESCE(SUM(i.subtotal_net), 0) as "totalNet",
        MAX(i.issue_date) as "lastOrderDate"
      FROM customers c
      INNER JOIN invoices i ON i.customer_id = c.id
      WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date
        AND i.invoice_type != 'proforma'
      GROUP BY c.id, c.company_name, c.first_name, c.last_name, c.city
      ORDER BY "totalGross" DESC
      LIMIT $3`,
      [startDate, endDate, limit]
    );

    return result.rows.map((row: any) => {
      const totalGross = Number(row.totalGross);
      const ordersCount = Number(row.ordersCount);
      return {
        customerId: row.customerId,
        companyName: row.companyName,
        firstName: row.firstName,
        lastName: row.lastName,
        city: row.city,
        ordersCount,
        totalGross,
        totalNet: Number(row.totalNet),
        avgOrderValue: ordersCount > 0 ? totalGross / ordersCount : 0,
        lastOrderDate: row.lastOrderDate,
      };
    });
  }

  /**
   * Gets new vs returning customers stats
   */
  static async getCustomerStats(startDate: string, endDate: string): Promise<any> {
    // New customers (first order in this period)
    const newCustomersResult = await query<any>(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM customers c
       INNER JOIN invoices i ON i.customer_id = c.id
       WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date
         AND i.invoice_type != 'proforma'
         AND NOT EXISTS (
           SELECT 1 FROM invoices i2
           WHERE i2.customer_id = c.id
             AND i2.issue_date < $1::date
             AND i2.invoice_type != 'proforma'
         )`,
      [startDate, endDate]
    );

    // Returning customers
    const returningCustomersResult = await query<any>(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM customers c
       INNER JOIN invoices i ON i.customer_id = c.id
       WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date
         AND i.invoice_type != 'proforma'
         AND EXISTS (
           SELECT 1 FROM invoices i2
           WHERE i2.customer_id = c.id
             AND i2.issue_date < $1::date
             AND i2.invoice_type != 'proforma'
         )`,
      [startDate, endDate]
    );

    // Total unique customers
    const totalCustomersResult = await query<any>(
      `SELECT COUNT(DISTINCT customer_id) as count
       FROM invoices
       WHERE issue_date >= $1::date AND issue_date <= $2::date
         AND invoice_type != 'proforma'`,
      [startDate, endDate]
    );

    return {
      newCustomers: Number(newCustomersResult.rows[0]?.count || 0),
      returningCustomers: Number(returningCustomersResult.rows[0]?.count || 0),
      totalCustomers: Number(totalCustomersResult.rows[0]?.count || 0),
    };
  }

  // ============ DOCUMENT TYPE REPORTS ============

  /**
   * Gets stats grouped by document type
   */
  static async getDocumentTypeStats(startDate: string, endDate: string): Promise<DocumentTypeStats[]> {
    // Invoices
    const invoicesResult = await query<any>(
      `SELECT
        'invoice' as "documentType",
        COUNT(*) as count,
        COALESCE(SUM(total_gross), 0) as "totalGross",
        COALESCE(SUM(subtotal_net), 0) as "totalNet",
        0 as "totalVat"
      FROM invoices
      WHERE issue_date >= $1::date AND issue_date <= $2::date
        AND invoice_type = 'invoice'`,
      [startDate, endDate]
    );

    // Proformas
    const proformasResult = await query<any>(
      `SELECT
        'proforma' as "documentType",
        COUNT(*) as count,
        COALESCE(SUM(total_gross), 0) as "totalGross",
        COALESCE(SUM(subtotal_net), 0) as "totalNet",
        0 as "totalVat"
      FROM invoices
      WHERE issue_date >= $1::date AND issue_date <= $2::date
        AND invoice_type = 'proforma'`,
      [startDate, endDate]
    );

    // Receipts
    const receiptsResult = await query<any>(
      `SELECT
        'receipt' as "documentType",
        COUNT(DISTINCT r.id) as count,
        COALESCE(SUM(ri.total_gross), 0) as "totalGross",
        COALESCE(SUM(ri.total_gross / (1 + ri.vat_rate/100)), 0) as "totalNet",
        COALESCE(SUM(ri.total_gross - ri.total_gross / (1 + ri.vat_rate/100)), 0) as "totalVat"
      FROM receipts r
      INNER JOIN receipt_items ri ON ri.receipt_id = r.id
      WHERE r.created_at >= $1::date AND r.created_at < ($2::date + interval '1 day')`,
      [startDate, endDate]
    );

    // Invoice corrections
    const correctionsResult = await query<any>(
      `SELECT
        'correction' as "documentType",
        COUNT(*) as count,
        COALESCE(SUM(difference_gross), 0) as "totalGross",
        COALESCE(SUM(difference_net), 0) as "totalNet",
        COALESCE(SUM(difference_vat), 0) as "totalVat"
      FROM invoice_corrections
      WHERE issue_date >= $1::date AND issue_date <= $2::date`,
      [startDate, endDate]
    );

    const results: DocumentTypeStats[] = [];

    for (const result of [invoicesResult, proformasResult, receiptsResult, correctionsResult]) {
      if (result.rows[0]) {
        results.push({
          documentType: result.rows[0].documentType,
          count: Number(result.rows[0].count),
          totalGross: Number(result.rows[0].totalGross),
          totalNet: Number(result.rows[0].totalNet),
          totalVat: Number(result.rows[0].totalVat),
        });
      }
    }

    return results;
  }

  /**
   * Gets daily breakdown by document type
   */
  static async getDocumentTypeDailyStats(startDate: string, endDate: string): Promise<any[]> {
    const result = await query<any>(
      `SELECT
        date,
        SUM(CASE WHEN doc_type = 'invoice' THEN count ELSE 0 END) as invoices,
        SUM(CASE WHEN doc_type = 'invoice' THEN total ELSE 0 END) as "invoicesTotal",
        SUM(CASE WHEN doc_type = 'proforma' THEN count ELSE 0 END) as proformas,
        SUM(CASE WHEN doc_type = 'proforma' THEN total ELSE 0 END) as "proformasTotal",
        SUM(CASE WHEN doc_type = 'receipt' THEN count ELSE 0 END) as receipts,
        SUM(CASE WHEN doc_type = 'receipt' THEN total ELSE 0 END) as "receiptsTotal"
      FROM (
        SELECT DATE(issue_date) as date, invoice_type::text as doc_type, COUNT(*) as count, SUM(total_gross) as total
        FROM invoices
        WHERE issue_date >= $1::date AND issue_date <= $2::date
        GROUP BY DATE(issue_date), invoice_type
        UNION ALL
        SELECT DATE(created_at) as date, 'receipt'::text as doc_type, COUNT(*) as count, SUM(total_amount) as total
        FROM receipts
        WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
        GROUP BY DATE(created_at)
      ) combined
      GROUP BY date
      ORDER BY date ASC`,
      [startDate, endDate]
    );

    return result.rows.map((row: any) => ({
      date: row.date,
      invoices: Number(row.invoices || 0),
      invoicesTotal: Number(row.invoicesTotal || 0),
      proformas: Number(row.proformas || 0),
      proformasTotal: Number(row.proformasTotal || 0),
      receipts: Number(row.receipts || 0),
      receiptsTotal: Number(row.receiptsTotal || 0),
    }));
  }

  // ============ PAYMENT REPORTS ============

  /**
   * Gets payment status breakdown
   */
  static async getPaymentStats(startDate: string, endDate: string): Promise<PaymentStats[]> {
    const result = await query<any>(
      `SELECT
        payment_status as status,
        COUNT(*) as count,
        COALESCE(SUM(total_gross), 0) as "totalAmount"
      FROM invoices
      WHERE issue_date >= $1::date AND issue_date <= $2::date
        AND invoice_type = 'invoice'
      GROUP BY payment_status
      ORDER BY "totalAmount" DESC`,
      [startDate, endDate]
    );

    return result.rows.map((row: any) => ({
      status: row.status,
      count: Number(row.count),
      totalAmount: Number(row.totalAmount),
    }));
  }

  /**
   * Gets aging of receivables (unpaid invoices)
   */
  static async getAgingReport(): Promise<AgingBucket[]> {
    const result = await query<any>(
      `SELECT bucket, count, "totalAmount" FROM (
        SELECT
          CASE
            WHEN payment_deadline >= CURRENT_DATE THEN 'current'
            WHEN CURRENT_DATE - payment_deadline <= 30 THEN '1-30'
            WHEN CURRENT_DATE - payment_deadline <= 60 THEN '31-60'
            WHEN CURRENT_DATE - payment_deadline <= 90 THEN '61-90'
            ELSE '90+'
          END as bucket,
          CASE
            WHEN payment_deadline >= CURRENT_DATE THEN 1
            WHEN CURRENT_DATE - payment_deadline <= 30 THEN 2
            WHEN CURRENT_DATE - payment_deadline <= 60 THEN 3
            WHEN CURRENT_DATE - payment_deadline <= 90 THEN 4
            ELSE 5
          END as sort_order,
          COUNT(*) as count,
          COALESCE(SUM(total_gross - paid_amount), 0) as "totalAmount"
        FROM invoices
        WHERE payment_status != 'paid'
          AND invoice_type = 'invoice'
          AND payment_deadline IS NOT NULL
        GROUP BY 1, 2
      ) sub
      ORDER BY sort_order`,
      []
    );

    return result.rows.map((row: any) => ({
      bucket: row.bucket,
      count: Number(row.count),
      totalAmount: Number(row.totalAmount),
    }));
  }

  /**
   * Gets payment method breakdown
   */
  static async getPaymentMethodStats(startDate: string, endDate: string): Promise<PaymentMethodStats[]> {
    const result = await query<any>(
      `SELECT
        COALESCE(payment_method::text, 'nieznana') as method,
        COUNT(*) as count,
        COALESCE(SUM(total_gross), 0) as "totalAmount"
      FROM invoices
      WHERE issue_date >= $1::date AND issue_date <= $2::date
        AND invoice_type = 'invoice'
      GROUP BY payment_method
      ORDER BY "totalAmount" DESC`,
      [startDate, endDate]
    );

    return result.rows.map((row: any) => ({
      method: row.method,
      count: Number(row.count),
      totalAmount: Number(row.totalAmount),
    }));
  }

  /**
   * Gets overdue invoices
   */
  static async getOverdueInvoices(limit: number = 50): Promise<any[]> {
    const result = await query<any>(
      `SELECT
        i.id,
        i.invoice_number as "invoiceNumber",
        i.issue_date as "issueDate",
        i.payment_deadline as "paymentDeadline",
        i.total_gross as "totalGross",
        i.paid_amount as "paidAmount",
        (i.total_gross - i.paid_amount) as "amountDue",
        CURRENT_DATE - i.payment_deadline as "daysOverdue",
        c.company_name as "customerName",
        c.id as "customerId"
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.payment_status != 'paid'
        AND i.invoice_type = 'invoice'
        AND i.payment_deadline < CURRENT_DATE
      ORDER BY "daysOverdue" DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      issueDate: row.issueDate,
      paymentDeadline: row.paymentDeadline,
      totalGross: Number(row.totalGross),
      paidAmount: Number(row.paidAmount),
      amountDue: Number(row.amountDue),
      daysOverdue: Number(row.daysOverdue),
      customerName: row.customerName,
      customerId: row.customerId,
    }));
  }

  // ============ PRODUCT CATEGORY REPORTS ============

  /**
   * Gets sales by pot size
   */
  static async getSalesByPotSize(startDate: string, endDate: string): Promise<CategorySales[]> {
    const result = await query<any>(
      `SELECT
        COALESCE(p.pot_size, 'Nieznany') as category,
        COUNT(DISTINCT p.id) as "productsCount",
        COALESCE(SUM(ii.quantity), 0) as "quantitySold",
        COALESCE(SUM(ii.total_gross), 0) as "totalGross",
        COALESCE(SUM(ii.total_net), 0) as "totalNet"
      FROM products p
      INNER JOIN invoice_items ii ON p.id = ii.product_id
      INNER JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.issue_date >= $1::date AND i.issue_date <= $2::date
        AND i.invoice_type != 'proforma'
      GROUP BY p.pot_size
      ORDER BY "totalGross" DESC`,
      [startDate, endDate]
    );

    return result.rows.map((row: any) => ({
      category: row.category,
      productsCount: Number(row.productsCount),
      quantitySold: Number(row.quantitySold),
      totalGross: Number(row.totalGross),
      totalNet: Number(row.totalNet),
    }));
  }

  /**
   * Gets sales trends by month
   */
  static async getMonthlySalesTrend(months: number = 12): Promise<any[]> {
    const result = await query<any>(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', issue_date), 'YYYY-MM') as month,
        COUNT(*) as "ordersCount",
        COALESCE(SUM(total_gross), 0) as "totalGross",
        COALESCE(SUM(subtotal_net), 0) as "totalNet"
      FROM invoices
      WHERE issue_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '${months - 1} months'
        AND issue_date <= CURRENT_DATE
        AND invoice_type != 'proforma'
      GROUP BY DATE_TRUNC('month', issue_date)
      ORDER BY month ASC`,
      []
    );

    return result.rows.map((row: any) => ({
      month: row.month,
      ordersCount: Number(row.ordersCount),
      totalGross: Number(row.totalGross),
      totalNet: Number(row.totalNet),
    }));
  }

  // ============ KPI DASHBOARD ============

  /**
   * Gets KPI comparison (current vs previous period)
   */
  static async getKPIComparison(startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate previous period
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff);

    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];

    // Current period stats
    const currentResult = await query<any>(
      `SELECT
        COUNT(*) as "ordersCount",
        COALESCE(SUM(total_gross), 0) as "totalGross",
        COUNT(DISTINCT customer_id) as "customersCount"
      FROM invoices
      WHERE issue_date >= $1::date AND issue_date <= $2::date
        AND invoice_type != 'proforma'`,
      [startDate, endDate]
    );

    // Previous period stats
    const prevResult = await query<any>(
      `SELECT
        COUNT(*) as "ordersCount",
        COALESCE(SUM(total_gross), 0) as "totalGross",
        COUNT(DISTINCT customer_id) as "customersCount"
      FROM invoices
      WHERE issue_date >= $1::date AND issue_date <= $2::date
        AND invoice_type != 'proforma'`,
      [prevStartStr, prevEndStr]
    );

    const current = currentResult.rows[0];
    const prev = prevResult.rows[0];

    const calcChange = (curr: number, previous: number): number => {
      if (previous === 0) return curr > 0 ? 100 : 0;
      return ((curr - previous) / previous) * 100;
    };

    return {
      current: {
        ordersCount: Number(current.ordersCount),
        totalGross: Number(current.totalGross),
        customersCount: Number(current.customersCount),
        avgOrderValue: Number(current.ordersCount) > 0
          ? Number(current.totalGross) / Number(current.ordersCount)
          : 0,
      },
      previous: {
        ordersCount: Number(prev.ordersCount),
        totalGross: Number(prev.totalGross),
        customersCount: Number(prev.customersCount),
        avgOrderValue: Number(prev.ordersCount) > 0
          ? Number(prev.totalGross) / Number(prev.ordersCount)
          : 0,
      },
      changes: {
        ordersCount: calcChange(Number(current.ordersCount), Number(prev.ordersCount)),
        totalGross: calcChange(Number(current.totalGross), Number(prev.totalGross)),
        customersCount: calcChange(Number(current.customersCount), Number(prev.customersCount)),
      },
      periodDays: daysDiff,
      previousPeriod: {
        start: prevStartStr,
        end: prevEndStr,
      },
    };
  }
}
