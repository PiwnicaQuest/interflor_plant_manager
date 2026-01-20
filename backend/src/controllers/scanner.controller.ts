import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProductModel } from '../models/Product';
import { OrderModel } from '../models/Order';
import { CustomerModel } from '../models/Customer';
import { query, transaction } from '../models/database';

export class ScannerController {
  // GET /inventory/barcode/:barcode - Get product by barcode
  static async getProductByBarcode(req: AuthRequest, res: Response) {
    try {
      const { barcode } = req.params;

      if (!barcode) {
        return res.status(400).json({ error: 'Kod kreskowy jest wymagany' });
      }

      const product = await ProductModel.getByBarcodeIncludingMerged(barcode);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      return res.json(product);
    } catch (error) {
      console.error('Get product by barcode error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // POST /orders/:id/items - Add item to order
  static async addOrderItem(req: AuthRequest, res: Response) {
    try {
      const orderId = parseInt(req.params.id);
      const { productId, quantity, unitPriceGross, palletCount, unitsPerPallet } = req.body;

      if (!productId || !quantity || !unitPriceGross) {
        return res.status(400).json({ error: 'Brak wymaganych pól' });
      }

      // Get order
      const order = await OrderModel.getById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      // Check if order can be modified
      if (['completed', 'cancelled'].includes(order.status)) {
        return res.status(400).json({ error: 'Nie można modyfikować zakończonego zamówienia' });
      }

      const result = await transaction(async (client) => {
        // Get product data
        const productResult = await client.query(
          'SELECT * FROM products WHERE id = $1',
          [productId]
        );

        if (productResult.rows.length === 0) {
          throw new Error('Produkt nie istnieje');
        }

        const product = productResult.rows[0];

        // Check stock
        if (product.totalUnits < quantity) {
          throw new Error(`Niewystarczający stan: ${product.totalUnits} szt.`);
        }

        // Create product snapshot
        const productSnapshot = {
          id: product.id,
          plantName: product.plantName,
          potSize: product.potSize,
          plantHeightCm: product.plantHeightCm,
          barcode: product.barcode,
          imageUrl: product.imageUrl,
          unitsPerPallet: product.unitsPerPallet || 1,
        };

        // Calculate pallet info
        const itemUnitsPerPallet = unitsPerPallet || product.unitsPerPallet || 1;
        const itemPalletCount = palletCount !== undefined ? palletCount : Math.floor(quantity / itemUnitsPerPallet);

        // Insert order item
        const itemResult = await client.query(
          `INSERT INTO order_items (
            order_id, product_id, product_snapshot, quantity, unit_price_gross, pallet_count, units_per_pallet
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [orderId, productId, JSON.stringify(productSnapshot), quantity, unitPriceGross, itemPalletCount, itemUnitsPerPallet]
        );

        // Update order total
        await client.query(
          'UPDATE orders SET total_amount = total_amount + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [quantity * unitPriceGross, orderId]
        );

        // Update inventory
        const newTotalUnits = product.totalUnits - quantity;
        const newPalletCount = Math.floor(newTotalUnits / (product.unitsPerPallet || 1));
        const newLooseUnits = newTotalUnits % (product.unitsPerPallet || 1);

        await client.query(
          'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [newPalletCount, newLooseUnits, productId]
        );

        // Create inventory movement
        await client.query(
          `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, reason, reference_type, reference_id)
           VALUES ($1, $2, 'order', $3, $4, 'order', $5)`,
          [productId, req.user?.userId, -quantity, `Dodano do zamówienia #${orderId}`, orderId]
        );

        // Auto-archive if stock reached 0
        if (newTotalUnits <= 0) {
          await client.query(
            'UPDATE products SET is_archived = true, archived_at = CURRENT_TIMESTAMP, visible_in_shop = false WHERE id = $1',
            [productId]
          );
        }

        return itemResult.rows[0];
      });

      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Add order item error:', error);
      return res.status(500).json({ error: error.message || 'Błąd serwera' });
    }
  }

  // PUT /orders/:id/items/:itemId - Update order item
  static async updateOrderItem(req: AuthRequest, res: Response) {
    try {
      const orderId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);
      const { quantity, palletCount, unitsPerPallet } = req.body;

      // Get order
      const order = await OrderModel.getById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      if (['completed', 'cancelled'].includes(order.status)) {
        return res.status(400).json({ error: 'Nie można modyfikować zakończonego zamówienia' });
      }

      const result = await transaction(async (client) => {
        // Get current item
        const currentItemResult = await client.query(
          'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
          [itemId, orderId]
        );

        if (currentItemResult.rows.length === 0) {
          throw new Error('Pozycja nie znaleziona');
        }

        const currentItem = currentItemResult.rows[0];
        const oldQuantity = currentItem.quantity;
        const newQuantity = quantity !== undefined ? quantity : oldQuantity;
        const quantityDiff = newQuantity - oldQuantity;

        // Get product
        const productResult = await client.query(
          'SELECT * FROM products WHERE id = $1',
          [currentItem.productId]
        );
        const product = productResult.rows[0];

        // Check stock if increasing quantity
        if (quantityDiff > 0 && product.totalUnits < quantityDiff) {
          throw new Error(`Niewystarczający stan: ${product.totalUnits} szt.`);
        }

        // Update item
        const newPalletCount = palletCount !== undefined ? palletCount : currentItem.palletCount;
        const newUnitsPerPallet = unitsPerPallet !== undefined ? unitsPerPallet : currentItem.unitsPerPallet;

        await client.query(
          'UPDATE order_items SET quantity = $1, pallet_count = $2, units_per_pallet = $3 WHERE id = $4',
          [newQuantity, newPalletCount, newUnitsPerPallet, itemId]
        );

        // Update order total
        const priceDiff = quantityDiff * currentItem.unitPriceGross;
        await client.query(
          'UPDATE orders SET total_amount = total_amount + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [priceDiff, orderId]
        );

        // Update inventory
        if (quantityDiff !== 0) {
          const newTotalUnits = product.totalUnits - quantityDiff;
          const newProductPalletCount = Math.floor(newTotalUnits / (product.unitsPerPallet || 1));
          const newLooseUnits = newTotalUnits % (product.unitsPerPallet || 1);

          await client.query(
            'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [newProductPalletCount, newLooseUnits, currentItem.productId]
          );

          // Create inventory movement
          await client.query(
            `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, reason, reference_type, reference_id)
             VALUES ($1, $2, 'adjustment', $3, $4, 'order', $5)`,
            [currentItem.productId, req.user?.userId, -quantityDiff, `Zmiana ilości w zamówieniu #${orderId}`, orderId]
          );

          // Auto-archive if stock reached 0
          if (newTotalUnits <= 0) {
            await client.query(
              'UPDATE products SET is_archived = true, archived_at = CURRENT_TIMESTAMP, visible_in_shop = false WHERE id = $1',
              [currentItem.productId]
            );
          }
        }

        // Return updated item
        const updatedResult = await client.query(
          'SELECT * FROM order_items WHERE id = $1',
          [itemId]
        );
        return updatedResult.rows[0];
      });

      return res.json(result);
    } catch (error: any) {
      console.error('Update order item error:', error);
      return res.status(500).json({ error: error.message || 'Błąd serwera' });
    }
  }

  // DELETE /orders/:id/items/:itemId - Delete order item
  static async deleteOrderItem(req: AuthRequest, res: Response) {
    try {
      const orderId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);

      // Get order
      const order = await OrderModel.getById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      if (['completed', 'cancelled'].includes(order.status)) {
        return res.status(400).json({ error: 'Nie można modyfikować zakończonego zamówienia' });
      }

      await transaction(async (client) => {
        // Get item
        const itemResult = await client.query(
          'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
          [itemId, orderId]
        );

        if (itemResult.rows.length === 0) {
          throw new Error('Pozycja nie znaleziona');
        }

        const item = itemResult.rows[0];

        // Get product
        const productResult = await client.query(
          'SELECT * FROM products WHERE id = $1',
          [item.productId]
        );
        const product = productResult.rows[0];

        // Delete item
        await client.query('DELETE FROM order_items WHERE id = $1', [itemId]);

        // Update order total
        await client.query(
          'UPDATE orders SET total_amount = total_amount - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [item.total_price, orderId]
        );

        // Restore inventory
        const newTotalUnits = product.totalUnits + item.quantity;
        const newPalletCount = Math.floor(newTotalUnits / (product.unitsPerPallet || 1));
        const newLooseUnits = newTotalUnits % (product.unitsPerPallet || 1);

        await client.query(
          'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [newPalletCount, newLooseUnits, item.productId]
        );

        // Restore product from archive if stock is now positive
        if (newTotalUnits > 0 && product.isArchived) {
          await client.query(
            'UPDATE products SET is_archived = false, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [item.productId]
          );
        }

        // Create inventory movement (restore)
        await client.query(
          `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, reason, reference_type, reference_id)
           VALUES ($1, $2, 'adjustment', $3, $4, 'order', $5)`,
          [item.productId, req.user?.userId, item.quantity, `Usunięto z zamówienia #${orderId}`, orderId]
        );
      });

      return res.json({ message: 'Pozycja usunięta' });
    } catch (error: any) {
      console.error('Delete order item error:', error);
      return res.status(500).json({ error: error.message || 'Błąd serwera' });
    }
  }
}
