import type { Product, Order, Customer } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

class ApiService {
  private getHeaders(includeAuth = true): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (includeAuth) {
      const token = localStorage.getItem('shop_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Błąd serwera' }));
      throw new Error(error.error || 'HTTP error ' + response.status);
    }
    return response.json();
  }

  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: unknown }> {
    const response = await fetch(API_URL + '/auth/login', {
      method: 'POST',
      headers: this.getHeaders(false),
      body: JSON.stringify({ email, password }),
    });
    return this.handleResponse(response);
  }

  async getMe(): Promise<{ user: unknown; customer?: Customer }> {
    const response = await fetch(API_URL + '/auth/me', {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Catalog
  async getCatalog(params?: {
    search?: string;
    potSize?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    tags?: string[];
  }): Promise<{
    products: Product[];
    filters: {
      potSizes: string[];
      categories: string[];
      usedTags: string[];
    };
    priceGroup: string
  }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.potSize) searchParams.set('potSize', params.potSize);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.tags && params.tags.length > 0) {
      searchParams.set('tags', params.tags.join(','));
    }

    const queryString = searchParams.toString();
    const url = API_URL + '/shop/catalog' + (queryString ? '?' + queryString : '');
    const response = await fetch(url, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getProduct(id: number): Promise<{ product: Product; priceGroup: string }> {
    const response = await fetch(API_URL + '/shop/products/' + id, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Orders
  async checkout(items: { productId: number; quantity: number }[], customerNotes?: string, customerId?: number): Promise<{
    message: string;
    orderNumber: string;
    orderId: number;
    totalAmount: number;
    customerName?: string;
  }> {
    const body: any = { items };
    if (customerNotes) body.customerNotes = customerNotes;
    if (customerId) body.customerId = customerId;
    
    const response = await fetch(API_URL + '/shop/cart/checkout', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse(response);
  }

  async getMyOrders(): Promise<{ orders: Order[] }> {
    const response = await fetch(API_URL + '/shop/my-orders', {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getMyOrder(id: number): Promise<{ order: Order }> {
    const response = await fetch(API_URL + '/shop/my-orders/' + id, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Profile
  async getProfile(): Promise<{ customer: Customer }> {
    const response = await fetch(API_URL + '/shop/profile', {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetch(API_URL + '/shop/change-password', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return this.handleResponse(response);
  }

  // Get customers for employee order placement
  async getCustomers(): Promise<{ customers: Array<{ id: number; name: string; customerCode?: string; nip?: string; city?: string }> }> {
    const response = await fetch(API_URL + '/shop/customers', {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }
}

export const api = new ApiService();
