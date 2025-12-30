import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProductModel } from '../models/Product';
import { OrderModel } from '../models/Order';
import { CustomerModel } from '../models/Customer';
import { UserModel } from '../models/User';
import { SettingsModel } from "../models/Settings";
import { query } from '../models/database';

export class ShopController {
  static async getCatalog(req: AuthRequest, res: Response) {
    try {
      const { search, potSize, minPrice, maxPrice, sortBy, sortOrder, tags } = req.query;

      // Get only visible products
      const filters: any = {
        visibleInShop: true,
      };

      if (search) {
        filters.search = search;
      }

      const allProducts = await ProductModel.getAll(filters);

      // Get customer if authenticated
      let customerId: number | undefined;
      let priceGroupName: string | undefined;
      if (req.user) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        customerId = customer?.id;
        // Get price group name
        if (customer?.priceGroupId) {
          const pgResult = await query<{ name: string }>(
            'SELECT name FROM price_groups WHERE id = $1',
            [customer.priceGroupId]
          );
          priceGroupName = pgResult.rows[0]?.name;
        }
      }

      // Format products with prices based on customer's price group
      let products = await Promise.all(
        allProducts.map(async (product) => {
          let price = product.basePriceGross;

          if (customerId) {
            price = await CustomerModel.getPriceForCustomer(customerId, product.id);
          }

          return {
            id: product.id,
            plantName: product.plantName,
            potSize: product.potSize,
            plantHeightCm: product.plantHeightCm,
            imageUrl: product.imageUrl,
            price: price,
            availableUnits: product.totalUnits,
            palletCount: product.palletCount,
            unitsPerPallet: product.unitsPerPallet,
            looseUnits: product.looseUnits,
            grower: product.grower,
            barcode: product.barcode,
            tags: product.tags || [],
          };
        })
      );

      // Filter by potSize
      if (potSize) {
        products = products.filter(p => p.potSize === potSize);
      }

      // Filter by tags
      if (tags) {
        const tagArray = typeof tags === 'string' ? tags.split(',') : (tags as string[]);
        products = products.filter(p => {
          const productTags = p.tags || [];
          return tagArray.some(tag => productTags.includes(tag));
        });
      }

      // Filter by price range
      if (minPrice) {
        products = products.filter(p => p.price >= parseFloat(minPrice as string));
      }
      if (maxPrice) {
        products = products.filter(p => p.price <= parseFloat(maxPrice as string));
      }

      // Sort products
      if (sortBy) {
        const order = sortOrder === 'desc' ? -1 : 1;
        products.sort((a, b) => {
          const aVal = (a as any)[sortBy as string] ?? 0;
          const bVal = (b as any)[sortBy as string] ?? 0;
          if (typeof aVal === 'string') {
            return aVal.localeCompare(bVal) * order;
          }
          return (aVal - bVal) * order;
        });
      }

      // Get unique pot sizes for filter
      const potSizes = Array.from(new Set(allProducts.map(p => p.potSize).filter(Boolean)));

      // Get all unique tags from products (for filter display)
      const allTags = Array.from(new Set(
        allProducts.flatMap(p => p.tags || [])
      )).sort();

      // Get defined tags from settings for categories (dynamic)
      let availableCategories: string[];
      try {
        const definedTagsSetting = await SettingsModel.getSetting('available_tags');
        if (definedTagsSetting) {
          availableCategories = Array.isArray(definedTagsSetting) 
            ? definedTagsSetting 
            : JSON.parse(definedTagsSetting);
        } else {
          availableCategories = allTags;
        }
      } catch (parseError) {
        console.error('Error parsing available_tags setting:', parseError);
        availableCategories = allTags;
      }

      return res.json({
        products,
        filters: {
          potSizes,
          categories: availableCategories,
          usedTags: allTags, // Tags actually used in products
        },
        priceGroup: priceGroupName || 'podstawowa',
      });
    } catch (error) {
      console.error('Get catalog error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getProduct(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const product = await ProductModel.getById(parseInt(id));

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      if (!product.visibleInShop) {
        return res.status(404).json({ error: 'Produkt niedostępny' });
      }

      // Get customer price if authenticated
      let price = product.basePriceGross;
      let priceGroupName: string | undefined;

      if (req.user) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (customer) {
          price = await CustomerModel.getPriceForCustomer(customer.id, product.id);
          // Get price group name
          if (customer.priceGroupId) {
            const pgResult = await query<{ name: string }>(
              'SELECT name FROM price_groups WHERE id = $1',
              [customer.priceGroupId]
            );
            priceGroupName = pgResult.rows[0]?.name;
          }
        }
      }

      return res.json({
        product: {
          id: product.id,
          plantName: product.plantName,
          potSize: product.potSize,
          plantHeightCm: product.plantHeightCm,
          imageUrl: product.imageUrl,
          price: price,
          availableUnits: product.totalUnits,
          palletCount: product.palletCount,
          unitsPerPallet: product.unitsPerPallet,
          looseUnits: product.looseUnits,
          grower: product.grower,
          barcode: product.barcode,
          plantPassport: product.plantPassport,
        },
        priceGroup: priceGroupName || 'podstawowa',
      });
    } catch (error) {
      console.error('Get product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getMyOrders(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      const customer = await CustomerModel.getByUserId(req.user.userId);
      if (!customer) {
        return res.status(404).json({ error: 'Dane klienta nie znalezione' });
      }

      // Get orders for this customer
      const result = await query<any>(
        `SELECT o.*,
          json_agg(
            json_build_object(
              'id', oi.id,
              'productId', oi.product_id,
              'productSnapshot', oi.product_snapshot,
              'quantity', oi.quantity,
              'unitPriceGross', oi.unit_price_gross,
              'totalPrice', oi.total_price
            )
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.customer_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
        [customer.id]
      );

      const orders = result.rows.map(row => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        totalAmount: row.totalAmount,
        customerNotes: row.customerNotes,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        completedAt: row.completedAt,
        items: row.items.filter((item: any) => item.id !== null),
      }));

      return res.json({ orders });
    } catch (error) {
      console.error('Get my orders error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getMyOrder(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      const { id } = req.params;

      const customer = await CustomerModel.getByUserId(req.user.userId);
      if (!customer) {
        return res.status(404).json({ error: 'Dane klienta nie znalezione' });
      }

      const order = await OrderModel.getById(parseInt(id));

      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      // Check if this order belongs to this customer
      if (order.customerId !== customer.id) {
        return res.status(403).json({ error: 'Brak dostępu do tego zamówienia' });
      }

      return res.json({ order });
    } catch (error) {
      console.error('Get my order error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async checkout(req: AuthRequest, res: Response) {
    try {
      const { items, customerNotes } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Koszyk jest pusty' });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      // Get customer
      const customer = await CustomerModel.getByUserId(req.user.userId);
      if (!customer) {
        return res.status(404).json({ error: 'Dane klienta nie znalezione' });
      }

      // Create customer snapshot
      const customerSnapshot = {
        companyName: customer.companyName,
        firstName: customer.firstName,
        lastName: customer.lastName,
        nip: customer.nip,
        street: customer.street,
        postalCode: customer.postalCode,
        city: customer.city,
        country: customer.country,
        phone: customer.phone,
        email: customer.email,
      };

      // Validate items and get prices
      const itemsWithPrices = [];
      for (const item of items) {
        // Validate product exists and has enough stock
        const product = await ProductModel.getById(item.productId);
        if (!product) {
          return res.status(400).json({ error: `Produkt ID ${item.productId} nie istnieje` });
        }
        if (!product.visibleInShop) {
          return res.status(400).json({ error: `Produkt "${product.plantName}" nie jest dostępny w sklepie` });
        }
        // Validate that quantity is a multiple of unitsPerPallet (pallets only)
        const unitsPerPallet = product.unitsPerPallet || 1;
        if (item.quantity % unitsPerPallet !== 0) {
          return res.status(400).json({
            error: `Można zamawiać tylko pełne palety. Produkt "${product.plantName}" - 1 paleta = ${unitsPerPallet} szt.`
          });
        }
        const availablePallets = product.palletCount || 0;
        const requestedPallets = item.quantity / unitsPerPallet;
        if (requestedPallets > availablePallets) {
          return res.status(400).json({
            error: `Niewystarczająca ilość palet produktu "${product.plantName}". Dostępne: ${availablePallets} palet, zamówiono: ${requestedPallets} palet`
          });
        }

        const price = await CustomerModel.getPriceForCustomer(customer.id, item.productId);
        itemsWithPrices.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceGross: price,
        });
      }

      // Create order
      const order = await OrderModel.create(
        customer.id,
        itemsWithPrices,
        customerSnapshot,
        req.user.userId,
        customerNotes
      );

      return res.status(201).json({
        message: 'Zamówienie złożone',
        orderNumber: order.orderNumber,
        orderId: order.id,
        totalAmount: order.totalAmount,
      });
    } catch (error) {
      console.error('Shop checkout error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getCustomerProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      const customer = await CustomerModel.getByUserId(req.user.userId);
      if (!customer) {
        return res.status(404).json({ error: 'Dane klienta nie znalezione' });
      }

      // Get price group name
      let priceGroupName = 'podstawowa';
      if (customer.priceGroupId) {
        const pgResult = await query<{ name: string, discount_percentage: number }>(
          'SELECT name, discount_percentage FROM price_groups WHERE id = $1',
          [customer.priceGroupId]
        );
        if (pgResult.rows[0]) {
          priceGroupName = pgResult.rows[0].name;
        }
      }

      return res.json({
        customer: {
          id: customer.id,
          companyName: customer.companyName,
          firstName: customer.firstName,
          lastName: customer.lastName,
          nip: customer.nip,
          street: customer.street,
          postalCode: customer.postalCode,
          city: customer.city,
          country: customer.country,
          phone: customer.phone,
          email: customer.email,
          priceGroup: priceGroupName,
        },
      });
    } catch (error) {
      console.error('Get customer profile error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async changeMyPassword(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Obecne hasło i nowe hasło są wymagane' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Nowe hasło musi mieć minimum 6 znaków' });
      }

      // Get user
      const user = await UserModel.getById(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      // Verify current password
      const isValid = await UserModel.verifyPassword(user, currentPassword);
      if (!isValid) {
        return res.status(400).json({ error: 'Obecne hasło jest nieprawidłowe' });
      }

      // Change password
      const success = await UserModel.changePassword(req.user.userId, newPassword);
      if (!success) {
        return res.status(500).json({ error: 'Błąd zmiany hasła' });
      }

      return res.json({ message: 'Hasło zostało zmienione pomyślnie' });
    } catch (error) {
      console.error('Change my password error:', error);
      return res.status(500).json({ error: 'Błąd zmiany hasła' });
    }
  }
}
