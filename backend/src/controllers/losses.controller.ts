import { Response } from 'express';
import { query } from '../models/database';
import { AuthRequest } from '../middleware/auth';
import { ProductModel } from '../models/Product';
import { MovementType } from '../types';

interface Loss {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  notes?: string;
  isReversed: boolean;
  reversedAt?: Date;
  createdAt: Date;
  createdBy?: number;
  // Joined fields
  plantName?: string;
  potSize?: string;
  barcode?: string;
}

export class LossesController {
  // Get all losses with filters
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, productId, showReversed } = req.query;

      let sql = `
        SELECT l.*, 
               p.plant_name, p.pot_size, p.barcode
        FROM losses l
        JOIN products p ON l.product_id = p.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        sql += ` AND l.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        sql += ` AND l.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      if (productId) {
        sql += ` AND l.product_id = $${paramIndex}`;
        params.push(productId);
        paramIndex++;
      }

      if (showReversed !== 'true') {
        sql += ` AND l.is_reversed = false`;
      }

      sql += ` ORDER BY l.created_at DESC`;

      const result = await query(sql, params);

      // Calculate totals
      const totalValue = result.rows
        .filter((l: any) => !l.isReversed)
        .reduce((sum: number, l: any) => sum + parseFloat(l.totalValue || 0), 0);

      const totalQuantity = result.rows
        .filter((l: any) => !l.isReversed)
        .reduce((sum: number, l: any) => sum + (l.quantity || 0), 0);

      return res.json({
        losses: result.rows,
        totalValue,
        totalQuantity,
        count: result.rows.length,
      });
    } catch (error) {
      console.error('Get losses error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Create new loss
  static async create(req: AuthRequest, res: Response) {
    try {
      const { productId, quantity, notes } = req.body;
      const userId = req.user?.userId;

      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Wymagane: productId i quantity > 0' });
      }

      // Get product to check stock and get price
      const product = await ProductModel.getById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      // Check if we have enough stock
      const totalUnits = (product.palletCount || 0) * (product.unitsPerPallet || 1) + (product.looseUnits || 0);
      if (quantity > totalUnits) {
        return res.status(400).json({ 
          error: `Niewystarczający stan magazynowy. Dostępne: ${totalUnits} szt.` 
        });
      }

      // Calculate value (use purchase price)
      const unitPrice = parseFloat(String(product.purchasePricePln)) || 0;
      const totalValue = unitPrice * quantity;

      // Create loss record
      const insertResult = await query(
        `INSERT INTO losses (product_id, quantity, unit_price, total_value, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [productId, quantity, unitPrice, totalValue, notes || null, userId]
      );

      const loss = insertResult.rows[0];

      // Update product stock - subtract units
      const unitsPerPallet = product.unitsPerPallet || 1;
      let remainingToSubtract = quantity;
      let looseUnits = product.looseUnits || 0;
      let palletCount = product.palletCount || 0;

      // First subtract from loose units
      if (looseUnits >= remainingToSubtract) {
        looseUnits -= remainingToSubtract;
        remainingToSubtract = 0;
      } else {
        remainingToSubtract -= looseUnits;
        looseUnits = 0;
      }

      // Then subtract from pallets
      if (remainingToSubtract > 0) {
        const palletsNeeded = Math.ceil(remainingToSubtract / unitsPerPallet);
        palletCount = Math.max(0, palletCount - palletsNeeded);
        // Add back any excess as loose units
        const subtractedFromPallets = palletsNeeded * unitsPerPallet;
        looseUnits = subtractedFromPallets - remainingToSubtract;
      }

      await ProductModel.update(productId, { palletCount, looseUnits });

      // Create inventory movement
      await ProductModel.createMovement(
        productId,
        null,
        MovementType.LOSS,
        -quantity,
        0,
        notes || 'Strata magazynowa'
      );

      // Auto-archive product if stock reached 0
      const newTotalUnits = palletCount * unitsPerPallet + looseUnits;
      if (newTotalUnits <= 0) {
        await ProductModel.autoArchiveIfZeroStock(productId);
      }

      return res.status(201).json({
        message: 'Strata zarejestrowana',
        loss,
        newStock: {
          palletCount,
          looseUnits,
          totalUnits: palletCount * unitsPerPallet + looseUnits,
        },
      });
    } catch (error) {
      console.error('Create loss error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Reverse a loss (restore stock)
  static async reverse(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Get the loss
      const lossResult = await query('SELECT * FROM losses WHERE id = $1', [id]);
      if (lossResult.rows.length === 0) {
        return res.status(404).json({ error: 'Strata nie znaleziona' });
      }

      const loss = lossResult.rows[0];

      if (loss.is_reversed) {
        return res.status(400).json({ error: 'Ta strata została już cofnięta' });
      }

      // Get product
      const product = await ProductModel.getById(loss.product_id || loss.productId);
      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      // Mark loss as reversed
      await query(
        'UPDATE losses SET is_reversed = true, reversed_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Restore stock - add units back
      const unitsPerPallet = product.unitsPerPallet || 1;
      let looseUnits = (product.looseUnits || 0) + loss.quantity;
      let palletCount = product.palletCount || 0;

      // Convert loose units to pallets if possible
      if (looseUnits >= unitsPerPallet) {
        const newPallets = Math.floor(looseUnits / unitsPerPallet);
        palletCount += newPallets;
        looseUnits = looseUnits % unitsPerPallet;
      }

      await ProductModel.update(loss.product_id || loss.productId, { palletCount, looseUnits });

      // Restore product from archive if stock is now positive
      const newTotalUnits = palletCount * unitsPerPallet + looseUnits;
      if (newTotalUnits > 0 && product.isArchived) {
        await query(
          'UPDATE products SET is_archived = false, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [loss.product_id || loss.productId]
        );
      }


      // Create reversal movement
      await ProductModel.createMovement(
        loss.product_id || loss.productId,
        null,
        MovementType.LOSS_REVERSAL,
        loss.quantity,
        0,
        'Cofnięcie straty #' + id
      );

      return res.json({
        message: 'Strata cofnięta, stan przywrócony',
        newStock: {
          palletCount,
          looseUnits,
          totalUnits: palletCount * unitsPerPallet + looseUnits,
        },
      });
    } catch (error) {
      console.error('Reverse loss error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Get loss statistics
  static async getStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND created_at BETWEEN  AND ';
        params.push(startDate, endDate);
      }

      // Total losses (not reversed)
      const totalResult = await query(
        `SELECT 
           COUNT(*) as count,
           COALESCE(SUM(quantity), 0) as total_quantity,
           COALESCE(SUM(total_value), 0) as total_value
         FROM losses 
         WHERE is_reversed = false ${dateFilter}`,
        params
      );

      // Losses by product (top 10)
      const byProductResult = await query(
        `SELECT 
           p.id, p.plant_name, p.pot_size,
           COUNT(l.id) as loss_count,
           SUM(l.quantity) as total_quantity,
           SUM(l.totalValue) as total_value
         FROM losses l
         JOIN products p ON l.product_id = p.id
         WHERE l.is_reversed = false ${dateFilter}
         GROUP BY p.id, p.plant_name, p.pot_size
         ORDER BY total_value DESC
         LIMIT 10`,
        params
      );

      // Losses by month (last 6 months)
      const byMonthResult = await query(
        `SELECT 
           TO_CHAR(created_at, 'YYYY-MM') as month,
           COUNT(*) as count,
           SUM(quantity) as total_quantity,
           SUM(total_value) as total_value
         FROM losses 
         WHERE is_reversed = false 
           AND created_at >= NOW() - INTERVAL '6 months'
         GROUP BY TO_CHAR(created_at, 'YYYY-MM')
         ORDER BY month DESC`
      );

      return res.json({
        totals: totalResult.rows[0],
        byProduct: byProductResult.rows,
        byMonth: byMonthResult.rows,
      });
    } catch (error) {
      console.error('Get loss stats error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }
}
