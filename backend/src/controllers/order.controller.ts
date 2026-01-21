import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OrderModel } from '../models/Order';
import { CustomerModel } from '../models/Customer';
import { CreateOrderRequest, UpdateOrderStatusRequest, CancelOrderRequest, OrderStatus } from '../types';
import { generateOrderPdfDirect } from '../utils/orderPdfGenerator';
import { generateBulkOrdersPdf } from '../utils/orderBulkPdfGenerator';

export class OrderController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { status, customerId, customerName, customerCode, customerNip, startDate, endDate, source } = req.query;

      const filters: any = {};
      if (status) filters.status = status as OrderStatus;
      if (customerId) filters.customerId = parseInt(customerId as string);
      if (customerName) filters.customerName = customerName as string;
      if (customerCode) filters.customerCode = customerCode as string;
      if (customerNip) filters.customerNip = customerNip as string;
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;
      if (source) filters.source = source as string;

      const orders = await OrderModel.getAll(filters);

      return res.json({ orders });
    } catch (error: any) {
      console.error('Get orders error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      const order = await OrderModel.getById(id);

      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      return res.json({ order });
    } catch (error: any) {
      console.error('Get order error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }


  /**
   * GET /orders/bulk?ids=1,2,3
   * Get multiple orders in one request - optimized for bulk printing
   */
  static async getBulk(req: AuthRequest, res: Response) {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) {
        return res.status(400).json({ error: 'Parametr ids jest wymagany' });
      }

      const ids = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Brak prawidłowych ID zamówień' });
      }

      if (ids.length > 100) {
        return res.status(400).json({ error: 'Maksymalnie 100 zamówień na raz' });
      }

      const orders = await OrderModel.getByIds(ids);

      return res.json({ orders });
    } catch (error: any) {
      console.error('Get bulk orders error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const data: CreateOrderRequest = req.body;

      console.log('[ORDER CREATE] Received data:', JSON.stringify(data, null, 2));

      if (!data.customerId) {
        console.log('[ORDER CREATE] Validation failed:', {
          hasCustomerId: !!data.customerId,
          hasItems: !!data.items,
          itemsLength: data.items?.length || 0
        });
        return res.status(400).json({ error: 'Brak wymaganych pól' });
      }

      // Get customer data for snapshot
      const customer = await CustomerModel.getById(data.customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Klient nie znaleziony' });
      }

      const customerSnapshot = {
        customerCode: customer.customerCode,
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

      // Create recipient snapshot from customer's recipient data (if different delivery address is set)
      let recipientSnapshot = undefined;
      if (customer.recipientStreet) {
        recipientSnapshot = {
          companyName: customer.recipientCompanyName || '',
          firstName: customer.recipientFirstName || '',
          lastName: customer.recipientLastName || '',
          street: customer.recipientStreet,
          postalCode: customer.recipientPostalCode || '',
          city: customer.recipientCity || '',
          phone: customer.recipientPhone || '',
          country: 'Polska',
          email: '',
        };
      }
      // Get prices for each item - use custom price if provided, otherwise get from price group
      const itemsWithPrices = [];
      for (const item of (data.items || [])) {
        let price: number;

        // Check if custom unitPriceGross is provided and valid
        if (item.unitPriceGross !== undefined && item.unitPriceGross !== null && !isNaN(Number(item.unitPriceGross))) {
          // Use the custom price provided
          price = Number(item.unitPriceGross);
        } else {
          // Fall back to customer's price group
          price = await CustomerModel.getPriceForCustomer(data.customerId, item.productId);
        }

        itemsWithPrices.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceGross: price,
        });
      }

      const order = await OrderModel.create(
        data.customerId,
        itemsWithPrices,
        customerSnapshot,
        req.user?.userId,
        data.customerNotes,
        recipientSnapshot,
        data.source || 'panel'
      );

      return res.status(201).json({
        message: 'Zamówienie utworzone',
        orderNumber: order.orderNumber,
        orderId: order.id,
      });
    } catch (error: any) {
      console.error('Create order error:', error);
      // Pass through stock validation errors
      if (error.message && error.message.includes('Niewystarczający stan')) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { status, notes }: UpdateOrderStatusRequest = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Status jest wymagany' });
      }

      const order = await OrderModel.updateStatus(id, status, req.user?.userId, notes);

      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      return res.json({
        message: 'Status zmieniony',
        order,
      });
    } catch (error: any) {
      console.error('Update order status error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { items } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Brak pozycji zamówienia' });
      }

      // Get order to get customer ID
      const existingOrder = await OrderModel.getById(id);
      if (!existingOrder) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      // Process items - use custom price if provided, otherwise get from price group
      const itemsWithPrices = [];
      for (const item of items) {
        let price: number;

        // Check if custom unitPriceGross is provided and valid
        if (item.unitPriceGross !== undefined && item.unitPriceGross !== null && !isNaN(Number(item.unitPriceGross))) {
          // Use the custom price provided
          price = Number(item.unitPriceGross);
        } else {
          // Fall back to customer's price group
          price = await CustomerModel.getPriceForCustomer(existingOrder.customerId!, item.productId);
        }

        itemsWithPrices.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceGross: price,
        });
      }

      // Pass userId to updateItems for inventory movement tracking
      const order = await OrderModel.updateItems(id, itemsWithPrices, req.user?.userId);

      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      return res.json({
        message: 'Zamówienie zaktualizowane',
        order,
      });
    } catch (error: any) {
      console.error('Update order error:', error);
      // Pass through stock validation errors
      if (error.message && error.message.includes('Niewystarczający stan')) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getStatusHistory(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID zamówienia' });
      }

      const history = await OrderModel.getStatusHistory(id);

      return res.json({ history });
    } catch (error: any) {
      console.error('Get status history error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      const success = await OrderModel.delete(id);

      if (!success) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      return res.json({ message: 'Zamówienie usunięte' });
    } catch (error: any) {
      console.error('Delete order error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async cancelOrder(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { reason }: CancelOrderRequest = req.body;

      if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Powód anulowania jest wymagany' });
      }

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID zamówienia' });
      }

      const order = await OrderModel.cancel(id, reason, req.user?.userId);

      if (!order) {
        return res.status(404).json({ error: 'Zamówienie nie znalezione' });
      }

      return res.json({
        message: 'Zamówienie anulowane, stany magazynowe przywrócone',
        order,
      });
    } catch (error: any) {
      console.error('Cancel order error:', error);

      // Handle validation errors
      if (error.message && error.message.includes('Nie można anulować')) {
        return res.status(400).json({ error: error.message });
      }

      if (error.message && error.message.includes('jest już anulowane')) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async mergeOrders(req: AuthRequest, res: Response) {
    try {
      const masterOrderId = parseInt(req.params.id);
      const { orderIds }: { orderIds: number[] } = req.body;

      if (isNaN(masterOrderId)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID zamówienia głównego' });
      }

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: 'Brak zamówień do połączenia' });
      }

      // Validate orderIds are numbers
      const validOrderIds = orderIds.filter(id => typeof id === 'number' && !isNaN(id));
      if (validOrderIds.length !== orderIds.length) {
        return res.status(400).json({ error: 'Nieprawidłowe ID zamówień' });
      }

      // Cannot merge order with itself
      if (validOrderIds.includes(masterOrderId)) {
        return res.status(400).json({ error: 'Nie można połączyć zamówienia z samym sobą' });
      }

      const mergedOrder = await OrderModel.mergeOrders(
        masterOrderId,
        validOrderIds,
        req.user?.userId
      );

      return res.json({
        message: `Połączono ${validOrderIds.length} zamówień`,
        order: mergedOrder,
      });
    } catch (error: any) {
      console.error('Merge orders error:', error);

      // Handle validation errors
      if (error.message) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Błąd serwera podczas łączenia zamówień' });
    }
  }

  static async getByProductId(req: AuthRequest, res: Response) {
    try {
      const productId = parseInt(req.params.productId);
      if (isNaN(productId)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID produktu' });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const orders = await OrderModel.getByProductId(productId, limit);

      return res.json({ orders });
    } catch (error: any) {
      console.error('Get orders by product error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getPdf(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Nieprawidlowe ID zamowienia" });
      }

      const order = await OrderModel.getById(id);
      if (!order) {
        return res.status(404).json({ error: "Zamowienie nie znalezione" });
      }

      const doc = await generateOrderPdfDirect(order);
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=zamowienie-" + order.orderNumber + ".pdf");
      
      doc.pipe(res);
    } catch (error: any) {
      console.error("Generate order PDF error:", error);
      return res.status(500).json({ error: "Nie udalo sie wygenerowac PDF" });
    }
  }

  static async getBulkPdf(req: AuthRequest, res: Response) {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) {
        return res.status(400).json({ error: "Parametr ids jest wymagany" });
      }

      const ids = idsParam.split(",").map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
      if (ids.length === 0) {
        return res.status(400).json({ error: "Brak prawidlowych ID zamowien" });
      }

      const orders = await OrderModel.getByIds(ids);
      if (orders.length === 0) {
        return res.status(404).json({ error: "Nie znaleziono zamowien" });
      }

      const doc = await generateBulkOrdersPdf(orders);
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=zamowienia-bulk.pdf");
      
      doc.pipe(res);
    } catch (error: any) {
      console.error("Generate bulk orders PDF error:", error);
      return res.status(500).json({ error: "Nie udalo sie wygenerowac PDF" });
    }
  }
}
