import axios, { AxiosInstance } from 'axios';
import type { AuthResponse, Product, Order, OrderWithItems, Customer, Invoice, Proforma, Receipt, ReceiptWithItems, InventoryMovement, OrderStatusHistoryItem, SalesReport, TopProduct, RevenueSummary, User, CreateUserRequest, UpdateUserRequest, ChangePasswordRequest, PriceGroup, CreatePriceGroupRequest, UpdatePriceGroupRequest, MovementType, PaymentMethod, PermissionProfile, PermissionCategories, CreatePermissionProfileRequest, UpdatePermissionProfileRequest, MergeHistoryEntry, InvoiceCorrection, InvoiceCorrectionWithItems } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Helper to convert snake_case to camelCase
function snakeToCamel(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // Convert numeric strings to numbers (but not long strings like barcodes - JS loses precision for numbers > 15 digits)
  if (typeof obj === 'string' && /^\d+\.?\d*$/.test(obj) && obj.length <= 15) {
    const num = parseFloat(obj);
    if (!isNaN(num)) return num;
  }

  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);

  const camelObj: any = {};
  for (const key in obj) {
    // Updated regex to handle both letters and digits after underscore
    const camelKey = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
    camelObj[camelKey] = snakeToCamel(obj[key]);
  }
  return camelObj;
}

// Helper to convert camelCase to snake_case
function camelToSnake(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(camelToSnake);

  const snakeObj: any = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    snakeObj[snakeKey] = camelToSnake(obj[key]);
  }
  return snakeObj;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // Convert request data from camelCase to snake_case
      if (config.data) {
        config.data = camelToSnake(config.data);
      }
      return config;
    });

    // Handle 401 errors and convert response from snake_case to camelCase
    this.client.interceptors.response.use(
      (response) => {
        // Skip conversion for binary responses (Blob, ArrayBuffer)
        if (response.data instanceof Blob || response.data instanceof ArrayBuffer) {
          return response;
        }
        // Convert response data from snake_case to camelCase
        if (response.data) {
          response.data = snakeToCamel(response.data);
        }
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          const code = error.response?.data?.code;
          if (code === 'SESSION_INVALIDATED') {
            localStorage.setItem('logoutReason', 'session_kicked');
          }
          localStorage.removeItem('token');
          localStorage.removeItem('userPermissions');
          localStorage.removeItem('userRole');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // ============================================
  // AUTH
  // ============================================

  async login(email: string, password: string, source?: 'panel' | 'shop' | 'scanner'): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', { email, password, source });
    return response.data;
  }

  async register(data: any): Promise<any> {
    const response = await this.client.post('/auth/register', data);
    return response.data;
  }

  async me(): Promise<{ user: any; customer?: Customer }> {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } catch {
      // Ignore errors - we're logging out anyway
    }
  }

  // ============================================
  // INVENTORY
  // ============================================

  async getInventory(filters?: { status?: string; visibleInShop?: boolean; search?: string; sortBy?: string; sortOrder?: string; isArchived?: boolean | 'all' }): Promise<{ products: Product[]; counts?: { active: number; archived: number; total: number } }> {
    const response = await this.client.get('/inventory', { params: filters });
    return response.data;
  }

  async getProduct(id: number): Promise<{ product: Product; movements: InventoryMovement[] }> {
    const response = await this.client.get(`/inventory/${id}`);
    return response.data;
  }

  async createProduct(data: Partial<Product>): Promise<{ message: string; productId: number; product: Product }> {
    const response = await this.client.post('/inventory', data);
    return response.data;
  }

  async updateProduct(id: number, data: Partial<Product>): Promise<{ message: string; product: Product }> {
    const response = await this.client.put(`/inventory/${id}`, data);
    return response.data;
  }

  async bulkUpdateTags(productIds: number[], tags: string[], mode: "add" | "replace" | "remove"): Promise<{ success: boolean; message: string; updated: number }> {
    const response = await this.client.post("/inventory/bulk-tags", { productIds, tags, mode });
    return response.data;
  }

  async deleteProduct(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/inventory/${id}`);
    return response.data;
  }

  async toggleProductVisibility(id: number): Promise<{ message: string; visibleInShop: boolean; product: Product }> {
    const response = await this.client.patch(`/inventory/${id}/toggle-visibility`);
    return response.data;
  }

  async getLowStockProducts(): Promise<{ products: Product[] }> {
    const response = await this.client.get('/inventory/low-stock');
    return response.data;
  }

  async importCSV(file: File, marginPercent?: number, basePriceMargin?: number): Promise<{ message: string; result: { success: number; failed: number; errors: Array<{ row: number; error: string; data?: any }> } }> {
    const formData = new FormData();
    formData.append('file', file);
    if (marginPercent !== undefined) {
      formData.append('marginPercent', marginPercent.toString());
    }
    if (basePriceMargin !== undefined) {
      formData.append('basePriceMargin', basePriceMargin.toString());
    }

    const response = await this.client.post('/inventory/import-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async downloadCSVTemplate(): Promise<Blob> {
    const response = await this.client.get('/inventory/csv-template', {
      responseType: 'blob',
    });
    return response.data;
  }

  // ============================================
  // ORDERS (TODO: implement on backend)
  // ============================================

  async getOrders(filters?: { status?: string; customerId?: number; customerName?: string; customerCode?: string; customerNip?: string; startDate?: string; endDate?: string;
    search?: string; source?: string }): Promise<{ orders: Order[] }> {
    const response = await this.client.get('/orders', { params: filters });
    return response.data;
  }

  async getOrdersByProduct(productId: number, limit?: number): Promise<{ orders: any[] }> {
    const response = await this.client.get(`/orders/by-product/${productId}`, { params: { limit } });
    return response.data;
  }

  async getOrder(id: number): Promise<{ order: OrderWithItems }> {
    const response = await this.client.get(`/orders/${id}`);
    return response.data;
  }

  async getOrdersBulk(ids: number[]): Promise<{ orders: OrderWithItems[] }> {
    const response = await this.client.get('/orders/bulk', { 
      params: { ids: ids.join(',') }
    });
    return response.data;
  }



  async createOrder(data: {
    customerId: number;
    items: Array<{ productId: number; quantity: number; palletCount?: number; unitsPerPallet?: number }>;
    customerNotes?: string;
    useCustomRecipient?: boolean;
    recipientCompanyName?: string;
    recipientFirstName?: string;
    recipientLastName?: string;
    recipientStreet?: string;
    recipientPostalCode?: string;
    recipientCity?: string;
    recipientPhone?: string;
    source?: 'shop' | 'scanner' | 'panel';
  }): Promise<{ message: string; orderNumber: string; orderId: number }> {
    const response = await this.client.post("/orders", data);
    return response.data;
  }

  async updateOrderStatus(id: number, status: string, notes?: string): Promise<{ message: string; order: Order }> {
    const response = await this.client.patch(`/orders/${id}/status`, { status, notes });
    return response.data;
  }

  async updateOrder(id: number, data: { items: Array<{ productId: number; quantity: number }> }): Promise<{ message: string; order: OrderWithItems }> {
    const response = await this.client.put(`/orders/${id}`, data);
    return response.data;
  }

  async getOrderStatusHistory(id: number): Promise<{ history: OrderStatusHistoryItem[] }> {
    const response = await this.client.get(`/orders/${id}/status-history`);
    return response.data;
  }

  async cancelOrder(id: number, reason: string): Promise<{ message: string; order: Order }> {
    const response = await this.client.patch(`/orders/${id}/cancel`, { reason });
    return response.data;
  }

  async mergeOrders(masterOrderId: number, orderIds: number[]): Promise<{ message: string; order: OrderWithItems }> {
    const response = await this.client.post(`/orders/${masterOrderId}/merge`, { orderIds });
    return response.data;
  }

  // Order items - single item operations for scanner
  async addOrderItem(orderId: number, item: { productId: number; quantity: number; unitPriceGross: number; palletCount?: number; unitsPerPallet?: number }): Promise<any> {
    const response = await this.client.post(`/orders/${orderId}/items`, item);
    return response.data;
  }

  async updateOrderItem(orderId: number, itemId: number, data: { quantity?: number; palletCount?: number; unitsPerPallet?: number }): Promise<any> {
    const response = await this.client.put(`/orders/${orderId}/items/${itemId}`, data);
    return response.data;
  }

  async deleteOrderItem(orderId: number, itemId: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/orders/${orderId}/items/${itemId}`);
    return response.data;
  }

  // ============================================
  // CUSTOMERS (TODO: implement on backend)
  // ============================================

  async getCustomers(): Promise<{ customers: Customer[] }> {
    const response = await this.client.get('/customers');
    return response.data;
  }

  async getCustomer(id: number): Promise<{ customer: Customer; hasShopAccount?: boolean; shopAccountEmail?: string | null }> {
    const response = await this.client.get(`/customers/${id}`);
    return response.data;
  }

  async createCustomer(data: Partial<Customer>): Promise<{ message: string; customerId: number }> {
    const response = await this.client.post('/customers', data);
    return response.data;
  }

  async updateCustomer(id: number, data: Partial<Customer>): Promise<{ message: string; customer: Customer }> {
    const response = await this.client.put(`/customers/${id}`, data);
    return response.data;
  }

  async getCustomerWithShopInfo(id: number): Promise<{ customer: Customer; hasShopAccount: boolean; shopAccountEmail: string | null }> {
    const response = await this.client.get(`/customers/${id}`);
    return response.data;
  }

  async createShopAccount(customerId: number, password?: string): Promise<{ message: string; email: string; password: string; userId: number }> {
    const response = await this.client.post(`/customers/${customerId}/shop-account`, { password });
    return response.data;
  }

  async removeShopAccount(customerId: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/customers/${customerId}/shop-account`);
    return response.data;
  }

  async resetShopPassword(customerId: number, password?: string): Promise<{ message: string; password: string }> {
    const response = await this.client.post(`/customers/${customerId}/shop-account/reset-password`, { password });
    return response.data;
  }

  async sendShopCredentialsEmail(customerId: number, password: string): Promise<{ message: string; email: string }> {
    const response = await this.client.post(`/customers/${customerId}/shop-account/send-credentials`, { password });
    return response.data;
  }

  async getCustomerRelatedData(id: number): Promise<{ customerId: number; customerName: string; hasShopAccount: boolean; orderCount: number; invoiceCount: number }> {
    const response = await this.client.get(`/customers/${id}/related-data`);
    return response.data;
  }

  async permanentlyDeleteCustomer(id: number): Promise<{ message: string; deletedCustomerName: string; deletedUserAccount: boolean; affectedData: { ordersUnlinked: number; invoicesUnlinked: number } }> {
    const response = await this.client.delete(`/customers/${id}/permanent`);
    return response.data;
  }

  async lookupNIP(nip: string): Promise<any> {
    const response = await this.client.post('/customers/lookup-nip', { nip });
    return response.data;
  }

  // ============================================
  // INVOICES (TODO: implement on backend)
  // ============================================

  async getInvoices(filters?: { startDate?: string; endDate?: string;
    search?: string; customerId?: number; paymentStatus?: string; paymentMethod?: string }): Promise<{ invoices: Invoice[] }> {
    const response = await this.client.get('/invoices', { params: filters });
    return response.data;
  }

  async getInvoice(id: number): Promise<{ invoice: Invoice }> {
    const response = await this.client.get(`/invoices/${id}`);
    return response.data;
  }

    async getInvoicePdf(id: number): Promise<Blob> {
    const response = await this.client.get(`/invoices/${id}/pdf`, { responseType: "blob" });
    return response.data;
  }

  async getReceiptPdf(id: number): Promise<Blob> {
    const response = await this.client.get(`/receipts/${id}/pdf`, { responseType: "blob" });
    return response.data;
  }

  async getProformaPdf(id: number): Promise<Blob> {
    const response = await this.client.get(`/proforma/${id}/pdf`, { responseType: "blob" });
    return response.data;
  }

  async getOrderPdf(id: number): Promise<Blob> {
    const response = await this.client.get(`/orders/${id}/pdf`, { responseType: "blob" });
    return response.data;
  }

  async getOrdersBulkPdf(ids: number[]): Promise<Blob> {
    const response = await this.client.get(`/orders/bulk/pdf?ids=${ids.join(",")}`, { responseType: "blob" });
    return response.data;
  }

  async getInvoiceHtml(id: number): Promise<string> {
    const response = await this.client.get(`/invoices/${id}/html?t=${Date.now()}`, { responseType: "text" });
    return response.data;
  }

  async createInvoice(data: {
    orderId: number;
    paymentMethod: string;
    paymentDeadline: string;
  }): Promise<{ message: string; invoiceNumber: string; invoiceId: number }> {
    const response = await this.client.post('/invoices', data);
    return response.data;
  }

  async sendInvoiceEmail(id: number, options?: { email?: string; subject?: string; message?: string }): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post(`/invoices/${id}/send-email`, options || {});
    return response.data;
  }

  async updateInvoicePaymentStatus(id: number, paidAmount: number): Promise<{ message: string; invoice: Invoice }> {
    const response = await this.client.patch(`/invoices/${id}/payment-status`, { paidAmount });
    return response.data;
  }

  async updateInvoicePaymentMethod(id: number, paymentMethod: PaymentMethod): Promise<{ message: string; invoice: Invoice }> {
    const response = await this.client.patch(`/invoices/${id}/payment-method`, { paymentMethod });
    return response.data;
  }

  async getInvoiceAuditLog(id: number): Promise<{ auditLog: any[] }> {
    const response = await this.client.get(`/invoices/${id}/audit-log`);
    return response.data;
  }

  // ============================================
  // INVOICE CORRECTIONS
  // ============================================

  async getInvoiceCorrections(filters?: {
    startDate?: string;
    endDate?: string;
    originalInvoiceId?: number;
  }): Promise<InvoiceCorrection[]> {
    const response = await this.client.get("/invoice-corrections", { params: filters });
    return response.data;
  }

  async getInvoiceCorrection(id: number): Promise<InvoiceCorrectionWithItems> {
    const response = await this.client.get("/invoice-corrections/" + id);
    return response.data;
  }

  async getCorrectionsForInvoice(invoiceId: number): Promise<InvoiceCorrection[]> {
    const response = await this.client.get("/invoice-corrections/invoice/" + invoiceId);
    return response.data;
  }

  async createInvoiceCorrection(data: {
    originalInvoiceId: number;
    correctionReason: string;
    items: Array<{
      originalItemId?: number;
      description: string;
      originalQuantity: number;
      originalUnitPriceNet: number;
      originalUnitPriceGross: number;
      originalVatRate: number;
      originalTotalNet: number;
      originalTotalVat: number;
      originalTotalGross: number;
      correctedQuantity: number;
      correctedUnitPriceGross: number;
      correctedVatRate: number;
    }>;
  }): Promise<{ correctionId: number; correctionNumber: string }> {
    const response = await this.client.post("/invoice-corrections", data);
    return response.data;
  }

  async deleteInvoiceCorrection(id: number): Promise<{ success: boolean }> {
    const response = await this.client.delete("/invoice-corrections/" + id);
    return response.data;
  }

  async getInvoiceCorrectionHtml(id: number): Promise<string> {
    const response = await this.client.get("/invoice-corrections/" + id + "/html", { responseType: "text" });
    return response.data;
  }

  // ============================================
  // PROFORMA INVOICES
  // ============================================

  async getProformas(filters?: { startDate?: string; endDate?: string;
    search?: string; customerId?: number }): Promise<{ proformas: Proforma[] }> {
    const response = await this.client.get('/proforma', { params: filters });
    return response.data;
  }

  async getProforma(id: number): Promise<{ proforma: Proforma }> {
    const response = await this.client.get(`/proforma/${id}`);
    return response.data;
  }

  async getProformaHtml(id: number): Promise<string> {
    const response = await this.client.get(`/proforma/${id}/html`, { responseType: "text" });
    return response.data;
  }

  async createProforma(data: {
    customerId: number;
    items: Array<{ description: string; quantity: number; unitPriceNet: number; vatRate: number }>;
    validUntil?: string;
    notes?: string;
  }): Promise<{ message: string; proforma: Proforma }> {
    const response = await this.client.post('/proforma', data);
    return response.data;
  }

  async createProformaFromOrder(orderId: number, data?: {
    validUntil?: string;
    notes?: string;
  }): Promise<{ message: string; proforma: Proforma }> {
    const response = await this.client.post(`/proforma/from-order/${orderId}`, data || {});
    return response.data;
  }

  async convertProformaToInvoice(proformaId: number, data: {
    paymentMethod: PaymentMethod;
    paymentDeadline: string;
  }): Promise<{ message: string; invoice: Invoice }> {
    const response = await this.client.post(`/proforma/${proformaId}/convert`, data);
    return response.data;
  }

  async deleteProforma(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/proforma/${id}`);
    return response.data;
  }

  async getExpiringProformas(days: number = 7): Promise<{ proformas: Proforma[] }> {
    const response = await this.client.get('/proforma/expiring', { params: { days } });
    return response.data;
  }

  async getExpiredProformas(): Promise<{ proformas: Proforma[] }> {
    const response = await this.client.get('/proforma/expired');
    return response.data;
  }

  async cloneProforma(id: number): Promise<{ proforma: Proforma; message: string }> {
    const response = await this.client.post(`/proforma/${id}/clone`);
    return response.data;
  }

  async getProformaStats(): Promise<{
    total: number;
    byStatus: { draft: number; sent: number; accepted: number; expired: number; converted: number };
    conversionRate: number;
    totalValue: number;
    convertedValue: number;
    averageConversionTimeDays: number | null;
    last30Days: { total: number; converted: number; totalValue: number; convertedValue: number };
  }> {
    const response = await this.client.get('/proforma/stats');
    return response.data;
  }

  // ============================================
  // RECEIPTS
  // ============================================

  async getReceipts(filters?: { startDate?: string; endDate?: string }): Promise<{ receipts: Receipt[] }> {
    const response = await this.client.get('/receipts', { params: filters });
    return response.data;
  }

  // ============================================
  // POS (TODO: implement on backend)
  // ============================================

  async checkout(data: {
    orderId: number;
    paymentMethod?: string;
    paymentSplits?: Array<{ paymentMethod: string; amount: number }>;
    documentType: string;
    paymentDeadlineDays?: number;
    discountPercentage?: number;
    items?: Array<{ productId: number; quantity: number }>;
  }): Promise<{
    message: string;
    documentType: string;
    paymentDeadlineDays?: number;
    discountPercentage?: number;
    documentNumber: string;
    documentId: number;
    totalAmount: number;
    orderId?: number;
  }> {
    const response = await this.client.post('/pos/checkout', data);
    return response.data;
  }

  async getTodayCompletedOrders(): Promise<{
    orders: any[];
    summary: {
      totalTransactions: number;
      cashTotal: number;
      cardTotal: number;
      transferTotal: number;
      grandTotal: number;
    };
  }> {
    const response = await this.client.get('/pos/today-completed');
    return response.data;

  }
  async downloadDailyReportPDF(date?: string): Promise<Blob> {
    const params = date ? "?date=" + date : "";
    const response = await this.client.get("/pos/daily-report/pdf" + params, {
      responseType: "blob",
    });
    return response.data;
  }

  // ============================================
  // NIP LOOKUP
  // ============================================

  async lookupNip(nip: string): Promise<{
    nip: string;
    name: string;
    regon?: string;
    street?: string;
    houseNumber?: string;
    apartmentNumber?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    accountNumbers?: string[];
    statusVat: string;
    hasVirtualAccounts: boolean;
    voivodeship?: string;
    county?: string;
    commune?: string;
    companyType?: string;
    isActive?: boolean;
    source?: "GUS" | "MF";
  }> {
    const response = await this.client.get(`/nip/lookup/${nip}`);
    return response.data;
  }

  // ============================================
  // MOBILE
  // ============================================

  async scanBarcode(barcode: string): Promise<{ product: Product; recentMovements: InventoryMovement[] }> {
    const response = await this.client.post('/mobile/scan-barcode', { barcode });
    return response.data;
  }

  // ============================================
  // REPORTS
  // ============================================

  async getSalesReport(startDate: string, endDate: string, orderStatus: string = "all"): Promise<SalesReport> {
    const response = await this.client.get('/reports/sales', {
      params: { startDate, endDate, orderStatus }
    });
    return response.data;
  }

  async getTopProducts(startDate: string, endDate: string, limit: number = 10): Promise<{ products: TopProduct[] }> {
    const response = await this.client.get('/reports/top-products', {
      params: { startDate, endDate, limit }
    });
    return response.data;
  }

  async getRevenueSummary(startDate: string, endDate: string): Promise<RevenueSummary> {
    const response = await this.client.get('/reports/revenue', {
      params: { startDate, endDate }
    });
    return response.data;
  }

  async getOrderStatusStats(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get('/reports/orders/status-stats', {
      params: { startDate, endDate }
    });
    return response.data;
  }


  // ============================================
  // EMPLOYEE REPORTS
  // ============================================

  async getEmployeeSales(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/employees", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  async getEmployeeDailySales(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/employees/daily", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  // ============================================
  // CUSTOMER REPORTS
  // ============================================

  async getTopCustomers(startDate: string, endDate: string, limit: number = 20): Promise<any> {
    const response = await this.client.get("/reports/customers", {
      params: { startDate, endDate, limit }
    });
    return response.data;
  }

  async getCustomerStats(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/customers/stats", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  // ============================================
  // DOCUMENT TYPE REPORTS
  // ============================================

  async getDocumentTypeStats(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/documents", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  async getDocumentTypeDailyStats(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/documents/daily", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  // ============================================
  // PAYMENT REPORTS
  // ============================================

  async getPaymentStats(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/payments", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  async getAgingReport(): Promise<any> {
    const response = await this.client.get("/reports/payments/aging");
    return response.data;
  }

  async getPaymentMethodStats(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/payments/methods", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  async getOverdueInvoices(limit: number = 50): Promise<any> {
    const response = await this.client.get("/reports/payments/overdue", {
      params: { limit }
    });
    return response.data;
  }

  // ============================================
  // PRODUCT CATEGORY REPORTS
  // ============================================

  async getSalesByPotSize(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/products/by-pot-size", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  async getMonthlySalesTrend(months: number = 12): Promise<any> {
    const response = await this.client.get("/reports/trends/monthly", {
      params: { months }
    });
    return response.data;
  }

  // ============================================
  // KPI DASHBOARD
  // ============================================

  async getKPIComparison(startDate: string, endDate: string): Promise<any> {
    const response = await this.client.get("/reports/kpi", {
      params: { startDate, endDate }
    });
    return response.data;
  }

  // ============================================
  // USERS
  // ============================================

  async getUsers(): Promise<{ users: User[] }> {
    const response = await this.client.get('/users');
    return response.data;
  }

  async getUser(id: number): Promise<{ user: User }> {
    const response = await this.client.get(`/users/${id}`);
    return response.data;
  }

  async createUser(data: CreateUserRequest): Promise<{ message: string; userId: number; user: User }> {
    const response = await this.client.post('/users', data);
    return response.data;
  }

  async updateUser(id: number, data: UpdateUserRequest): Promise<{ message: string; user: User }> {
    const response = await this.client.put(`/users/${id}`, data);
    return response.data;
  }

  async deleteUser(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/users/${id}`);
    return response.data;
  }

  async toggleUserActive(id: number): Promise<{ message: string; isActive: boolean; user: User }> {
    const response = await this.client.patch(`/users/${id}/toggle-active`);
    return response.data;
  }

  async changeUserPassword(id: number, data: ChangePasswordRequest): Promise<{ message: string }> {
    const response = await this.client.patch(`/users/${id}/change-password`, data);
    return response.data;
  }


  async getUserRelatedData(id: number): Promise<{ userId: number; email: string; hasCustomer: boolean; orderCount: number; invoiceCount: number; movementCount: number }> {
    const response = await this.client.get(`/users/${id}/related-data`);
    return response.data;
  }

  async permanentlyDeleteUser(id: number): Promise<{ message: string; deletedEmail: string; deletedCustomer: boolean; affectedData: { ordersUnlinked: number; invoicesUnlinked: number; movementsUnlinked: number } }> {
    const response = await this.client.delete(`/users/${id}/permanent`);
    return response.data;
  }
  // ============================================
  // PRICE GROUPS
  // ============================================

  async getPriceGroups(): Promise<{ priceGroups: PriceGroup[] }> {
    const response = await this.client.get('/price-groups');
    return response.data;
  }

  async getPriceGroup(id: number): Promise<{ priceGroup: PriceGroup }> {
    const response = await this.client.get(`/price-groups/${id}`);
    return response.data;
  }

  async getPriceGroupCustomers(id: number): Promise<{ customers: Customer[] }> {
    const response = await this.client.get(`/price-groups/${id}/customers`);
    return response.data;
  }

  async createPriceGroup(data: CreatePriceGroupRequest): Promise<{ message: string; priceGroup: PriceGroup }> {
    const response = await this.client.post('/price-groups', data);
    return response.data;
  }

  async updatePriceGroup(id: number, data: UpdatePriceGroupRequest): Promise<{ message: string; priceGroup: PriceGroup }> {
    const response = await this.client.put(`/price-groups/${id}`, data);
    return response.data;
  }

  async deletePriceGroup(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/price-groups/${id}`);
    return response.data;
  }

  // ============================================
  // INVENTORY MOVEMENTS
  // ============================================

  async getInventoryMovements(filters?: {
    productId?: number;
    userId?: number;
    type?: MovementType;
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    movements: InventoryMovement[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }> {
    const response = await this.client.get('/inventory-movements', { params: filters });
    return response.data;
  }

  async getProductMovements(productId: number, limit = 50): Promise<{ movements: InventoryMovement[] }> {
    const response = await this.client.get(`/inventory-movements/product/${productId}`, {
      params: { limit }
    });
    return response.data;
  }

  async getInventoryMovementStatistics(filters?: {
    startDate?: string;
    endDate?: string;
    search?: string;
    productId?: number;
  }): Promise<{
    totalMovements: number;
    totalUnitsIn: number;
    totalUnitsOut: number;
    totalPalletsIn: number;
    totalPalletsOut: number;
    byType: Array<{ movementType: string; count: number; totalUnits: number }>;
  }> {
    const response = await this.client.get('/inventory-movements/statistics', { params: filters });
    return response.data;
  }


  async getAvailableMovementTypes(): Promise<{ types: string[] }> {
    const response = await this.client.get("/inventory-movements/types");
    return response.data;
  }

  async deleteInventoryMovement(id: number): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/inventory-movements/${id}`);
    return response.data;

  }
  async deleteInventoryMovements(ids: number[]): Promise<{ success: boolean; message: string; deletedCount: number }> {
    const response = await this.client.delete('/inventory-movements', { data: { ids } });
    return response.data;
  }

  // ============================================
  // SETTINGS
  // ============================================

  async getPricingSettings(): Promise<{ costPercentage: number; marginPercentage: number; eurToPlnRate: number }> {
    const response = await this.client.get('/settings/pricing');
    return response.data;
  }

  async updatePricingSettings(data: { costPercentage: number; marginPercentage: number; eurToPlnRate?: number }): Promise<{ message: string }> {
    const response = await this.client.put('/settings/pricing', data);
    return response.data;
  }

  // ============================================
  // COMPANY SETTINGS
  // ============================================

  async getCompanySettings(): Promise<{
    companyName: string;
    nip: string;
    regon: string;
    street: string;
    postalCode: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    website: string;
    bankName: string;
    bankAccount: string;
    bankSwift: string;
  }> {
    const response = await this.client.get('/settings/company');
    return response.data;
  }

  async updateCompanySettings(data: {
    companyName?: string;
    nip?: string;
    regon?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    website?: string;
    bankName?: string;
    bankAccount?: string;
    bankSwift?: string;
  }): Promise<{ message: string }> {
    const response = await this.client.put('/settings/company', data);
    return response.data;
  }

  // ============================================
  // EMAIL IMPORT SETTINGS
  // ============================================

  async getEmailImportSettings(): Promise<{
    emailAddress: string;
    emailPassword: string;
    imapServer: string;
    imapPort: number;
    smtpServer: string;
    smtpPort: number;
    smtpSecurity: 'none' | 'ssl' | 'starttls';
    enabled: boolean;
  }> {
    const response = await this.client.get('/settings/email-import');
    return response.data;
  }

  async updateEmailImportSettings(data: {
    emailAddress?: string;
    emailPassword?: string;
    imapServer?: string;
    imapPort?: number;
    smtpServer?: string;
    smtpPort?: number;
    smtpSecurity?: 'none' | 'ssl' | 'starttls';
    enabled?: boolean;
  }): Promise<{ message: string }> {
    const response = await this.client.put('/settings/email-import', data);
    return response.data;
  }

  // Manualna synchronizacja emaili
  async syncEmailImport(): Promise<{
    success: boolean;
    result?: {
      emailsFound: number;
      emailsProcessed: number;
      productsImported: number;
      productsUpdated: number;
      productsFailed: number;
      errors: string[];
    };
    error?: string;
  }> {
    const response = await this.client.post("/settings/email-import/sync");
    return response.data;
  }

  async syncEmailImportForce(): Promise<{
    success: boolean;
    result?: {
      emailsFound: number;
      emailsProcessed: number;
      productsImported: number;
      productsUpdated: number;
      productsFailed: number;
      errors: string[];
    };
    error?: string;
  }> {
    const response = await this.client.post("/settings/email-import/sync-force");
    return response.data;
  }

  // ============================================
  // PRINT SYSTEM
  // ============================================

  async getPrintConfigs(): Promise<{ configs: any[] }> {
    const response = await this.client.get('/print/configs');
    return response.data;
  }

  async updatePrintConfig(documentType: string, config: {
    agentId?: string | null;
    printerName?: string | null;
    paperSize?: string;
    copies?: number;
    orientation?: string;
    colorMode?: string;
    isActive?: boolean;
  }): Promise<{ config: any }> {
    const response = await this.client.put(`/print/configs/${documentType}`, config);
    return response.data;
  }

  async getPrintAgents(): Promise<{ agents: any[] }> {
    const response = await this.client.get('/print/agents');
    return response.data;
  }

  async deletePrintAgent(agentId: string): Promise<void> {
    await this.client.delete(`/print/agents/${agentId}`);
  }

  async getPrintStats(): Promise<{ stats: any; onlineAgents: number; agents: any[] }> {
    const response = await this.client.get('/print/stats');
    return response.data;
  }

  async createPrintJob(job: {
    documentType: string;
    paymentDeadlineDays?: number;
    discountPercentage?: number;
    contentType: string;
    content: string;
    title?: string;
    referenceId?: number;
    sourceType?: string;
    sourceId?: number;
  }): Promise<{ job: any }> {
    const response = await this.client.post('/print/jobs', job);
    return response.data;
  }

  async deleteOrder(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/orders/${id}`);
    return response.data;
  }

  async deleteOrders(ids: number[]): Promise<{ message: string; deletedCount: number }> {
    const response = await this.client.post('/orders/bulk-delete', { ids });
    return response.data;
  }

  // ============================================
  // ADDITIONAL INVENTORY METHODS
  // ============================================

  async importExcel(file: File, currency: "EUR" | "PLN" = "EUR"): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("currency", currency);
    // Use axios directly to avoid default Content-Type header from this.client
    const token = localStorage.getItem("token");
    const response = await axios.post(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/inventory/import-excel`, formData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }

  async uploadProductImage(id: number, file: File): Promise<{ imageUrl: string }> {
    const formData = new FormData();
    formData.append("image", file);
    // Use axios directly to avoid default Content-Type header from this.client
    const token = localStorage.getItem("token");
    const response = await axios.post(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/inventory/${id}/image`, formData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }

  async deleteProductImage(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/inventory/${id}/image`);
    return response.data;
  }

  async setProductImageUrl(id: number, imageUrl: string): Promise<{ imageUrl: string; product: any }> {
    const response = await this.client.put(`/inventory/${id}/image-url`, { imageUrl });
    return response.data;
  }

  async archiveProduct(id: number): Promise<{ message: string }> {
    const response = await this.client.patch(`/inventory/${id}/archive`);
    return response.data;
  }

  async restoreProduct(id: number): Promise<{ message: string }> {
    const response = await this.client.patch(`/inventory/${id}/restore`);
    return response.data;
  }

  // ============================================
  // ADDITIONAL RECEIPT METHODS
  // ============================================

  async getReceipt(id: number): Promise<{ receipt: ReceiptWithItems }> {
    const response = await this.client.get(`/receipts/${id}`);
    return response.data;
  }

  async getReceiptHtml(id: number): Promise<string> {
    const response = await this.client.get(`/receipts/${id}/html`, { responseType: "text" });
    return response.data;
  }

  async getOrderConfirmationHtml(orderId: number): Promise<string> {
    const response = await this.client.get(`/orders/${orderId}/confirmation-html`, { responseType: "text" });
    return response.data;
  }

  async updateReceipt(id: number, data: any): Promise<{ receipt: ReceiptWithItems }> {
    const response = await this.client.put(`/receipts/${id}`, data);
    return response.data;
  }

  async deleteReceipt(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/receipts/${id}`);
    return response.data;
  }

  async deleteReceiptsBulk(ids: number[]): Promise<{ message: string; deletedCount: number }> {
    const response = await this.client.delete("/receipts/bulk", { data: { ids } });
    return response.data;
  }

  // ============================================
  // PRINT TEMPLATES
  // ============================================

  async getPrintTemplates(type?: string): Promise<any[]> {
    const response = await this.client.get("/print-templates", { params: type ? { type } : {} });
    return response.data.templates || response.data;
  }

  async createPrintTemplate(data: any): Promise<any> {
    const response = await this.client.post("/print-templates", data);
    return response.data.template || response.data;
  }

  async updatePrintTemplate(id: number, data: any): Promise<{ template: any }> {
    const response = await this.client.put(`/print-templates/${id}`, data);
    return response.data;
  }

  async deletePrintTemplate(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/print-templates/${id}`);
    return response.data;
  }

  async setTemplateAsDefault(id: number): Promise<{ template: any }> {
    const response = await this.client.patch(`/print-templates/${id}/set-default`);
    return response.data;
  }

  async duplicatePrintTemplate(id: number): Promise<any> {
    const response = await this.client.post(`/print-templates/${id}/duplicate`);
    return response.data.template || response.data;
  }

  // ============================================
  // PRODUCT MERGING
  // ============================================

  async getMergedProducts(productId: number): Promise<any[]> {
    const response = await this.client.get(`/inventory/${productId}/merged`);
    return response.data;
  }

  async getSimilarProducts(): Promise<any> {
    const response = await this.client.get("/inventory/similar-products");
    return response.data;
  }

  async mergeProducts(productIds: number[], masterDate: string | null = null): Promise<any> {
    const response = await this.client.post("/inventory/merge", { productIds, masterDate });
    return response.data;
  }

  async getSlaveDetails(slaveId: number): Promise<any> {
    const response = await this.client.get(`/inventory/slave/${slaveId}`);
    return response.data;
  }

  async unmergeProduct(id: number): Promise<any> {
    const response = await this.client.post(`/inventory/${id}/unmerge`);
    return response.data;
  }


  async getMergeHistory(limit = 100): Promise<{ history: MergeHistoryEntry[] }> {
    const response = await this.client.get("/inventory/merge-history", { params: { limit } });
    return response.data;
  }
  // ============================================
  // LOSSES (STRATY)
  // ============================================

  async getLosses(filters?: { startDate?: string; endDate?: string;
    search?: string; productId?: number; showReversed?: boolean }): Promise<{ losses: any[]; totalValue: number; totalQuantity: number; count: number }> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.productId) params.append('productId', String(filters.productId));
    if (filters?.showReversed) params.append('showReversed', 'true');
    const response = await this.client.get(`/losses?${params.toString()}`);
    return response.data;
  }

  async createLoss(data: { productId: number; quantity: number; notes?: string }): Promise<any> {
    const response = await this.client.post('/losses', data);
    return response.data;
  }

  async reverseLoss(id: number): Promise<any> {
    const response = await this.client.post(`/losses/${id}/reverse`);
    return response.data;
  }

  async getLossStats(filters?: { startDate?: string; endDate?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const response = await this.client.get(`/losses/stats?${params.toString()}`);
    return response.data;
  }
  // ============================================
  // PERMISSION PROFILES
  // ============================================

  async getPermissionProfiles(): Promise<{ profiles: PermissionProfile[] }> {
    const response = await this.client.get('/permission-profiles');
    return response.data;
  }

  async getPermissionProfile(id: number): Promise<{ profile: PermissionProfile }> {
    const response = await this.client.get(`/permission-profiles/${id}`);
    return response.data;
  }

  async getAvailablePermissions(): Promise<{ permissions: PermissionCategories }> {
    const response = await this.client.get('/permission-profiles/permissions');
    return response.data;
  }

  async createPermissionProfile(data: CreatePermissionProfileRequest): Promise<{ message: string; profile: PermissionProfile }> {
    const response = await this.client.post('/permission-profiles', data);
    return response.data;
  }

  async updatePermissionProfile(id: number, data: UpdatePermissionProfileRequest): Promise<{ message: string; profile: PermissionProfile }> {
    const response = await this.client.put(`/permission-profiles/${id}`, data);
    return response.data;
  }

  async deletePermissionProfile(id: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/permission-profiles/${id}`);
    return response.data;
  }

  // ============================================
  // LOGIN HISTORY
  // ============================================

  async getLoginHistory(filters?: {
    userId?: number;
    source?: string;
    success?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: any[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.userId) params.append('userId', String(filters.userId));
    if (filters?.source) params.append('source', filters.source);
    if (filters?.success !== undefined) params.append('success', filters.success);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));
    const response = await this.client.get(`/login-history?${params.toString()}`);
    return response.data;
  }

  async getLoginHistoryStats(days = 30): Promise<{
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    uniqueUsers: number;
    shopLogins: number;
    panelLogins: number;
  }> {
    const response = await this.client.get(`/login-history/stats?days=${days}`);
    return response.data;
  }

  async exportLoginHistory(filters?: {
    startDate?: string;
    endDate?: string;
    source?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.source) params.append('source', filters.source);
    const response = await this.client.get(`/login-history/export?${params.toString()}`, {
      responseType: 'blob'
    });
    return response.data;
  }
}

export const api = new ApiClient();

// Alias for backwards compatibility
export const API = api;
