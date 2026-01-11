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

  // Lista użytkowników uprawnionych do ukrywania historii
  private static AUTHORIZED_HIDE_EMAILS = [
    'damian@polflor.wroclaw.pl',
    'admin@plantmanager.pl'
  ];

  /**
   * DELETE /inventory-movements/:id
   * Hide a single movement (soft delete - only for authorized users)
   */
  static async hide(req: AuthRequest, res: Response) {
    try {
      const userEmail = req.user?.email;
      
      if (!userEmail || !InventoryMovementController.AUTHORIZED_HIDE_EMAILS.includes(userEmail)) {
        return res.status(403).json({ error: 'Brak uprawnień do ukrywania historii ruchów' });
      }

      const { id } = req.params;
      const hidden = await InventoryMovementModel.hide(parseInt(id));

      if (hidden) {
        res.json({ success: true, message: 'Ruch magazynowy został ukryty' });
      } else {
        res.status(404).json({ error: 'Nie znaleziono ruchu magazynowego' });
      }
    } catch (error) {
      console.error('Error hiding inventory movement:', error);
      res.status(500).json({ error: 'Nie udało się ukryć ruchu magazynowego' });
    }
  }

  /**
   * DELETE /inventory-movements
   * Hide multiple movements (soft delete - only for authorized users)
   */
  static async hideMany(req: AuthRequest, res: Response) {
    try {
      const userEmail = req.user?.email;
      
      if (!userEmail || !InventoryMovementController.AUTHORIZED_HIDE_EMAILS.includes(userEmail)) {
        return res.status(403).json({ error: 'Brak uprawnień do ukrywania historii ruchów' });
      }

      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Wymagana lista ID do ukrycia' });
      }

      const hiddenCount = await InventoryMovementModel.hideMany(ids);

      res.json({ 
        success: true, 
        message: `Ukryto ${hiddenCount} ruchów magazynowych`,
        hiddenCount 
      });
    } catch (error) {
      console.error('Error hiding inventory movements:', error);
      res.status(500).json({ error: 'Nie udało się ukryć ruchów magazynowych' });
    }
  }
}
