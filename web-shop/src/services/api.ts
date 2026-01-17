import type { Product, Order, Customer, Invoice, InvoiceForPrint, SellerInfo } from '../types';

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
      body: JSON.stringify({ email, password, source: 'shop' }),
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

  // Invoices
  async getMyInvoices(): Promise<{ invoices: Invoice[] }> {
    const response = await fetch(API_URL + '/shop/my-invoices', {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Get single invoice with full data for printing
  async getMyInvoice(invoiceId: number): Promise<{ invoice: InvoiceForPrint; sellerInfo: SellerInfo }> {
    const response = await fetch(API_URL + "/shop/my-invoices/" + invoiceId, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async downloadInvoicePdf(invoiceId: number): Promise<void> {
    const token = localStorage.getItem('shop_token');
    const response = await fetch(API_URL + '/shop/my-invoices/' + invoiceId + '/pdf', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Błąd pobierania faktury' }));
      throw new Error(error.error || 'HTTP error ' + response.status);
    }

    // Get filename from Content-Disposition header if available
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'faktura.pdf';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
      if (match) {
        filename = match[1];
      }
    }

    // Download the file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
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
  // Scan barcode
  async scanBarcode(barcode: string): Promise<{ product: any }> {
    const response = await fetch(API_URL + "/shop/scan/" + encodeURIComponent(barcode), {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getCustomers(): Promise<{ customers: Array<{ id: number; name: string; customerCode?: string; nip?: string; city?: string }> }> {
    const response = await fetch(API_URL + '/shop/customers', {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Cart persistence API
  async getCart(): Promise<{ cart: Array<{ product: any; quantity: number }> }> {
    const response = await fetch(API_URL + "/shop/cart", {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async saveCart(cart: Array<{ product: any; quantity: number }>): Promise<{ success: boolean }> {
    const response = await fetch(API_URL + "/shop/cart", {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify({ cart }),
    });
    return this.handleResponse(response);
  }

  async clearCartApi(): Promise<{ success: boolean }> {
    const response = await fetch(API_URL + "/shop/cart", {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }
}

export const api = new ApiService();
