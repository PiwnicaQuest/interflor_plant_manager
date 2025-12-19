import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OrderModel } from '../models/Order';
import { CustomerModel } from '../models/Customer';
import { CreateOrderRequest, UpdateOrderStatusRequest, CancelOrderRequest, OrderStatus } from '../types';

export class OrderController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { status, customerId } = req.query;

      const filters: any = {};
      if (status) filters.status = status as OrderStatus;
      if (customerId) filters.customerId = parseInt(customerId as string);

      const orders = await OrderModel.getAll(filters);

      return res.json({ orders });
    } catch (error) {
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
    } catch (error) {
      console.error('Get order error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const data: CreateOrderRequest = req.body;

      console.log('[ORDER CREATE] Received data:', JSON.stringify(data, null, 2));

      if (!data.customerId || !data.items || data.items.length === 0) {
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

      // Get prices for each item based on customer's price group
      const itemsWithPrices = [];
      for (const item of data.items) {
        const price = await CustomerModel.getPriceForCustomer(data.customerId, item.productId);
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
        data.customerNotes
      );

      return res.status(201).json({
        message: 'Zamówienie utworzone',
        orderNumber: order.orderNumber,
        orderId: order.id,
      });
    } catch (error) {
      console.error('Create order error:', error);
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
    } catch (error) {
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

      // Get prices for each item based on customer's price group
      const itemsWithPrices = [];
      for (const item of items) {
        const price = await CustomerModel.getPriceForCustomer(existingOrder.customerId!, item.productId);
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
    } catch (error) {
      console.error('Update order error:', error);
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
    } catch (error) {
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
    } catch (error) {
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
}
