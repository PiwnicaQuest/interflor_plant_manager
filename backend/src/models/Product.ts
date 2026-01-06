import { query } from './database';
import { Product, InventoryMovement, MovementType } from '../types';

export class ProductModel {
  static async getAll(filters?: {
    status?: string;
    visibleInShop?: boolean;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    isArchived?: boolean | string;  // 'all' = show all, true = archived, false = active
  }): Promise<Product[]> {
    // Query with LEFT JOINs:
    // - order_items: to get total sold quantity
    // - grower_passports: to get passport number based on grower name
    let sql = `
      SELECT p.*,
             COALESCE(SUM(oi.quantity), 0)::integer as total_sold,
             COALESCE(gp_sub.grower, p.grower) as grower,
             gp_sub.passport_number as grower_passport
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN LATERAL (
        SELECT gp.grower_name as grower, gp.passport_number
        FROM grower_passports gp
        WHERE LTRIM(p.grower, '0') = gp.floricode
           OR p.grower = gp.floricode
           OR LOWER(p.grower) = LOWER(gp.grower_name)
        ORDER BY gp.id
        LIMIT 1
      ) gp_sub ON true
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by archived status (default: show only non-archived)
    // 'all' = show all products, true = archived only, false = active only
    if (filters?.isArchived === 'all') {
      // No filter - show all products (active and archived)
    } else if (filters?.isArchived !== undefined) {
      sql += ` AND p.is_archived = $${paramIndex}`;
      params.push(filters.isArchived === true || filters.isArchived === 'true');
      paramIndex++;
    } else {
      // By default, show only active (non-archived) products
      sql += ` AND (p.is_archived = false OR p.is_archived IS NULL)`;
    }

    if (filters?.status) {
      sql += ` AND p.inventory_status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.visibleInShop !== undefined) {
      sql += ` AND p.visible_in_shop = $${paramIndex}`;
      params.push(filters.visibleInShop);
      paramIndex++;
    }

    if (filters?.search) {
      sql += ` AND p.plant_name ILIKE $${paramIndex}`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // GROUP BY all product columns and grower_passport
    sql += ` GROUP BY p.id, gp_sub.grower, gp_sub.passport_number`;

    // Sortowanie
    const sortBy = filters?.sortBy || 'plant_name';
    const sortOrder = filters?.sortOrder || 'ASC';

    // Walidacja kolumn sortowania dla bezpieczeństwa
    const allowedSortColumns = ['plant_name', 'created_at', 'updated_at', 'pallet_count', 'total_units', 'base_price_gross', 'total_sold', 'archived_at'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'plant_name';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // For total_sold, we need to use the aggregate
    if (sortColumn === 'total_sold') {
      sql += ` ORDER BY COALESCE(SUM(oi.quantity), 0) ${order}`;
    } else {
      sql += ` ORDER BY p.${sortColumn} ${order}`;
    }

    const result = await query<Product>(sql, params);
    return result.rows;
  }

  static async getById(id: number): Promise<Product | null> {
    const result = await query<Product>(
      `SELECT p.*, COALESCE(gp_sub.grower, p.grower) as grower,
             gp_sub.passport_number as grower_passport
       FROM products p
       LEFT JOIN LATERAL (
         SELECT gp.grower_name as grower, gp.passport_number
         FROM grower_passports gp
         WHERE LTRIM(p.grower, '0') = gp.floricode
            OR p.grower = gp.floricode
            OR LOWER(p.grower) = LOWER(gp.grower_name)
         ORDER BY gp.id
         LIMIT 1
       ) gp_sub ON true
       WHERE p.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async getByBarcode(barcode: string): Promise<Product | null> {
    const result = await query<Product>(
      'SELECT * FROM products WHERE barcode = $1',
      [barcode]
    );
    return result.rows[0] || null;
  }

  static async create(data: Partial<Product>): Promise<Product> {
    const {
      barcode,
      plantName,
      potSize,
      plantHeightCm,
      plantPassport,
      palletCount,
      unitsPerPallet,
      purchasePricePln,
      pricePlus,
      basePriceGross,
      priceDiscount10,
      priceDiscount12,
      priceDiscount15,
      priceDiscount20,
      priceDiscount25,
      priceAuchan8,
      visibleInShop,
      imageUrl,
      deliveryDate,
      vatRate = 8.0,
      grower,
      createdAt,
    } = data;

    const result = await query<Product>(
      `INSERT INTO products (
        barcode, plant_name, pot_size, plant_height_cm, plant_passport,
        pallet_count, units_per_pallet, purchase_price_pln, price_plus,
        base_price_gross, price_discount_10, price_discount_12, price_discount_15,
        price_discount_20, price_discount_25, price_auchan8,
        visible_in_shop, image_url, delivery_date, vat_rate, grower, is_archived, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, false, COALESCE($22, NOW()))
      RETURNING *`,
      [
        barcode,
        plantName,
        potSize,
        plantHeightCm,
        plantPassport,
        palletCount || 0,
        unitsPerPallet || 0,
        purchasePricePln,
        pricePlus,
        basePriceGross,
        priceDiscount10,
        priceDiscount12,
        priceDiscount15,
        priceDiscount20,
        priceDiscount25,
        priceAuchan8,
        visibleInShop || false,
        imageUrl,
        deliveryDate,
        vatRate,
        grower || null,
        createdAt || null,
      ]
    );

    return result.rows[0];
  }

  static async update(id: number, data: Partial<Product>): Promise<Product | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'barcode',
      'plantName',
      'potSize',
      'plantHeightCm',
      'plantPassport',
      'palletCount',
      'unitsPerPallet',
      'looseUnits',
      'purchasePricePln',
      'pricePlus',
      'basePriceGross',
      'priceDiscount10',
      'priceDiscount12',
      'priceDiscount15',
      'priceDiscount20',
      'priceDiscount25',
      'priceAuchan8',
      'visibleInShop',
      'imageUrl',
      'deliveryDate',
      'vatRate',
      'grower',
      'tags',
      'createdAt',
    ];

    const columnMap: { [key: string]: string } = {
      plantName: 'plant_name',
      potSize: 'pot_size',
      plantHeightCm: 'plant_height_cm',
      plantPassport: 'plant_passport',
      palletCount: 'pallet_count',
      unitsPerPallet: 'units_per_pallet',
      looseUnits: 'loose_units',
      purchasePricePln: 'purchase_price_pln',
      pricePlus: 'price_plus',
      basePriceGross: 'base_price_gross',
      priceDiscount10: 'price_discount_10',
      priceDiscount12: 'price_discount_12',
      priceDiscount15: 'price_discount_15',
      priceDiscount20: 'price_discount_20',
      priceDiscount25: 'price_discount_25',
      priceAuchan8: 'price_auchan8',
      visibleInShop: 'visible_in_shop',
      imageUrl: 'image_url',
      deliveryDate: 'delivery_date',
      vatRate: 'vat_rate',
      grower: 'grower',
      tags: 'tags',
      createdAt: 'created_at',
    };

    const snakeToCamel = (str: string): string => {
      return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    };

    for (const [key, value] of Object.entries(data)) {
      const camelKey = snakeToCamel(key);

      if (allowedFields.includes(camelKey) && value !== undefined) {
        const columnName = columnMap[camelKey] || key;
        fields.push(`${columnName} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const sql = `UPDATE products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`;

    const result = await query<Product>(sql, values);
    return result.rows[0] || null;
  }

  static async delete(id: number): Promise<boolean> {
    // Najpierw usuń powiązane rekordy z innych tabel
    await query("DELETE FROM losses WHERE product_id = $1", [id]);
    await query("DELETE FROM inventory_movements WHERE product_id = $1", [id]);
    const result = await query('DELETE FROM products WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static async toggleVisibility(id: number): Promise<Product | null> {
    const result = await query<Product>(
      'UPDATE products SET visible_in_shop = NOT visible_in_shop, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  // Archive a product
  static async archive(id: number): Promise<Product | null> {
    const result = await query<Product>(
      'UPDATE products SET is_archived = true, archived_at = CURRENT_TIMESTAMP, visible_in_shop = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  // Restore a product from archive
  static async restore(id: number): Promise<Product | null> {
    const result = await query<Product>(
      'UPDATE products SET is_archived = false, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  // Auto-archive product if stock reaches 0
  static async autoArchiveIfZeroStock(id: number): Promise<boolean> {
    const product = await this.getById(id);
    if (!product) return false;

    // Calculate total units
    const totalUnits = (product.palletCount || 0) * (product.unitsPerPallet || 1) + (product.looseUnits || 0);

    // If stock is 0 or less and not already archived, archive it
    if (totalUnits <= 0 && !product.isArchived) {
      await query(
        'UPDATE products SET is_archived = true, archived_at = CURRENT_TIMESTAMP, visible_in_shop = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
      console.log(`Auto-archived product ID ${id} (${product.plantName}) - stock reached 0`);
      return true;
    }
    return false;
  }

  // Get counts for active and archived products
  static async getCounts(): Promise<{ active: number; archived: number; total: number }> {
    const result = await query<{ active: string; archived: string; total: string }>(
      `SELECT 
        COUNT(*) FILTER (WHERE is_archived = false OR is_archived IS NULL) as active,
        COUNT(*) FILTER (WHERE is_archived = true) as archived,
        COUNT(*) as total
      FROM products`
    );
    return {
      active: parseInt(result.rows[0].active) || 0,
      archived: parseInt(result.rows[0].archived) || 0,
      total: parseInt(result.rows[0].total) || 0,
    };
  }

static async getMovements(productId: number, limit = 50): Promise<InventoryMovement[]> {
    const result = await query<InventoryMovement>(
      `SELECT
        im.*,
        u.email as user_email,
        o.order_number,
        o.status as order_status,
        COALESCE(c.company_name, CONCAT(c.first_name, ' ', c.last_name)) as order_customer_name
       FROM inventory_movements im
       LEFT JOIN users u ON im.user_id = u.id
       LEFT JOIN orders o ON im.reference_type = 'order' AND im.reference_id = o.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE im.product_id = $1
       ORDER BY im.created_at DESC
       LIMIT $2`,
      [productId, limit]
    );
    return result.rows;
  }

  static async createMovement(
    productId: number,
    userId: number | null,
    movementType: MovementType,
    deltaUnits: number,
    deltaPallets: number,
    reason?: string,
    referenceType?: string,
    referenceId?: number
  ): Promise<InventoryMovement> {
    const result = await query<InventoryMovement>(
      `INSERT INTO inventory_movements (
        product_id, user_id, movement_type, delta_units, delta_pallets,
        reason, reference_type, reference_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [productId, userId, movementType, deltaUnits, deltaPallets, reason, referenceType, referenceId]
    );
    return result.rows[0];
  }

  static async getLowStockProducts(): Promise<Product[]> {
    const result = await query<Product>(
      "SELECT * FROM products WHERE inventory_status = 'low' AND (is_archived = false OR is_archived IS NULL) ORDER BY pallet_count ASC"
    );
    return result.rows;
  }

  // ============================================
  // PRODUCT MERGING METHODS
  // ============================================

  // Find similar products based on criteria:
  // - Same plant_name
  // - Same pot_size (exact match)
  // - plant_height_cm difference <= 5cm
  // - Not already merged (merged_into_id IS NULL)
  // - Not archived
  static async findSimilarProducts(): Promise<Array<{
    products: Product[];
    matchCriteria: {
      plantName: string;
      potSize: string;
      heightRange: { min: number; max: number };
      unitsPerPallet: number;
    };
  }>> {
    // First, get all active, non-merged products with height info
    const sql = `
      SELECT *
      FROM products
      WHERE (is_archived = false OR is_archived IS NULL)
        AND merged_into_id IS NULL
        AND plant_name IS NOT NULL
        AND pot_size IS NOT NULL
        AND plant_height_cm IS NOT NULL
      ORDER BY plant_name, pot_size, plant_height_cm
    `;

    const result = await query<Product>(sql);
    const products = result.rows;

    // Group similar products
    const groups: Array<{
      products: Product[];
      matchCriteria: {
        plantName: string;
        potSize: string;
        heightRange: { min: number; max: number };
      unitsPerPallet: number;
      };
    }> = [];

    // Track which products have been assigned to groups
    const assignedProductIds = new Set<number>();

    for (const product of products) {
      if (assignedProductIds.has(product.id)) continue;

      // Find all products that match this one
      const similarProducts = products.filter(p => {
        if (p.id === product.id || assignedProductIds.has(p.id)) return false;

        // Same name
        if (p.plantName !== product.plantName) return false;

        // Same pot size (exact match)
        if (p.potSize !== product.potSize) return false;
        // Same units per pallet
        if (p.unitsPerPallet !== product.unitsPerPallet) return false;

        // Height difference <= 10cm
        const heightDiff = Math.abs((p.plantHeightCm || 0) - (product.plantHeightCm || 0));
        if (heightDiff > 10) return false;

        return true;
      });

      // If we found similar products, create a group
      if (similarProducts.length > 0) {
        const groupProducts = [product, ...similarProducts];
        const heights = groupProducts.map(p => p.plantHeightCm || 0);

        groups.push({
          products: groupProducts,
          matchCriteria: {
            plantName: product.plantName || '',
            potSize: product.potSize || '',
            heightRange: {
              min: Math.min(...heights),
              max: Math.max(...heights),
            },
            unitsPerPallet: product.unitsPerPallet || 0,
          },
        });

        // Mark all these products as assigned
        groupProducts.forEach(p => assignedProductIds.add(p.id));
      }
    }

    return groups;
  }

  // Find products similar to a specific product
  static async findSimilarToProduct(productId: number): Promise<Product[]> {
    const product = await this.getById(productId);
    if (!product) return [];

    const sql = `
      SELECT *
      FROM products
      WHERE (is_archived = false OR is_archived IS NULL)
        AND merged_into_id IS NULL
        AND id != $1
        AND plant_name = $2
        AND pot_size = $3
        AND plant_height_cm IS NOT NULL
        AND ABS(COALESCE(plant_height_cm, 0) - $4) <= 5
      ORDER BY plant_height_cm
    `;

    const result = await query<Product>(sql, [
      productId,
      product.plantName,
      product.potSize,
      product.plantHeightCm || 0,
    ]);

    return result.rows;
  }

  // Merge products into master product
  // masterId - the product that will remain active
  // productIdsToMerge - products that will be merged into master
  static async mergeProducts(masterId: number, productIdsToMerge: number[]): Promise<{
    success: boolean;
    masterProduct?: Product;
    error?: string;
  }> {
    const masterProduct = await this.getById(masterId);
    if (!masterProduct) {
      return { success: false, error: 'Produkt główny nie znaleziony' };
    }

    // Get all products to merge
    const productsToMerge: Product[] = [];
    for (const id of productIdsToMerge) {
      const product = await this.getById(id);
      if (!product) {
        return { success: false, error: `Produkt ${id} nie znaleziony` };
      }
      if (product.mergedIntoId) {
        return { success: false, error: `Produkt ${id} jest już połączony z innym produktem` };
      }
      productsToMerge.push(product);
    }

    // VALIDATION: Check that all products have matching criteria
    for (const product of productsToMerge) {
      // Check plantName
      if (product.plantName !== masterProduct.plantName) {
        return {
          success: false,
          error: `Produkt #${product.id} (${product.plantName}) ma inną nazwę niż produkt główny (${masterProduct.plantName}). Łączenie różnych roślin jest niedozwolone.`
        };
      }
      // Check potSize
      if (product.potSize !== masterProduct.potSize) {
        return {
          success: false,
          error: `Produkt #${product.id} ma inny rozmiar doniczki (${product.potSize}) niż produkt główny (${masterProduct.potSize}).`
        };
      }
      // Check unitsPerPallet
      if (product.unitsPerPallet !== masterProduct.unitsPerPallet) {
        return {
          success: false,
          error: `Produkt #${product.id} ma inną ilość sztuk na palecie (${product.unitsPerPallet}) niż produkt główny (${masterProduct.unitsPerPallet}). Łączenie produktów z różnymi jednostkami jest niedozwolone.`
        };
      }
    }

    // Collect all barcodes
    const barcodesToAdd: string[] = [];
    for (const product of productsToMerge) {
      if (product.barcode) {
        barcodesToAdd.push(product.barcode);
      }
      // Also include any already merged barcodes from products being merged
      if (product.mergedBarcodes && product.mergedBarcodes.length > 0) {
        barcodesToAdd.push(...product.mergedBarcodes);
      }
    }

    // Calculate combined stock
    let totalPalletCount = masterProduct.palletCount || 0;
    let totalLooseUnits = masterProduct.looseUnits || 0;
    let totalUnits = masterProduct.totalUnits || 0;

    for (const product of productsToMerge) {
      totalPalletCount += product.palletCount || 0;
      totalLooseUnits += product.looseUnits || 0;
      totalUnits += product.totalUnits || 0;
    }

    // Use the highest price
    let bestPrice = masterProduct.basePriceGross || 0;
    for (const product of productsToMerge) {
      if ((product.basePriceGross || 0) > bestPrice) {
        bestPrice = product.basePriceGross || 0;
      }
    }

    // Get existing merged data from master
    const existingMergedBarcodes = masterProduct.mergedBarcodes || [];
    const existingMergedIds = masterProduct.mergedProductIds || [];

    // Combine all barcodes and IDs
    const allMergedBarcodes = [...new Set([...existingMergedBarcodes, ...barcodesToAdd])];
    const allMergedIds = [...new Set([...existingMergedIds, ...productIdsToMerge])];

    // Update master product with combined stock (including loose_units!)
    await query(
      `UPDATE products SET
        pallet_count = $1,
        loose_units = $2,
        base_price_gross = $3,
        merged_barcodes = $4,
        merged_product_ids = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6`,
      [
        totalPalletCount,
        totalLooseUnits,
        bestPrice,
        allMergedBarcodes,
        allMergedIds,
        masterId,
      ]
    );


    // Mark merged products and archive them
    for (const product of productsToMerge) {
      await query(
        `UPDATE products SET
          merged_into_id = $1,
          pallet_count = 0,
          loose_units = 0,
          visible_in_shop = false,
          is_archived = true,
          archived_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
        [masterId, product.id]
      );

      // Create inventory movement for merged product (stock moved out)
      const movedUnits = product.totalUnits || 0;
      if (movedUnits > 0) {
        await query(
          `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, delta_pallets, reason, reference_type, reference_id)
           VALUES ($1, NULL, 'merge', $2, $3, $4, 'product', $5)`,
          [product.id, -movedUnits, -(product.palletCount || 0), `Połączono z produktem #${masterId} (${masterProduct.plantName})`, masterId]
        );
      }
    }

    // Create inventory movement for master product (stock received)
    const totalAddedUnits = productsToMerge.reduce((sum, p) => sum + (p.totalUnits || 0), 0);
    const totalAddedPallets = productsToMerge.reduce((sum, p) => sum + (p.palletCount || 0), 0);
    if (totalAddedUnits > 0) {
      const mergedNames = productsToMerge.map(p => `#${p.id}`).join(', ');
      await query(
        `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, delta_pallets, reason, reference_type, reference_id)
         VALUES ($1, NULL, 'merge', $2, $3, $4, 'product', $5)`,
        [masterId, totalAddedUnits, totalAddedPallets, `Połączono produkty: ${mergedNames}`, masterId]
      );
    }

    // Return updated master product
    const updatedMaster = await this.getById(masterId);
    return { success: true, masterProduct: updatedMaster! };
  }

  // Unmerge a product from its master
  static async unmergeProduct(productId: number): Promise<{
    success: boolean;
    unmergedProduct?: Product;
    masterProduct?: Product;
    error?: string;
  }> {
    const product = await this.getById(productId);
    if (!product) {
      return { success: false, error: 'Produkt nie znaleziony' };
    }

    if (!product.mergedIntoId) {
      return { success: false, error: 'Ten produkt nie jest połączony z żadnym innym' };
    }

    const masterProduct = await this.getById(product.mergedIntoId);
    if (!masterProduct) {
      return { success: false, error: 'Produkt główny nie znaleziony' };
    }

    // Remove this product's barcode from master's merged_barcodes
    const updatedBarcodes = (masterProduct.mergedBarcodes || []).filter(
      (b: string) => b !== product.barcode
    );

    // Remove this product's ID from master's merged_product_ids
    const updatedMergedIds = (masterProduct.mergedProductIds || []).filter(
      (id: number) => id !== productId
    );

    // Update master product
    await query(
      `UPDATE products SET
        merged_barcodes = $1,
        merged_product_ids = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3`,
      [updatedBarcodes, updatedMergedIds, masterProduct.id]
    );

    // Unmerge the product
    await query(
      `UPDATE products SET
        merged_into_id = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
      [productId]
    );

    const unmergedProduct = await this.getById(productId);
    const updatedMaster = await this.getById(masterProduct.id);

    return {
      success: true,
      unmergedProduct: unmergedProduct!,
      masterProduct: updatedMaster!,
    };
  }

  // Get product by barcode including merged barcodes
  static async getByBarcodeIncludingMerged(barcode: string): Promise<Product | null> {
    // First try direct barcode match
    let result = await query<Product>(
      'SELECT * FROM products WHERE barcode = $1 AND merged_into_id IS NULL',
      [barcode]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }

    // If product is merged, return the master
    result = await query<Product>(
      `SELECT p2.*
       FROM products p1
       JOIN products p2 ON p1.merged_into_id = p2.id
       WHERE p1.barcode = $1`,
      [barcode]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }

    // Check in merged_barcodes array
    result = await query<Product>(
      'SELECT * FROM products WHERE $1 = ANY(merged_barcodes) AND merged_into_id IS NULL',
      [barcode]
    );

    return result.rows[0] || null;
  }

  // Get merged products for a master product
  static async getMergedProducts(masterId: number): Promise<Product[]> {
    const result = await query<Product>(
      'SELECT * FROM products WHERE merged_into_id = $1 ORDER BY plant_name',
      [masterId]
    );
    return result.rows;
  }

  // Bulk update tags for multiple products
  static async bulkUpdateTags(
    productIds: number[],
    tags: string[],
    mode: 'add' | 'replace' | 'remove'
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    for (const productId of productIds) {
      try {
        const product = await this.getById(productId);
        if (!product) {
          failed++;
          continue;
        }

        let newTags: string[];
        const currentTags = product.tags || [];

        switch (mode) {
          case 'add':
            // Add tags that don't exist yet
            newTags = [...new Set([...currentTags, ...tags])];
            break;
          case 'replace':
            // Replace all tags
            newTags = [...tags];
            break;
          case 'remove':
            // Remove specified tags
            newTags = currentTags.filter(t => !tags.includes(t));
            break;
          default:
            newTags = currentTags;
        }

        await query(
          'UPDATE products SET tags = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newTags, productId]
        );
        updated++;
      } catch (error) {
        console.error(`Error updating tags for product ${productId}:`, error);
        failed++;
      }
    }

    return { updated, failed };
  }
}
