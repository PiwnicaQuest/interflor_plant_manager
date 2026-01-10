import { Response } from 'express';
import { AuthRequest } from '../types';
import { InventoryMovementModel } from '../models/InventoryMovement';

export class InventoryMovementController {
  /**
   * GET /inventory-movements
   * Get all inventory movements with filters
   */
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const {
        productId,
        userId,
        type,
        startDate,
        endDate,
        search,
        limit = 50,
        offset = 0,
      } = req.query;

      const filters = {
        productId: productId ? parseInt(productId as string) : undefined,
        userId: userId ? parseInt(userId as string) : undefined,
        type: type as any,
        startDate: startDate as string,
        endDate: endDate as string,
        search: search as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      };

      const { movements, total } = await InventoryMovementModel.getAll(filters);

      res.json({
        movements,
        total,
        limit: filters.limit,
        offset: filters.offset,
        hasMore: filters.offset + movements.length < total,
      });
    } catch (error) {
      console.error('Error fetching inventory movements:', error);
      res.status(500).json({ error: 'Nie udało się pobrać historii ruchów magazynowych' });
    }
  }

  /**
   * GET /inventory-movements/product/:productId
   * Get movements for a specific product
   */
  static async getByProduct(req: AuthRequest, res: Response) {
    try {
      const { productId } = req.params;
      const { limit = 50 } = req.query;

      const movements = await InventoryMovementModel.getByProductId(
        parseInt(productId),
        parseInt(limit as string)
      );

      res.json({ movements });
    } catch (error) {
      console.error('Error fetching product movements:', error);
      res.status(500).json({ error: 'Nie udało się pobrać historii ruchów produktu' });
    }
  }

  /**
   * GET /inventory-movements/statistics
   * Get movement statistics
   */
  static async getStatistics(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, productId } = req.query;

      const filters = {
        startDate: startDate as string,
        endDate: endDate as string,
        productId: productId ? parseInt(productId as string) : undefined,
      };

      const statistics = await InventoryMovementModel.getStatistics(filters);

      res.json(statistics);
    } catch (error) {
      console.error('Error fetching movement statistics:', error);
      res.status(500).json({ error: 'Nie udało się pobrać statystyk ruchów' });
    }
  }
}
