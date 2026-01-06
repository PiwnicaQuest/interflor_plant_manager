import { query, transaction } from './database';
import { Order, OrderItem, OrderWithItems, OrderStatus, CustomerSnapshot } from '../types';
import { broadcast } from '../main';

export class OrderModel {
  static async getAll(filters?: {
    status?: OrderStatus;
    customerId?: number;
  }): Promise<Order[]> {
    let sql = `
      SELECT o.*,
             COALESCE(c.company_name, CONCAT(c.first_name, ' ', c.last_name)) as customer_name,
             c.customer_code as customer_code,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      sql += ` AND o.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.customerId) {
      sql += ` AND o.customer_id = $${paramIndex}`;
      params.push(filters.customerId);
      paramIndex++;
    }

    sql += ' ORDER BY o.created_at DESC';

    const result = await query<Order>(sql, params);
    return result.rows;
  }

  static async getById(id: number): Promise<OrderWithItems | null> {
    const orderResult = await query<Order>(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return null;
    }

    const order = orderResult.rows[0];

    const itemsResult = await query<OrderItem>(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
      [id]
    );

    // Ensure productSnapshot is properly parsed and converted to camelCase
    const items = itemsResult.rows.map(item => {
      let productSnapshot = item.productSnapshot as any;

      // If it's a string, try to parse it
      if (typeof productSnapshot === 'string') {
        try {
          productSnapshot = JSON.parse(productSnapshot);
        } catch (e) {
          console.error('Failed to parse productSnapshot:', e);
        }
      }

      // Convert productSnapshot fields from snake_case to camelCase
      if (productSnapshot && typeof productSnapshot === 'object') {
        const converted = {
          id: productSnapshot.id,
          plantName: productSnapshot.plant_name || productSnapshot.plantName,
          potSize: productSnapshot.pot_size || productSnapshot.potSize,
          plantHeightCm: productSnapshot.plant_height_cm || productSnapshot.plantHeightCm,
          barcode: productSnapshot.barcode,
          imageUrl: productSnapshot.image_url || productSnapshot.imageUrl,
          createdAt: productSnapshot.created_at || productSnapshot.createdAt,
          unitsPerPallet: productSnapshot.units_per_pallet || productSnapshot.unitsPerPallet,
          growerPassport: productSnapshot.grower_passport || productSnapshot.growerPassport,
        };
        productSnapshot = converted;
      }

      return {
        ...item,
        productSnapshot,
        // Add productName for convenience (used in transfer modal etc.)
        productName: productSnapshot?.plantName || undefined,
      };
    });

    const customerResult = await query<{ companyName?: string; firstName?: string; lastName?: string; customerCode?: string }>(
      'SELECT company_name, first_name, last_name, customer_code FROM customers WHERE id = $1',
      [order.customerId]
    );

    let customerName: string | undefined;
    let customerCode: string | undefined;
    if (customerResult.rows.length > 0) {
      const customer = customerResult.rows[0];
      customerName = customer.companyName || `${customer.firstName} ${customer.lastName}`;
      customerCode = customer.customerCode;
    }

    return {
      ...order,
      items,
      customerCode,
      customerName,
    };
  }

  static async getByOrderNumber(orderNumber: string): Promise<OrderWithItems | null> {
    const orderResult = await query<Order>(
      'SELECT * FROM orders WHERE order_number = $1',
      [orderNumber]
    );

    if (orderResult.rows.length === 0) {
      return null;
    }

    return this.getById(orderResult.rows[0].id);
  }

  static async create(
    customerId: number,
    items: Array<{ productId: number; quantity: number; unitPriceGross: number; palletCount?: number; unitsPerPallet?: number }>,
    customerSnapshot: CustomerSnapshot,
    createdByUserId?: number,
    customerNotes?: string,
    recipientSnapshot?: CustomerSnapshot
  ): Promise<OrderWithItems> {
    return transaction(async (client) => {
      // Generate order number
      const orderNumberResult = await client.query<{ orderNumber?: string; order_number?: string }>(
        "SELECT get_next_document_number('order', 'ORD') as order_number"
      );
      const orderNumber = orderNumberResult.rows[0].orderNumber || orderNumberResult.rows[0].order_number;

      // Calculate total
      const totalAmount = items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceGross,
        0
      );

      // Insert order
      const orderResult = await client.query<Order>(
        `INSERT INTO orders (
          order_number, customer_id, created_by_user_id, customer_snapshot,
          customer_notes, recipient_snapshot, total_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          orderNumber,
          customerId,
          createdByUserId,
          JSON.stringify(customerSnapshot),
          customerNotes,
          recipientSnapshot ? JSON.stringify(recipientSnapshot) : null,
          totalAmount,
          'pending',
        ]
      );

      const order = orderResult.rows[0];

      // Insert order items and update inventory
      const orderItems: OrderItem[] = [];
      for (const item of items) {
        // Get product data including stock info
        const productResult = await client.query(
          'SELECT id, plant_name, pot_size, plant_height_cm, barcode, image_url, pallet_count, units_per_pallet, total_units, created_at FROM products WHERE id = $1',
          [item.productId]
        );

        if (productResult.rows.length === 0) {
          throw new Error(`Produkt o ID ${item.productId} nie istnieje`);
        }

        const product = productResult.rows[0];

        // Check if there's enough stock
        if (product.totalUnits < item.quantity) {
          throw new Error(`Niewystarczający stan magazynowy dla produktu "${product.plantName}". Dostępne: ${product.totalUnits} szt., zamówiono: ${item.quantity} szt.`);
        }

        // Create product snapshot for order item
        const productSnapshot = {
          id: product.id,
          plant_name: product.plantName,
          pot_size: product.potSize,
          plant_height_cm: product.plantHeightCm,
          barcode: product.barcode,
          image_url: product.imageUrl,
          created_at: product.createdAt,
          units_per_pallet: product.unitsPerPallet,
          grower_passport: product.growerPassport,
        };

        // Calculate pallet info - use provided values or calculate from quantity
        const unitsPerPallet = item.unitsPerPallet || product.unitsPerPallet || 1;
        const palletCount = item.palletCount !== undefined ? item.palletCount : Math.floor(item.quantity / unitsPerPallet);

        const itemResult = await client.query<OrderItem>(
          `INSERT INTO order_items (
            order_id, product_id, product_snapshot, quantity, unit_price_gross, pallet_count, units_per_pallet
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            order.id,
            item.productId,
            JSON.stringify(productSnapshot),
            item.quantity,
            item.unitPriceGross,
            palletCount,
            unitsPerPallet,
          ]
        );

        // Add productName to the item for convenience
        const orderItem = {
          ...itemResult.rows[0],
          productName: product.plantName,
          productSnapshot: {
            id: product.id,
            plantName: product.plantName,
            potSize: product.potSize,
            plantHeightCm: product.plantHeightCm,
            barcode: product.barcode,
            imageUrl: product.imageUrl,
          }
        };
        orderItems.push(orderItem);

        // Update inventory - decrease stock using pallet_count and loose_units
        const newTotalUnits = product.totalUnits - item.quantity;
        const productUnitsPerPallet = product.unitsPerPallet || 1;
        const newPalletCount = Math.floor(newTotalUnits / productUnitsPerPallet);
        const newLooseUnits = newTotalUnits % productUnitsPerPallet;

        await client.query(
          'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [newPalletCount, newLooseUnits, item.productId]
        );

        // Auto-archive product if stock reached 0
        if (newTotalUnits <= 0) {
          await client.query(
            'UPDATE products SET is_archived = true, archived_at = CURRENT_TIMESTAMP, visible_in_shop = false WHERE id = $1',
            [item.productId]
          );
        }

        // Create inventory movement record
        await client.query(
          `INSERT INTO inventory_movements (
            product_id, user_id, movement_type, delta_units, delta_pallets,
            reason, reference_type, reference_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            item.productId,
            createdByUserId,
            'order',
            -item.quantity, // negative because we're reducing stock
            -Math.ceil(item.quantity / productUnitsPerPallet),
            `Zamówienie ${orderNumber}`,
            'order',
            order.id,
          ]
        );
      }

      // Get customer name
      const customerResult = await client.query<{ companyName?: string; firstName?: string; lastName?: string; customerCode?: string }>(
        'SELECT company_name, first_name, last_name, customer_code FROM customers WHERE id = $1',
        [customerId]
      );

      let customerName: string | undefined;
      let customerCode: string | undefined;
      if (customerResult.rows.length > 0) {
        const customer = customerResult.rows[0];
        customerName = customer.companyName || `${customer.firstName} ${customer.lastName}`;
        customerCode = customer.customerCode;
      }

      return {
        ...order,
        items: orderItems,
        customerCode,
        customerName,
      };
    });
  }

  static async updateStatus(
    id: number,
    status: OrderStatus,
    userId?: number,
    notes?: string
  ): Promise<Order | null> {
    return transaction(async (client) => {
      // Get current status
      const currentResult = await client.query<Order>(
        'SELECT * FROM orders WHERE id = $1',
        [id]
      );

      if (currentResult.rows.length === 0) {
        return null;
      }

      const currentOrder = currentResult.rows[0];

      // Update order status
      const updateResult = await client.query<Order>(
        `UPDATE orders
         SET status = $1::order_status, updated_at = CURRENT_TIMESTAMP,
             completed_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      // Log status change
      await client.query(
        `INSERT INTO order_status_log (order_id, old_status, new_status, changed_by_user_id, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, currentOrder.status, status, userId, notes]
      );

      const updatedOrder = updateResult.rows[0];

      // Get user email for changedBy field
      let changedBy = 'System';
      if (userId) {
        const userResult = await client.query<{ email: string }>(
          'SELECT email FROM users WHERE id = $1',
          [userId]
        );
        if (userResult.rows.length > 0) {
          changedBy = userResult.rows[0].email;
        }
      }

      // Broadcast order status change via WebSocket
      broadcast('orders', {
        type: 'order:status_changed',
        data: {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          oldStatus: currentOrder.status,
          newStatus: status,
          changedBy,
          timestamp: new Date(),
        },
      });

      return updatedOrder;
    });
  }

  static async updateItems(
    orderId: number,
    items: Array<{ productId: number; quantity: number; unitPriceGross: number; palletCount?: number; unitsPerPallet?: number }>,
    userId?: number
  ): Promise<OrderWithItems | null> {
    return transaction(async (client) => {
      // Get current order
      const orderResult = await client.query<Order>(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return null;
      }

      const order = orderResult.rows[0];

      // Get existing items to compare and calculate differences
      const existingItemsResult = await client.query<OrderItem>(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );

      // Build maps for comparison
      const existingItemsMap = new Map<number, OrderItem>();
      for (const item of existingItemsResult.rows) {
        if (item.productId) {
          existingItemsMap.set(item.productId, item);
        }
      }

      const newItemsMap = new Map<number, { productId: number; quantity: number; unitPriceGross: number; palletCount?: number; unitsPerPallet?: number }>();
      for (const item of items) {
        newItemsMap.set(item.productId, item);
      }

      // Process existing items - restore stock and create movements for removed/changed items
      for (const existingItem of existingItemsResult.rows) {
        if (!existingItem.productId) continue;

        const productResult = await client.query(
          'SELECT id, pallet_count, units_per_pallet, total_units, plant_name, is_archived FROM products WHERE id = $1',
          [existingItem.productId]
        );

        if (productResult.rows.length === 0) continue;

        const product = productResult.rows[0];
        const unitsPerPallet = product.unitsPerPallet || 1;

        // Calculate quantity difference
        const newItem = newItemsMap.get(existingItem.productId);
        const oldQuantity = existingItem.quantity;
        const newQuantity = newItem?.quantity || 0;
        const quantityDiff = oldQuantity - newQuantity;

        if (quantityDiff !== 0) {
          // Restore the old quantity first
          const restoredTotalUnits = product.totalUnits + oldQuantity;
          const restoredPalletCount = Math.floor(restoredTotalUnits / unitsPerPallet);
          const restoredLooseUnits = restoredTotalUnits % unitsPerPallet;

          await client.query(
            'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [restoredPalletCount, restoredLooseUnits, existingItem.productId]
          );

          // Restore from archive if needed
          if (restoredTotalUnits > 0 && product.isArchived) {
            await client.query(
              'UPDATE products SET is_archived = false, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
              [existingItem.productId]
            );
          }

          // Create inventory movement for the difference
          if (quantityDiff > 0) {
            // Quantity decreased = stock returned
            await client.query(
              `INSERT INTO inventory_movements (
                product_id, user_id, movement_type, delta_units, delta_pallets,
                reason, reference_type, reference_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                existingItem.productId,
                userId,
                'return',
                quantityDiff,
                Math.ceil(quantityDiff / unitsPerPallet),
                `Edycja zamówienia ${order.orderNumber} - zmniejszono ilość`,
                'order',
                orderId,
              ]
            );
          } else if (newItem) {
            // Quantity increased = more stock taken (will be handled below when processing new items)
          }
        } else {
          // No change in quantity - still restore stock temporarily (will be deducted again below)
          const restoredTotalUnits = product.totalUnits + oldQuantity;
          const restoredPalletCount = Math.floor(restoredTotalUnits / unitsPerPallet);
          const restoredLooseUnits = restoredTotalUnits % unitsPerPallet;

          await client.query(
            'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [restoredPalletCount, restoredLooseUnits, existingItem.productId]
          );
        }
      }

      // Save existing items snapshots before deleting (for products that may have been deleted)
      // Cast to any because PostgreSQL returns snake_case but TypeScript type uses camelCase
      const existingSnapshotsMap = new Map<number, { snapshot: any; quantity: number; unitsPerPallet: number }>();
      for (const existItem of existingItemsResult.rows as any[]) {
        const productSnapshot = existItem.product_snapshot || existItem.productSnapshot;
        const productId = existItem.product_id || existItem.productId || (productSnapshot && (productSnapshot.id || productSnapshot.product_id));
        const qty = existItem.quantity;
        const upp = existItem.units_per_pallet || existItem.unitsPerPallet || 1;
        if (productId && productSnapshot) {
          existingSnapshotsMap.set(productId, {
            snapshot: productSnapshot,
            quantity: qty,
            unitsPerPallet: upp,
          });
        }
      }

      // Delete existing items
      await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

      // Insert new items and deduct stock
      const orderItems: OrderItem[] = [];
      for (const item of items) {
        // Get fresh product data (after restoration)
        const productResult = await client.query(
          'SELECT id, plant_name, pot_size, plant_height_cm, barcode, image_url, pallet_count, units_per_pallet, total_units, created_at FROM products WHERE id = $1',
          [item.productId]
        );

        let product: any = null;
        let productSnapshot: any = null;
        let skipStockUpdate = false;

        if (productResult.rows.length === 0) {
          // Product doesn't exist - try to use existing snapshot
          const existing = existingSnapshotsMap.get(item.productId);
          if (existing && existing.snapshot) {
            // Cannot increase quantity for deleted products
            if (item.quantity > existing.quantity) {
              throw new Error(`Nie można zwiększyć ilości dla produktu, który już nie istnieje w magazynie`);
            }
            // Use existing snapshot
            const snap = existing.snapshot;
            product = {
              id: item.productId,
              plantName: snap.plantName || snap.plant_name,
              potSize: snap.potSize || snap.pot_size,
              plantHeightCm: snap.plantHeightCm || snap.plant_height_cm,
              barcode: snap.barcode,
              imageUrl: snap.imageUrl || snap.image_url,
              createdAt: snap.createdAt || snap.created_at,
              unitsPerPallet: snap.unitsPerPallet || snap.units_per_pallet || 1,
              totalUnits: 0, // Product deleted, no stock
            };
            productSnapshot = snap;
            skipStockUpdate = true;
          } else {
            throw new Error(`Produkt o ID ${item.productId} nie istnieje`);
          }
        } else {
          product = productResult.rows[0];

          // Check if there's enough stock
          if (product.totalUnits < item.quantity) {
            throw new Error(`Niewystarczający stan magazynowy dla produktu "${product.plantName}". Dostępne: ${product.totalUnits} szt., zamówiono: ${item.quantity} szt.`);
          }

          productSnapshot = {
            id: product.id,
            plant_name: product.plantName,
            pot_size: product.potSize,
            plant_height_cm: product.plantHeightCm,
            barcode: product.barcode,
            image_url: product.imageUrl,
            created_at: product.createdAt,
            units_per_pallet: product.unitsPerPallet,
          grower_passport: product.growerPassport,
          };
        }

        const unitsPerPallet = item.unitsPerPallet || product.unitsPerPallet || 1;
        const palletCount = item.palletCount !== undefined ? item.palletCount : Math.floor(item.quantity / unitsPerPallet);

        const itemResult = await client.query<OrderItem>(
          `INSERT INTO order_items (
            order_id, product_id, product_snapshot, quantity, unit_price_gross, pallet_count, units_per_pallet
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            orderId,
            skipStockUpdate ? null : item.productId,  // Use NULL for deleted products to avoid FK constraint violation
            JSON.stringify(productSnapshot),
            item.quantity,
            item.unitPriceGross,
            palletCount,
            unitsPerPallet,
          ]
        );

        const orderItem = {
          ...itemResult.rows[0],
          productName: product.plantName,
          productSnapshot: {
            id: product.id,
            plantName: product.plantName,
            potSize: product.potSize,
            plantHeightCm: product.plantHeightCm,
            barcode: product.barcode,
            imageUrl: product.imageUrl,
          }
        };
        orderItems.push(orderItem);

        // Calculate productUnitsPerPallet (needed for inventory movements later)
        const productUnitsPerPallet = product.unitsPerPallet || 1;

        // Deduct stock (skip if product was deleted)
        if (!skipStockUpdate) {
          const newTotalUnits = product.totalUnits - item.quantity;
          const newPalletCount = Math.floor(newTotalUnits / productUnitsPerPallet);
          const newLooseUnits = newTotalUnits % productUnitsPerPallet;

          await client.query(
            'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [newPalletCount, newLooseUnits, item.productId]
          );

          // Auto-archive if stock reached 0
          if (newTotalUnits <= 0) {
            await client.query(
              'UPDATE products SET is_archived = true, archived_at = CURRENT_TIMESTAMP, visible_in_shop = false WHERE id = $1',
              [item.productId]
            );
          }
        }

        // Create inventory movement for new products or increased quantities (skip for deleted products)
        if (!skipStockUpdate) {
          const existingItem = existingItemsMap.get(item.productId);
          if (!existingItem) {
            // Completely new product added to order
            await client.query(
              `INSERT INTO inventory_movements (
                product_id, user_id, movement_type, delta_units, delta_pallets,
                reason, reference_type, reference_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                item.productId,
                userId,
                'order',
                -item.quantity,
                -Math.ceil(item.quantity / productUnitsPerPallet),
                `Edycja zamówienia ${order.orderNumber} - dodano produkt`,
                'order',
                orderId,
              ]
            );
          } else if (item.quantity > existingItem.quantity) {
            // Quantity increased - create movement for the additional amount
            const additionalQuantity = item.quantity - existingItem.quantity;
            await client.query(
              `INSERT INTO inventory_movements (
                product_id, user_id, movement_type, delta_units, delta_pallets,
                reason, reference_type, reference_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                item.productId,
                userId,
                'order',
                -additionalQuantity,
                -Math.ceil(additionalQuantity / productUnitsPerPallet),
                `Edycja zamówienia ${order.orderNumber} - zwiększono ilość`,
                'order',
                orderId,
              ]
            );
          }
        }
      }

      // Update total amount
      const totalAmount = items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceGross,
        0
      );

      const updatedOrderResult = await client.query<Order>(
        'UPDATE orders SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [totalAmount, orderId]
      );

      const updatedOrder = updatedOrderResult.rows[0];

      // Get customer name
      const customerResult = await client.query<{ companyName?: string; firstName?: string; lastName?: string; customerCode?: string }>(
        'SELECT company_name, first_name, last_name, customer_code FROM customers WHERE id = $1',
        [updatedOrder.customerId]
      );

      let customerName: string | undefined;
      let customerCode: string | undefined;
      if (customerResult.rows.length > 0) {
        const customer = customerResult.rows[0];
        customerName = customer.companyName || `${customer.firstName} ${customer.lastName}`;
        customerCode = customer.customerCode;
      }

      return {
        ...updatedOrder,
        items: orderItems,
        customerCode,
        customerName,
      };
    });
  }

  static async getStatusHistory(orderId: number) {
    const result = await query(
      `SELECT osl.*, u.email as changed_by_email
       FROM order_status_log osl
       LEFT JOIN users u ON osl.changed_by_user_id = u.id
       WHERE osl.order_id = $1
       ORDER BY osl.created_at DESC`,
      [orderId]
    );
    return result.rows;
  }

  static async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM orders WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static async cancel(
    orderId: number,
    reason: string,
    userId?: number
  ): Promise<Order | null> {
    return transaction(async (client) => {
      // Get current order with items
      const orderResult = await client.query<Order>(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return null;
      }

      const currentOrder = orderResult.rows[0];

      // Validate: cannot cancel completed orders
      if (currentOrder.status === 'completed') {
        throw new Error('Nie można anulować zamówienia o statusie COMPLETED');
      }

      // Validate: cannot cancel already cancelled orders
      if (currentOrder.status === 'cancelled') {
        throw new Error('Zamówienie jest już anulowane');
      }

      // Get order items to restore stock
      const itemsResult = await client.query<OrderItem>(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );

      // Restore inventory for each item
      for (const item of itemsResult.rows) {
        if (!item.productId) continue;

        // Get current product data
        const productResult = await client.query(
          'SELECT id, pallet_count, units_per_pallet, total_units, plant_name, is_archived FROM products WHERE id = $1',
          [item.productId]
        );

        if (productResult.rows.length === 0) {
          continue; // Skip if product no longer exists
        }

        const product = productResult.rows[0];

        // Calculate new stock after restoration
        // Note: wrapClient converts snake_case to camelCase, so use camelCase properties
        const currentTotalUnits = product.totalUnits || 0;
        const unitsPerPallet = product.unitsPerPallet || 1;
        const newTotalUnits = currentTotalUnits + item.quantity;
        const newPalletCount = Math.floor(newTotalUnits / unitsPerPallet);
        const newLooseUnits = newTotalUnits % unitsPerPallet;

        // Update product stock
        await client.query(
          'UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [newPalletCount, newLooseUnits, item.productId]
        );

        // Restore product from archive if it was archived due to zero stock
        if (newTotalUnits > 0 && product.isArchived) {
          await client.query(
            'UPDATE products SET is_archived = false, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [item.productId]
          );
        }

        // Create inventory movement for stock restoration
        await client.query(
          `INSERT INTO inventory_movements (
            product_id, user_id, movement_type, delta_units, delta_pallets,
            reason, reference_type, reference_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            item.productId,
            userId,
            'return', // Using RETURN movement type for cancelled orders
            item.quantity,
            Math.ceil(item.quantity / unitsPerPallet),
            `Anulowanie zamówienia ${currentOrder.orderNumber} - ${reason}`,
            'order',
            orderId,
          ]
        );
      }

      // Update order status to CANCELLED
      const updateResult = await client.query<Order>(
        `UPDATE orders
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        ['cancelled', orderId]
      );

      // Log status change with cancellation reason
      await client.query(
        `INSERT INTO order_status_log (order_id, old_status, new_status, changed_by_user_id, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, currentOrder.status, 'cancelled', userId, reason]
      );

      const updatedOrder = updateResult.rows[0];

      // Get user email for changedBy field
      let changedBy = 'System';
      if (userId) {
        const userResult = await client.query<{ email: string }>(
          'SELECT email FROM users WHERE id = $1',
          [userId]
        );
        if (userResult.rows.length > 0) {
          changedBy = userResult.rows[0].email;
        }
      }

      // Broadcast order status change via WebSocket
      broadcast('orders', {
        type: 'order:status_changed',
        data: {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          oldStatus: currentOrder.status,
          newStatus: 'cancelled' as OrderStatus,
          changedBy,
          timestamp: new Date(),
        },
      });

      return updatedOrder;
    });
  }
  static async getCompletedToday(): Promise<any[]> {
    const sql = `
      SELECT
        o.*,
        COALESCE(c.company_name, CONCAT(c.first_name, ' ', c.last_name)) as customer_name,
             c.customer_code as customer_code,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
        -- Invoice info (if exists)
        i.id as invoice_id,
        i.invoice_number,
        i.payment_method as invoice_payment_method,
        i.payment_splits as invoice_payment_splits,
        -- Receipt info (if exists)
        r.id as receipt_id,
        r.receipt_number,
        r.payment_method as receipt_payment_method,
        r.payment_splits as receipt_payment_splits
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN invoices i ON i.order_id = o.id AND (i.invoice_type = 'invoice' OR i.invoice_type IS NULL)
      LEFT JOIN receipts r ON r.order_id = o.id
      WHERE o.status = 'completed'
        AND DATE(o.completed_at) = CURRENT_DATE
      ORDER BY o.completed_at DESC
    `;

    const result = await query(sql);

    // Transform results to include document info
    return result.rows.map((row: any) => {
      let document: { type: 'invoice' | 'receipt'; id: number; number: string; paymentMethod?: string; paymentSplits?: any } | undefined;

      if (row.invoiceId) {
        document = {
          type: 'invoice',
          id: row.invoiceId,
          number: row.invoiceNumber,
          paymentMethod: row.invoicePaymentMethod,
          paymentSplits: row.invoicePaymentSplits,
        };
      } else if (row.receiptId) {
        document = {
          type: 'receipt',
          id: row.receiptId,
          number: row.receiptNumber,
          paymentMethod: row.receiptPaymentMethod,
          paymentSplits: row.receiptPaymentSplits,
        };
      }

      return {
        id: row.id,
        orderNumber: row.orderNumber,
        customerId: row.customerId,
        customerName: row.customerName,
        totalAmount: row.totalAmount,
        status: row.status,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        itemCount: row.itemCount,
        document,
      };
    });
  }
}
