import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProductModel } from '../models/Product';
import { SettingsModel } from '../models/Settings';
import { CreateProductRequest, UpdateProductRequest, MovementType, UserRole } from '../types';

export class InventoryController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { status, visibleInShop, search, isArchived } = req.query;

      const filters: any = {};
      if (status) filters.status = status;
      if (visibleInShop !== undefined) filters.visibleInShop = visibleInShop === 'true';
      if (search) filters.search = search;
      // Handle isArchived: 'all' = show all, 'true' = archived, 'false' = active
      if (isArchived !== undefined) {
        filters.isArchived = isArchived === 'all' ? 'all' : isArchived === 'true';
      }

      const products = await ProductModel.getAll(filters);

      // Get counts for tabs
      const counts = await ProductModel.getCounts();

      return res.json({ products, counts });
    } catch (error) {
      console.error('Get inventory error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const product = await ProductModel.getById(id);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      const movements = await ProductModel.getMovements(id, 50);

      return res.json({ product, movements });
    } catch (error) {
      console.error('Get product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const data: CreateProductRequest = req.body;

      if (!data.plantName || data.palletCount === undefined || data.unitsPerPallet === undefined || data.purchasePricePln === undefined) {
        return res.status(400).json({ error: 'Brak wymaganych pol' });
      }

      const pricingSettings = await SettingsModel.getPricingSettings();
      const { costPercentage, marginPercentage } = pricingSettings;

      let calculatedPrices = {
        pricePlus: null as number | null,
        basePriceGross: null as number | null,
        priceDiscount10: null as number | null,
        priceDiscount12: null as number | null,
        priceDiscount15: null as number | null,
        priceDiscount20: null as number | null,
        priceDiscount25: null as number | null,
      };

      if (data.purchasePricePln > 0) {
        calculatedPrices = SettingsModel.calculatePrices(data.purchasePricePln, costPercentage, marginPercentage, data.vatRate ?? 8.0);
      }

      const productData = {
        ...data,
        pricePlus: calculatedPrices.pricePlus ?? undefined,
        basePriceGross: calculatedPrices.basePriceGross ?? undefined,
        priceDiscount10: calculatedPrices.priceDiscount10 ?? undefined,
        priceDiscount12: calculatedPrices.priceDiscount12 ?? undefined,
        priceDiscount15: calculatedPrices.priceDiscount15 ?? undefined,
        priceDiscount20: calculatedPrices.priceDiscount20 ?? undefined,
        priceDiscount25: calculatedPrices.priceDiscount25 ?? undefined,
      };

      const product = await ProductModel.create(productData);

      if (product.totalUnits > 0) {
        await ProductModel.createMovement(
          product.id,
          req.user?.userId || null,
          MovementType.PURCHASE,
          product.totalUnits,
          product.palletCount,
          'Poczatkowy stan magazynowy'
        );
      }

      return res.status(201).json({
        message: 'Produkt dodany pomyslnie',
        productId: product.id,
        product,
      });
    } catch (error) {
      console.error('Create product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }
      const data: UpdateProductRequest = req.body;

      // Restrict price and quantity fields to admin only
      const adminOnlyFields = [
        'purchasePricePln', 'pricePlus', 'basePriceGross',
        'priceDiscount10', 'priceDiscount12', 'priceDiscount15', 'priceDiscount20', 'priceDiscount25',
        'priceAuchan8', 'vatRate',
        'palletCount', 'unitsPerPallet', 'totalUnits'
      ];
      if (req.user?.role !== UserRole.ADMIN) {
        for (const field of adminOnlyFields) {
          delete (data as any)[field];
        }
      }

      const existingProduct = await ProductModel.getById(id);

      if (!existingProduct) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      let updatedData = { ...data };

      // Sprawdź czy zmieniono cenę podstawową (basePriceGross)
      const basePriceChanged = data.basePriceGross !== undefined &&
        data.basePriceGross !== existingProduct.basePriceGross;

      // Sprawdź czy zmieniono stawkę VAT
      const vatRateChanged = data.vatRate !== undefined &&
        data.vatRate !== existingProduct.vatRate;

      // Sprawdź czy zmieniono pricePlus
      const pricePlusChanged = data.pricePlus !== undefined &&
        data.pricePlus !== existingProduct.pricePlus;

      // Sprawdź czy zmieniono rabaty ręcznie
      const isDiscountManualUpdate =
        data.priceDiscount10 !== undefined ||
        data.priceDiscount12 !== undefined ||
        data.priceDiscount15 !== undefined ||
        data.priceDiscount20 !== undefined ||
        data.priceDiscount25 !== undefined;

      // Jeśli zmieniono pricePlus - przelicz basePriceGross i rabaty
      if (pricePlusChanged && !basePriceChanged) {
        const pricingSettings = await SettingsModel.getPricingSettings();
        const { marginPercentage } = pricingSettings;
        const newPricePlus = data.pricePlus!;
        const vatRate = data.vatRate ?? existingProduct.vatRate ?? 8.0;

        // basePriceGross = pricePlus × (1 + vatRate%) × (1 + marża%)
        const newBasePrice = Math.round(newPricePlus * (1 + vatRate / 100) * (1 + marginPercentage / 100) * 100) / 100;

        updatedData = {
          ...updatedData,
          basePriceGross: newBasePrice,
          priceDiscount10: Math.round(newBasePrice * 0.90 * 100) / 100,
          priceDiscount12: Math.round(newBasePrice * 0.88 * 100) / 100,
          priceDiscount15: Math.round(newBasePrice * 0.85 * 100) / 100,
          priceDiscount20: Math.round(newBasePrice * 0.80 * 100) / 100,
          priceDiscount25: Math.round(newBasePrice * 0.75 * 100) / 100,
        };
      }

      // Jeśli zmieniono tylko stawkę VAT - przelicz basePriceGross i rabaty od pricePlus
      if (vatRateChanged && !pricePlusChanged && !basePriceChanged && !isDiscountManualUpdate) {
        const pricingSettings = await SettingsModel.getPricingSettings();
        const { marginPercentage } = pricingSettings;
        const newVatRate = data.vatRate!;
        const pricePlus = existingProduct.pricePlus;

        if (pricePlus && pricePlus > 0) {
          // basePriceGross = pricePlus × (1 + vatRate%) × (1 + marża%)
          const newBasePrice = Math.round(pricePlus * (1 + newVatRate / 100) * (1 + marginPercentage / 100) * 100) / 100;

          updatedData = {
            ...updatedData,
            basePriceGross: newBasePrice,
            priceDiscount10: Math.round(newBasePrice * 0.90 * 100) / 100,
            priceDiscount12: Math.round(newBasePrice * 0.88 * 100) / 100,
            priceDiscount15: Math.round(newBasePrice * 0.85 * 100) / 100,
            priceDiscount20: Math.round(newBasePrice * 0.80 * 100) / 100,
            priceDiscount25: Math.round(newBasePrice * 0.75 * 100) / 100,
          };
        }
      }

      // Jeśli zmieniono basePriceGross i nie podano ręcznie rabatów - przelicz rabaty
      if (basePriceChanged && !isDiscountManualUpdate) {
        const newBasePrice = data.basePriceGross!;
        updatedData = {
          ...updatedData,
          priceDiscount10: Math.round(newBasePrice * 0.90 * 100) / 100,
          priceDiscount12: Math.round(newBasePrice * 0.88 * 100) / 100,
          priceDiscount15: Math.round(newBasePrice * 0.85 * 100) / 100,
          priceDiscount20: Math.round(newBasePrice * 0.80 * 100) / 100,
          priceDiscount25: Math.round(newBasePrice * 0.75 * 100) / 100,
        };
      }

      // Jeśli zmieniono cenę zakupu i nie zmieniono żadnych cen ręcznie - przelicz wszystko
      if (data.purchasePricePln !== undefined &&
          data.purchasePricePln !== existingProduct.purchasePricePln &&
          !basePriceChanged && !pricePlusChanged && !isDiscountManualUpdate) {
        const pricingSettings = await SettingsModel.getPricingSettings();
        const { costPercentage, marginPercentage } = pricingSettings;

        if (data.purchasePricePln > 0) {
          const calculatedPrices = SettingsModel.calculatePrices(data.purchasePricePln, costPercentage, marginPercentage, data.vatRate ?? existingProduct.vatRate ?? 8.0);
          updatedData = {
            ...updatedData,
            pricePlus: calculatedPrices.pricePlus,
            basePriceGross: calculatedPrices.basePriceGross,
            priceDiscount10: calculatedPrices.priceDiscount10,
            priceDiscount12: calculatedPrices.priceDiscount12,
            priceDiscount15: calculatedPrices.priceDiscount15,
            priceDiscount20: calculatedPrices.priceDiscount20,
            priceDiscount25: calculatedPrices.priceDiscount25,
          };
        }
      }


      if (data.totalUnits !== undefined && data.totalUnits !== existingProduct.totalUnits) {
        const unitsPerPallet = data.unitsPerPallet || existingProduct.unitsPerPallet;
        const newPalletCount = Math.floor(data.totalUnits / unitsPerPallet);
        const newLooseUnits = data.totalUnits % unitsPerPallet;
        updatedData.palletCount = newPalletCount;
        updatedData.looseUnits = newLooseUnits;

        const deltaUnits = data.totalUnits - existingProduct.totalUnits;
        const deltaPallets = newPalletCount - existingProduct.palletCount;

        await ProductModel.createMovement(
          id,
          req.user?.userId || null,
          MovementType.CORRECTION,
          deltaUnits,
          deltaPallets,
          'Reczna korekta ilosci'
        );
      }
      else if (data.palletCount !== undefined && data.palletCount !== existingProduct.palletCount) {
        const deltaUnits = (data.palletCount * (data.unitsPerPallet || existingProduct.unitsPerPallet)) - existingProduct.totalUnits;
        const deltaPallets = data.palletCount - existingProduct.palletCount;

        await ProductModel.createMovement(
          id,
          req.user?.userId || null,
          MovementType.CORRECTION,
          deltaUnits,
          deltaPallets,
          'Korekta stanu magazynowego'
        );
      }

      const product = await ProductModel.update(id, updatedData);

      // Auto-archive if stock reached 0 after update
      if (product) {
        await ProductModel.autoArchiveIfZeroStock(id);
      }

      return res.json({
        message: 'Produkt zaktualizowany',
        product,
      });
    } catch (error) {
      console.error('Update product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const success = await ProductModel.delete(id);

      if (!success) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      return res.json({ message: 'Produkt usuniety' });
    } catch (error) {
      console.error('Delete product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async toggleVisibility(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const product = await ProductModel.toggleVisibility(id);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      return res.json({
        message: 'Widocznosc zmieniona',
        visibleInShop: product.visibleInShop,
        product,
      });
    } catch (error) {
      console.error('Toggle visibility error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Archive a product
  static async archive(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const product = await ProductModel.archive(id);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      return res.json({
        message: 'Produkt zarchiwizowany',
        product,
      });
    } catch (error) {
      console.error('Archive product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Restore a product from archive
  static async restore(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const product = await ProductModel.restore(id);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      return res.json({
        message: 'Produkt przywrocony z archiwum',
        product,
      });
    } catch (error) {
      console.error('Restore product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getLowStock(req: AuthRequest, res: Response) {
    try {
      const products = await ProductModel.getLowStockProducts();
      return res.json({ products });
    } catch (error) {
      console.error('Get low stock error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async scanBarcode(req: AuthRequest, res: Response) {
    try {
      const { barcode: rawBarcode } = req.body;
      const barcode = String(rawBarcode || "").trim();

      if (!barcode) {
        return res.status(400).json({ error: 'Kod kreskowy jest wymagany' });
      }

      const product = await ProductModel.getByBarcodeIncludingMerged(barcode);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      const movements = await ProductModel.getMovements(product.id, 50, ['purchase', 'order']);

      return res.json({ product, recentMovements: movements });
    } catch (error) {
      console.error('Scan barcode error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async recalculateAllPrices(req: AuthRequest, res: Response) {
    try {
      const pricingSettings = await SettingsModel.getPricingSettings();
      const { costPercentage, marginPercentage } = pricingSettings;

      const products = await ProductModel.getAll({});
      let updated = 0;

      for (const product of products) {
        if (product.purchasePricePln && product.purchasePricePln > 0) {
          const calculatedPrices = SettingsModel.calculatePrices(
            product.purchasePricePln,
            costPercentage,
            marginPercentage,
            product.vatRate ?? 8.0
          );

          await ProductModel.update(product.id, {
            pricePlus: calculatedPrices.pricePlus,
            basePriceGross: calculatedPrices.basePriceGross,
            priceDiscount10: calculatedPrices.priceDiscount10,
            priceDiscount12: calculatedPrices.priceDiscount12,
            priceDiscount15: calculatedPrices.priceDiscount15,
            priceDiscount20: calculatedPrices.priceDiscount20,
            priceDiscount25: calculatedPrices.priceDiscount25,
          });

          updated++;
        }
      }

      return res.json({
        message: 'Zaktualizowano ceny dla ' + updated + ' produktów',
        updated,
        total: products.length,
      });
    } catch (error) {
      console.error('Recalculate prices error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // ============================================
  // PRODUCT MERGING ENDPOINTS
  // ============================================

  // Get all groups of similar products
  static async getSimilarProducts(_req: AuthRequest, res: Response) {
    try {
      const groups = await ProductModel.findSimilarProducts();

      return res.json({
        groups,
        totalGroups: groups.length,
        message: `Znaleziono ${groups.length} grup podobnych produktów`,
      });
    } catch (error) {
      console.error('Get similar products error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Get products similar to a specific product
  static async getSimilarToProduct(req: AuthRequest, res: Response) {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const product = await ProductModel.getById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      const similarProducts = await ProductModel.findSimilarToProduct(productId);

      return res.json({
        product,
        similarProducts,
        count: similarProducts.length,
      });
    } catch (error) {
      console.error('Get similar to product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Merge products
  // Merge products with automatic master selection
  static async mergeProducts(req: AuthRequest, res: Response) {
    try {
      const { productIds, masterDate } = req.body;

      if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
        return res.status(400).json({
          error: 'Wymagane co najmniej 2 produkty do połączenia (productIds)',
        });
      }

      const result = await ProductModel.mergeProductsAuto(
        productIds,
        req.user?.userId || null,
        masterDate || null
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({
        message: 'Produkty zostały połączone',
        masterProduct: result.masterProduct,
        mergedCount: result.mergedCount,
        masterReason: result.masterReason,
        dateChanged: result.dateChanged,
      });
    } catch (error) {
      console.error('Merge products error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Get slave product details
  static async getSlaveDetails(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const slaveId = parseInt(id);

      if (isNaN(slaveId)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID produktu' });
      }

      const result = await ProductModel.getSlaveDetails(slaveId);

      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      return res.json(result.slave);
    } catch (error) {
      console.error('Get slave details error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }
  // Unmerge a product
  // Get merge history
  static async getMergeHistory(req: AuthRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const history = await ProductModel.getMergeHistory(limit);
      return res.json({ history });
    } catch (error) {
      console.error("Get merge history error:", error);
      return res.status(500).json({ error: "Błąd serwera" });
    }
  }


  static async unmergeProduct(req: AuthRequest, res: Response) {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const result = await ProductModel.unmergeProduct(productId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Create movement record for the unmerge
      await ProductModel.createMovement(
        productId,
        req.user?.userId || null,
        MovementType.CORRECTION,
        0,
        0,
        `Rozłączono produkt od produktu głównego ID: ${result.masterProduct?.id}`
      );

      return res.json({
        message: 'Produkt został rozłączony',
        unmergedProduct: result.unmergedProduct,
        masterProduct: result.masterProduct,
      });
    } catch (error) {
      console.error('Unmerge product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Get merged products for a master product
  static async getMergedProducts(req: AuthRequest, res: Response) {
    try {
      const masterId = parseInt(req.params.id);
      if (isNaN(masterId)) { return res.status(400).json({ error: "Niepoprawne ID produktu" }); }

      const masterProduct = await ProductModel.getById(masterId);
      if (!masterProduct) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      const mergedProducts = await ProductModel.getMergedProducts(masterId);

      return res.json({
        masterProduct,
        mergedProducts,
        mergedBarcodes: masterProduct.mergedBarcodes || [],
        count: mergedProducts.length,
      });
    } catch (error) {
      console.error('Get merged products error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Modified scanBarcode to include merged barcodes
  static async scanBarcodeWithMerged(req: AuthRequest, res: Response) {
    try {
      const { barcode: rawBarcode } = req.body;
      const barcode = String(rawBarcode || "").trim();

      if (!barcode) {
        return res.status(400).json({ error: 'Kod kreskowy jest wymagany' });
      }

      const product = await ProductModel.getByBarcodeIncludingMerged(barcode);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      const movements = await ProductModel.getMovements(product.id, 50, ['purchase', 'order']);

      // Check if this was a merged barcode lookup
      const wasMergedLookup = product.barcode !== barcode;

      return res.json({
        product,
        recentMovements: movements,
        wasMergedLookup,
        originalBarcode: wasMergedLookup ? barcode : undefined,
      });
    } catch (error) {
      console.error('Scan barcode error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // Bulk update tags for multiple products
  static async bulkUpdateTags(req: AuthRequest, res: Response) {
    try {
      const { productIds, tags, mode } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: 'Lista produktów jest wymagana' });
      }

      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Lista tagow jest wymagana' });
      }

      if (!['add', 'replace', 'remove'].includes(mode)) {
        return res.status(400).json({ error: 'Nieprawidlowy tryb. Dozwolone: add, replace, remove' });
      }

      const result = await ProductModel.bulkUpdateTags(productIds, tags, mode);

      return res.json({
        success: true,
        message: `Zaktualizowano tagi dla ${result.updated} produktów`,
        updated: result.updated,
        failed: result.failed,
      });
    } catch (error) {
      console.error('Bulk update tags error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }
}
