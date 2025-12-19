import { query } from './database';
import { InventoryMovement, MovementType } from '../types';

export class InventoryMovementModel {
  /**
   * Get all inventory movements with optional filters and pagination
   */
  static async getAll(filters?: {
    productId?: number;
    userId?: number;
    type?: MovementType;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ movements: InventoryMovement[]; total: number }> {
    let sql = `
      SELECT
        im.*,
        p.plant_name,
        p.barcode,
        u.email as user_email
      FROM inventory_movements im
      LEFT JOIN products p ON im.product_id = p.id
      LEFT JOIN users u ON im.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Apply filters
    if (filters?.productId) {
      sql += ` AND im.product_id = $${paramIndex}`;
      params.push(filters.productId);
      paramIndex++;
    }

    if (filters?.userId) {
      sql += ` AND im.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.type) {
      sql += ` AND im.movement_type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }

    if (filters?.startDate) {
      sql += ` AND im.created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      sql += ` AND im.created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    // Get total count before applying limit/offset
    const countSql = `SELECT COUNT(*) FROM (${sql}) as filtered_movements`;
    const countResult = await query<{ count: string }>(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    // Add sorting and pagination
    sql += ' ORDER BY im.created_at DESC';

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

    const result = await query<InventoryMovement>(sql, params);
    return { movements: result.rows, total };
  }

  /**
   * Get movements for a specific product
   */
  static async getByProductId(productId: number, limit = 50): Promise<InventoryMovement[]> {
    const result = await query<InventoryMovement>(
      `SELECT
        im.*,
        p.plant_name,
        p.barcode,
        u.email as user_email
       FROM inventory_movements im
       LEFT JOIN products p ON im.product_id = p.id
       LEFT JOIN users u ON im.user_id = u.id
       WHERE im.product_id = $1
       ORDER BY im.created_at DESC
       LIMIT $2`,
      [productId, limit]
    );
    return result.rows;
  }

  /**
   * Get movements by user
   */
  static async getByUserId(userId: number): Promise<InventoryMovement[]> {
    const result = await query<InventoryMovement>(
      `SELECT
        im.*,
        p.plant_name,
        p.barcode,
        u.email as user_email
       FROM inventory_movements im
       LEFT JOIN products p ON im.product_id = p.id
       LEFT JOIN users u ON im.user_id = u.id
       WHERE im.user_id = $1
       ORDER BY im.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Get movements by type
   */
  static async getByType(type: MovementType): Promise<InventoryMovement[]> {
    const result = await query<InventoryMovement>(
      `SELECT
        im.*,
        p.plant_name,
        p.barcode,
        u.email as user_email
       FROM inventory_movements im
       LEFT JOIN products p ON im.product_id = p.id
       LEFT JOIN users u ON im.user_id = u.id
       WHERE im.movement_type = $1
       ORDER BY im.created_at DESC`,
      [type]
    );
    return result.rows;
  }

  /**
   * Get movements within a date range
   */
  static async getByDateRange(startDate: string, endDate: string): Promise<InventoryMovement[]> {
    const result = await query<InventoryMovement>(
      `SELECT
        im.*,
        p.plant_name,
        p.barcode,
        u.email as user_email
       FROM inventory_movements im
       LEFT JOIN products p ON im.product_id = p.id
       LEFT JOIN users u ON im.user_id = u.id
       WHERE im.created_at >= $1 AND im.created_at <= $2
       ORDER BY im.created_at DESC`,
      [startDate, endDate]
    );
    return result.rows;
  }

  /**
   * Get statistics for movements
   */
  static async getStatistics(filters?: {
    startDate?: string;
    endDate?: string;
    productId?: number;
  }): Promise<{
    totalMovements: number;
    totalUnitsIn: number;
    totalUnitsOut: number;
    totalPalletsIn: number;
    totalPalletsOut: number;
    byType: Array<{ movementType: string; count: number; totalUnits: number }>;
  }> {
    let sql = `
      SELECT
        COUNT(*) as total_movements,
        SUM(CASE WHEN delta_units > 0 THEN delta_units ELSE 0 END) as total_units_in,
        SUM(CASE WHEN delta_units < 0 THEN ABS(delta_units) ELSE 0 END) as total_units_out,
        SUM(CASE WHEN delta_pallets > 0 THEN delta_pallets ELSE 0 END) as total_pallets_in,
        SUM(CASE WHEN delta_pallets < 0 THEN ABS(delta_pallets) ELSE 0 END) as total_pallets_out
      FROM inventory_movements
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      sql += ` AND created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      sql += ` AND created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.productId) {
      sql += ` AND product_id = $${paramIndex}`;
      params.push(filters.productId);
      paramIndex++;
    }

    const result = await query<any>(sql, params);
    const stats = result.rows[0];

    // Get breakdown by type
    let typeSql = `
      SELECT
        movement_type,
        COUNT(*) as count,
        SUM(ABS(delta_units)) as total_units
      FROM inventory_movements
      WHERE 1=1
    `;
    const typeParams: any[] = [];
    let typeParamIndex = 1;

    if (filters?.startDate) {
      typeSql += ` AND created_at >= $${typeParamIndex}`;
      typeParams.push(filters.startDate);
      typeParamIndex++;
    }

    if (filters?.endDate) {
      typeSql += ` AND created_at <= $${typeParamIndex}`;
      typeParams.push(filters.endDate);
      typeParamIndex++;
    }

    if (filters?.productId) {
      typeSql += ` AND product_id = $${typeParamIndex}`;
      typeParams.push(filters.productId);
      typeParamIndex++;
    }

    typeSql += ' GROUP BY movement_type ORDER BY count DESC';

    const typeResult = await query<any>(typeSql, typeParams);

    return {
      totalMovements: parseInt(stats.total_movements) || 0,
      totalUnitsIn: parseInt(stats.total_units_in) || 0,
      totalUnitsOut: parseInt(stats.total_units_out) || 0,
      totalPalletsIn: parseInt(stats.total_pallets_in) || 0,
      totalPalletsOut: parseInt(stats.total_pallets_out) || 0,
      byType: typeResult.rows.map(row => ({
        movementType: row.movement_type,
        count: parseInt(row.count),
        totalUnits: parseInt(row.total_units)
      }))
    };
  }
}
