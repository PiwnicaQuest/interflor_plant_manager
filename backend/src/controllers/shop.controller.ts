import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProductModel } from '../models/Product';
import { OrderModel } from '../models/Order';
import { CustomerModel } from '../models/Customer';
import { UserModel } from '../models/User';
import { SettingsModel } from "../models/Settings";
import { InvoiceModel } from '../models/Invoice';
import { UserRole } from '../types';
import { query } from '../models/database';
import { generateInvoicePDF } from '../utils/pdfGenerator';

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

      // Get customer if authenticated (for price calculation)
      let customerId: number | undefined;
      let priceGroupName: string | undefined;
      if (req.user) {
        // For customer users, get their customer record
        if (req.user.role === UserRole.CUSTOMER) {
          const customer = await CustomerModel.getByUserId(req.user.userId);
          customerId = customer?.id;
          if (customer?.priceGroupId) {
            const pgResult = await query<{ name: string }>(
              'SELECT name FROM price_groups WHERE id = $1',
              [customer.priceGroupId]
            );
            priceGroupName = pgResult.rows[0]?.name;
          }
        }
        // For employees, use base prices (no discount)
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

      // Filter out products with zero pallets (can't be purchased in shop)
      products = products.filter(p => p.palletCount > 0);

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
        // Fields that should be sorted numerically (prices from DB may come as strings)
        const numericFields = ['price', 'availableUnits', 'palletCount', 'unitsPerPallet', 'looseUnits'];
        const isNumericField = numericFields.includes(sortBy as string);

        products.sort((a, b) => {
          let aVal = (a as any)[sortBy as string] ?? 0;
          let bVal = (b as any)[sortBy as string] ?? 0;

          if (isNumericField) {
            // Convert to numbers for proper numeric comparison
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
            return (aVal - bVal) * order;
          }

          // String comparison for text fields
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

      // Get customer price if authenticated and is customer
      let price = product.basePriceGross;
      let priceGroupName: string | undefined;

      if (req.user && req.user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (customer) {
          price = await CustomerModel.getPriceForCustomer(customer.id, product.id);
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

      let whereClause: string;
      let params: any[];

      // For customer users - show orders for their customer record
      if (req.user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (!customer) {
          return res.status(404).json({ error: 'Dane klienta nie znalezione' });
        }
        whereClause = 'WHERE o.customer_id = $1';
        params = [customer.id];
      } else {
        // For employees - show orders they created
        whereClause = 'WHERE o.created_by_user_id = $1';
        params = [req.user.userId];
      }

      const result = await query<any>(
        `SELECT o.id, o.order_number as "orderNumber", o.status,
                o.total_amount as "totalAmount", o.customer_notes as "customerNotes",
                o.notes, o.created_at as "createdAt", o.updated_at as "updatedAt",
                o.completed_at as "completedAt",
                c.company_name as "customerName",
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
        LEFT JOIN customers c ON o.customer_id = c.id
        ${whereClause}
        GROUP BY o.id, c.company_name
        ORDER BY o.created_at DESC`,
        params
      );

      const orders = result.rows.map(row => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        totalAmount: row.totalAmount,
        customerNotes: row.customerNotes,
        customerName: row.customerName,
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
      const order = await OrderModel.getById(parseInt(id));

      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      // For customer users - check if order belongs to their customer
      if (req.user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (!customer) {
          return res.status(404).json({ error: 'Dane klienta nie znalezione' });
        }
        if (order.customerId !== customer.id) {
          return res.status(403).json({ error: 'Brak dostępu do tego zamówienia' });
        }
      } else {
        // For employees - check if they created this order
        if (order.createdByUserId !== req.user.userId) {
          return res.status(403).json({ error: 'Brak dostępu do tego zamówienia' });
        }
      }

      return res.json({ order });
    } catch (error) {
      console.error('Get my order error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async checkout(req: AuthRequest, res: Response) {
    try {
      const { items, customerNotes, customerId: requestedCustomerId } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Koszyk jest pusty' });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      let customer: any;

      // For customer users - use their linked customer record
      if (req.user.role === UserRole.CUSTOMER) {
        customer = await CustomerModel.getByUserId(req.user.userId);
        if (!customer) {
          return res.status(404).json({ error: 'Dane klienta nie znalezione' });
        }
      } else {
        // For employees - they must specify which customer to order for
        if (!requestedCustomerId) {
          return res.status(400).json({
            error: 'Jako pracownik musisz wybrać klienta dla którego składasz zamówienie',
            requiresCustomerSelection: true
          });
        }
        customer = await CustomerModel.getById(requestedCustomerId);
        if (!customer) {
          return res.status(404).json({ error: 'Wybrany klient nie istnieje' });
        }
      }

      // Create customer snapshot
      const customerSnapshot = {
        companyName: customer.companyName,
        customerCode: customer.customerCode,
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
        customerNotes,
        undefined,
        'shop'
      );

      return res.status(201).json({
        message: 'Zamówienie złożone',
        orderNumber: order.orderNumber,
        orderId: order.id,
        totalAmount: order.totalAmount,
        customerName: customer.companyName || `${customer.firstName} ${customer.lastName}`,
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

      // For customer users - return their customer profile
      if (req.user.role === UserRole.CUSTOMER) {
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
          userType: 'customer',
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
      }

      // For employees - return their user profile
      const user = await UserModel.getById(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      return res.json({
        userType: 'employee',
        employee: {
          id: user.id,
          email: user.email,
          role: user.role,
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

  static async getCustomersForShop(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      // Only for non-customer users (employees)
      if (req.user.role === UserRole.CUSTOMER) {
        return res.status(403).json({ error: 'Klienci nie potrzebują wybierać klienta' });
      }

      // Get active customers
      const result = await query<any>(`
        SELECT
          c.id,
          c.company_name as "companyName",
          c.customer_code as "customerCode",
          c.first_name as "firstName",
          c.last_name as "lastName",
          c.nip,
          c.city
        FROM customers c

        ORDER BY c.company_name, c.last_name
      `);

      return res.json({
        customers: result.rows.map(c => ({
          id: c.id,
          name: c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Bez nazwy',
          customerCode: c.customerCode,
          nip: c.nip,
          city: c.city,
        }))
      });
    } catch (error) {
      console.error('Get customers for shop error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  // ===== INVOICE METHODS FOR CUSTOMERS =====

  static async getMyInvoices(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Musisz być zalogowany' });
      }

      // Get customer ID for the authenticated user
      let customerId: number;

      if (req.user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (!customer) {
          return res.status(404).json({ error: 'Dane klienta nie znalezione' });
        }
        customerId = customer.id;
      } else {
        // Employees don't have invoices in customer panel
        return res.json({ invoices: [] });
      }

      // Get invoices for this customer (only regular invoices, not proforma)
      const invoices = await InvoiceModel.getAll({ customerId });

      // Format response
      const formattedInvoices = invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        orderId: inv.orderId,
        issueDate: inv.issueDate,
        saleDate: inv.saleDate,
        paymentDeadline: inv.paymentDeadline,
        paymentStatus: inv.paymentStatus,
        totalGross: inv.totalGross,
        paidAmount: inv.paidAmount,
        buyerName: inv.customerName ||
          (inv.buyerSnapshot as any)?.companyName ||
          `${(inv.buyerSnapshot as any)?.firstName || ''} ${(inv.buyerSnapshot as any)?.lastName || ''}`.trim(),
      }));

      return res.json({ invoices: formattedInvoices });
    } catch (error) {
      console.error('Get my invoices error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }


  // Get single invoice with full data for printing (HTML template)
  static async getMyInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Musisz być zalogowany" });
        return;
      }

      const invoiceId = parseInt(req.params.id);

      if (isNaN(invoiceId)) {
        res.status(400).json({ error: "Nieprawidłowe ID faktury" });
        return;
      }

      // Get customer ID for the authenticated user
      let customerId: number;

      if (req.user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (!customer) {
          res.status(404).json({ error: "Dane klienta nie znalezione" });
          return;
        }
        customerId = customer.id;
      } else {
        res.status(403).json({ error: "Brak dostępu" });
        return;
      }

      // Get invoice with items
      const invoice = await InvoiceModel.getById(invoiceId);

      if (!invoice) {
        res.status(404).json({ error: "Faktura nie znaleziona" });
        return;
      }

      // Verify invoice belongs to this customer
      if (invoice.customerId !== customerId) {
        res.status(403).json({ error: "Brak dostępu do tej faktury" });
        return;
      }

      // Get company settings for seller info
      const companySettings = await SettingsModel.getCompanySettings();

      // Get order number if order exists
      let orderNumber: string | undefined;
      if (invoice.orderId) {
        const order = await OrderModel.getById(invoice.orderId);
        orderNumber = order?.orderNumber;
      }

      // Format invoice data for template
      const invoiceData = {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        orderNumber,
        issueDate: invoice.issueDate,
        saleDate: invoice.saleDate,
        paymentDeadline: invoice.paymentDeadline,
        paymentMethod: invoice.paymentMethod,
        paymentSplits: invoice.paymentSplits,
        paymentStatus: invoice.paymentStatus,
        subtotalNet: invoice.subtotalNet,
        totalVat: invoice.totalVat,
        totalGross: invoice.totalGross,
        paidAmount: invoice.paidAmount,
        notes: invoice.notes,
        buyerInfo: invoice.buyerSnapshot ? {
          customerCode: invoice.buyerSnapshot.customerCode,
          companyName: invoice.buyerSnapshot.companyName,
          firstName: invoice.buyerSnapshot.firstName,
          lastName: invoice.buyerSnapshot.lastName,
          nip: invoice.buyerSnapshot.nip,
          address: invoice.buyerSnapshot.street,
          city: invoice.buyerSnapshot.city,
          postalCode: invoice.buyerSnapshot.postalCode,
        } : undefined,
        recipientInfo: invoice.recipientSnapshot ? {
          companyName: invoice.recipientSnapshot.companyName,
          firstName: invoice.recipientSnapshot.firstName,
          lastName: invoice.recipientSnapshot.lastName,
          address: invoice.recipientSnapshot.street,
          city: invoice.recipientSnapshot.city,
          postalCode: invoice.recipientSnapshot.postalCode,
          phone: invoice.recipientSnapshot.phone,
        } : undefined,
        items: invoice.items?.map(item => ({
          id: item.id,
          name: item.description || "Produkt",
          quantity: item.quantity,
          unit: "szt.",
          unitPriceNet: item.unitPriceNet,
          unitPriceGross: item.unitPriceNet * (1 + item.vatRate / 100),
          totalNet: item.totalNet,
          totalGross: item.totalGross,
          vatRate: item.vatRate,
          vatAmount: item.totalVat,
          growerPassport: item.growerPassport,
        })),
      };

      // Seller info from company settings
      const sellerInfo = {
        name: companySettings.companyName || "Firma",
        address: companySettings.street || "",
        city: companySettings.city || "",
        postalCode: companySettings.postalCode || "",
        nip: companySettings.nip || "",
        phone: companySettings.phone || undefined,
        email: companySettings.email || undefined,
        bankAccount: companySettings.bankAccount || undefined,
        bankName: companySettings.bankName || undefined,
        invoiceComment: companySettings.invoiceComment || undefined,
      };

      res.json({ invoice: invoiceData, sellerInfo });
    } catch (error) {
      console.error("Get my invoice error:", error);
      res.status(500).json({ error: "Błąd serwera" });
    }
  }
  static async getMyInvoicePdf(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Musisz być zalogowany' });
        return;
      }

      const invoiceId = parseInt(req.params.id);

      if (isNaN(invoiceId)) {
        res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        return;
      }

      // Get customer ID for the authenticated user
      let customerId: number;

      if (req.user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (!customer) {
          res.status(404).json({ error: 'Dane klienta nie znalezione' });
          return;
        }
        customerId = customer.id;
      } else {
        res.status(403).json({ error: 'Brak dostępu' });
        return;
      }

      // Get invoice with items
      const invoice = await InvoiceModel.getById(invoiceId);

      if (!invoice) {
        res.status(404).json({ error: 'Faktura nie znaleziona' });
        return;
      }

      // Verify invoice belongs to this customer
      if (invoice.customerId !== customerId) {
        res.status(403).json({ error: 'Brak dostępu do tej faktury' });
        return;
      }

      // Generate PDF
      const pdfDoc = await generateInvoicePDF(invoice);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Faktura_${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`);

      // Pipe PDF to response
      pdfDoc.pipe(res);
    } catch (error) {
      console.error('Get my invoice PDF error:', error);
      res.status(500).json({ error: 'Błąd serwera podczas generowania PDF' });
    }
  }

  // Scan barcode for shop customers
  static async scanBarcode(req: AuthRequest, res: Response) {
    try {
      const { barcode } = req.params;

      if (!barcode) {
        return res.status(400).json({ error: 'Kod kreskowy jest wymagany' });
      }

      // Get product by barcode
      const product = await ProductModel.getByBarcodeIncludingMerged(barcode);

      if (!product) {
        return res.status(404).json({ error: 'Produkt nie znaleziony' });
      }

      // Check if product is visible in shop
      if (!product.visibleInShop) {
        return res.status(404).json({ error: 'Produkt niedostepny w sklepie' });
      }

      // Get customer pricing
      let price = product.basePriceGross;
      let customerId: number | undefined;

      if (req.user && req.user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(req.user.userId);
        if (customer) {
          customerId = customer.id;
          price = await CustomerModel.getPriceForCustomer(customerId, product.id);
        }
      }

      return res.json({
        product: {
          id: product.id,
          plantName: product.plantName,
          potSize: product.potSize,
          plantHeightCm: product.plantHeightCm,
          unitsPerPallet: product.unitsPerPallet || 1,
          palletCount: product.palletCount,
          looseUnits: product.looseUnits,
          totalUnits: product.totalUnits,
          price: price,
          imageUrl: product.imageUrl,
          barcode: product.barcode,
        }
      });
    } catch (error) {
      console.error('Shop scan barcode error:', error);
      return res.status(500).json({ error: 'Blad serwera' });
    }
  }
}
