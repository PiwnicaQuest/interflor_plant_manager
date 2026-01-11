import { query } from './database';

export interface LoginHistoryEntry {
  id: number;
  userId: number;
  ipAddress: string | null;
  userAgent: string | null;
  source: 'panel' | 'shop';
  success: boolean;
  errorMessage: string | null;
  loginAt: Date;
  // Joined fields
  userEmail?: string;
  userRole?: string;
  customerName?: string;
}

export interface LoginHistoryFilters {
  userId?: number;
  source?: 'panel' | 'shop';
  success?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class LoginHistoryModel {
  /**
   * Log a login attempt
   */
  static async log(data: {
    userId?: number;
    ipAddress?: string;
    userAgent?: string;
    source: 'panel' | 'shop';
    success: boolean;
    errorMessage?: string;
  }): Promise<number> {
    const result = await query<{ id: number }>(
      `INSERT INTO login_history (user_id, ip_address, user_agent, source, success, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        data.userId || null,
        data.ipAddress || null,
        data.userAgent || null,
        data.source,
        data.success,
        data.errorMessage || null
      ]
    );
    return result.rows[0].id;
  }

  /**
   * Get login history with filters and pagination
   */
  static async getAll(filters?: LoginHistoryFilters): Promise<{ entries: LoginHistoryEntry[]; total: number }> {
    let sql = `
      SELECT
        lh.id,
        lh.user_id,
        lh.ip_address,
        lh.user_agent,
        lh.source,
        lh.success,
        lh.error_message,
        lh.login_at,
        u.email as user_email,
        u.role as user_role,
        COALESCE(c.company_name, CONCAT(c.first_name, ' ', c.last_name)) as customer_name
      FROM login_history lh
      LEFT JOIN users u ON lh.user_id = u.id
      LEFT JOIN customers c ON u.id = c.user_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Apply filters
    if (filters?.userId) {
      sql += ` AND lh.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.source) {
      sql += ` AND lh.source = $${paramIndex}`;
      params.push(filters.source);
      paramIndex++;
    }

    if (filters?.success !== undefined) {
      sql += ` AND lh.success = $${paramIndex}`;
      params.push(filters.success);
      paramIndex++;
    }

    if (filters?.startDate) {
      sql += ` AND lh.login_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      sql += ` AND lh.login_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.search) {
      sql += ` AND (u.email ILIKE $${paramIndex} OR c.company_name ILIKE $${paramIndex} OR lh.ip_address ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Get total count
    const countSql = `SELECT COUNT(*) FROM (${sql}) as filtered`;
    const countResult = await query<{ count: string }>(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    // Add sorting and pagination
    sql += ` ORDER BY lh.login_at DESC`;

    if (filters?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
      paramIndex++;
    }

    // Note: database.ts automatically converts snake_case to camelCase
    const result = await query<{
      id: number;
      userId: number;
      ipAddress: string | null;
      userAgent: string | null;
      source: 'panel' | 'shop';
      success: boolean;
      errorMessage: string | null;
      loginAt: Date;
      userEmail: string;
      userRole: string;
      customerName: string | null;
    }>(sql, params);

    // Map directly since database already returns camelCase keys
    const entries: LoginHistoryEntry[] = result.rows.map(row => ({
      id: row.id,
      userId: row.userId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      source: row.source,
      success: row.success,
      errorMessage: row.errorMessage,
      loginAt: row.loginAt,
      userEmail: row.userEmail,
      userRole: row.userRole,
      customerName: row.customerName || undefined
    }));

    return { entries, total };
  }

  /**
   * Get login history for a specific user
   */
  static async getByUserId(userId: number, limit = 50): Promise<LoginHistoryEntry[]> {
    const result = await this.getAll({ userId, limit });
    return result.entries;
  }

  /**
   * Get login statistics
   */
  static async getStats(days = 30): Promise<{
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    uniqueUsers: number;
    shopLogins: number;
    panelLogins: number;
  }> {
    const result = await query<{
      totalLogins: string;
      successfulLogins: string;
      failedLogins: string;
      uniqueUsers: string;
      shopLogins: string;
      panelLogins: string;
    }>(
      `SELECT
        COUNT(*) as total_logins,
        COUNT(*) FILTER (WHERE success = true) as successful_logins,
        COUNT(*) FILTER (WHERE success = false) as failed_logins,
        COUNT(DISTINCT user_id) FILTER (WHERE success = true) as unique_users,
        COUNT(*) FILTER (WHERE source = 'shop') as shop_logins,
        COUNT(*) FILTER (WHERE source = 'panel') as panel_logins
       FROM login_history
       WHERE login_at >= NOW() - INTERVAL '${days} days'`
    );

    const row = result.rows[0];
    return {
      totalLogins: parseInt(row.totalLogins),
      successfulLogins: parseInt(row.successfulLogins),
      failedLogins: parseInt(row.failedLogins),
      uniqueUsers: parseInt(row.uniqueUsers),
      shopLogins: parseInt(row.shopLogins),
      panelLogins: parseInt(row.panelLogins)
    };
  }

  /**
   * Clean old entries (older than specified days)
   */
  static async cleanOldEntries(daysToKeep = 90): Promise<number> {
    const result = await query<{ count: string }>(
      `WITH deleted AS (
        DELETE FROM login_history
        WHERE login_at < NOW() - INTERVAL '${daysToKeep} days'
        RETURNING *
      )
      SELECT COUNT(*) FROM deleted`
    );
    return parseInt(result.rows[0].count);
  }
}
