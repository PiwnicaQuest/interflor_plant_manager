import { Request } from "express";
// PlantManager Backend Types

export enum UserRole {
  ADMIN = 'admin',
  WAREHOUSE = 'warehouse',
  POS = 'pos',
  CUSTOMER = 'customer'
}

export enum OrderStatus {
  PENDING = 'pending',
  READY_FOR_PICKUP = 'ready_for_pickup',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum InventoryStatus {
  OK = 'ok',
  LOW = 'low'
}

export enum MovementType {
  PURCHASE = 'purchase',
  SALE = 'sale',
  CORRECTION = 'correction',
  RETURN = 'return',
  ADJUSTMENT = 'adjustment',
  ORDER = 'order',
  DAMAGE = 'damage',
  LOSS = 'loss',
  LOSS_REVERSAL = 'loss_reversal',
  MERGE = 'merge',
  OTHER = 'other'
}

export enum PaymentMethod {
  CARD = 'card',
  CASH = 'cash',
  TRANSFER = 'transfer'
}

export enum DocumentType {
  INVOICE = 'invoice',
  RECEIPT = 'receipt',
  PROFORMA = 'proforma'
}

export enum InvoiceType {
  INVOICE = 'invoice',
  PROFORMA = 'proforma'
}

export enum ProformaStatus {
  DRAFT = "draft",
  SENT = "sent",
  ACCEPTED = "accepted",
  EXPIRED = "expired",
  CONVERTED = "converted"
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue'
}

// User
export interface User {
  id: number;
  email: string;
  login?: string;
  sessionId?: string;
  firstName?: string;
  permissions?: string[];
  lastName?: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  profileId?: number;
  priceGroupId?: number;
  defaultCustomerId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithoutPassword {
  id: number;
  email: string;
  login?: string;
  sessionId?: string;
  firstName?: string;
  permissions?: string[];
  lastName?: string;
  role: UserRole;
  isActive: boolean;
  profileId?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Price Group
export interface PriceGroup {
  id: number;
  name: string;
  discountPercentage: number;
  description?: string;
  createdAt: Date;
  createdByUserId?: number;
  createdByEmail?: string;
}

// Customer
export interface Customer {
  id: number;
  userId?: number;
  companyName?: string;
  firstName?: string;
  permissions?: string[];
  lastName?: string;
  nip?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  priceGroupId: number;
  notes?: string;
  customerCode?: string;
  customerEmail?: string;
  createdAt: Date;
  updatedAt: Date;
  // Recipient (delivery address) fields
  recipientCompanyName?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientPhone?: string;
  source?: 'shop' | 'scanner' | 'panel';
  // WDT (EU company) fields
  vatEu?: string;
  isEuCompany?: boolean;
}

export interface CustomerSnapshot {
  companyName?: string;
  firstName?: string;
  permissions?: string[];
  lastName?: string;
  nip?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  customerCode?: string;
  customerEmail?: string;
  vatEu?: string;
}

export type BuyerSnapshot = CustomerSnapshot;

// Product
export interface Product {
  id: number;
  barcode?: string;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  plantPassport?: string;
  palletCount: number;
  unitsPerPallet: number;
  looseUnits: number;
  totalUnits: number; // generated column
  purchasePricePln: number;
  pricePlus?: number;
  basePriceGross: number; // generated column
  priceDiscount10: number; // generated column
  priceDiscount12: number; // generated column
  priceDiscount15: number; // generated column
  priceDiscount20: number; // generated column
  priceDiscount25: number; // generated column
  priceAuchan8?: number;
  inventoryStatus: InventoryStatus;
  visibleInShop: boolean;
  imageUrl?: string;
  deliveryDate?: Date;
  vatRate: number;
  grower?: string;
  growerName?: string; // resolved from grower_passports.floricode
  createdAt: Date;
  updatedAt: Date;
  totalSold?: number; // calculated from order_items
  growerPassport?: string; // from grower_passports table
  isArchived?: boolean;
  archivedAt?: Date;
  tags?: string[];
  // Product merging fields
  mergedIntoId?: number;
  mergedBarcodes?: string[];
  mergedProductIds?: number[];
}

export interface ProductSnapshot {
  growerPassport?: string;
  id: number;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  barcode?: string;
  imageUrl?: string;
  createdAt?: Date;
}

// Inventory Movement
export interface InventoryMovement {
  id: number;
  productId: number;
    unitPriceGross?: number;
  userId?: number;
  movementType: MovementType;
  deltaUnits: number;
  deltaPallets: number;
  reason?: string;
  referenceType?: string;
  referenceId?: number;
  createdAt: Date;
}

// Order
export interface Order {
  customerPriceGroupId?: number;
  customerPriceGroupName?: string;
  id: number;
  orderNumber: string;
  customerId?: number;
  createdByUserId?: number;
  status: OrderStatus;
  customerSnapshot?: CustomerSnapshot;
  recipientSnapshot?: CustomerSnapshot;
  notes?: string;
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
  vatEu?: string;
  isEuCompany?: boolean;
  totalAmount: number;
  discountPercentage?: number;
  totalAmountAfterDiscount?: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Order Item
export interface OrderItem {
  palletCount?: number;
  unitsPerPallet?: number;
  totalUnits?: number;
  looseUnits?: number;
  id: number;
  orderId: number;
  productId?: number;
  productSnapshot?: ProductSnapshot;
  quantity: number;
  unitPriceGross: number;
  totalPrice: number; // generated column
  createdAt: Date;
  createdByUserId?: number;
  createdByEmail?: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
  customerName?: string;
  customerCode?: string;
  customerEmail?: string;
  vatEu?: string;
}

// Invoice
export interface Invoice {
  id: number;
  invoiceNumber: string;
  orderId?: number;
  customerId?: number;
  buyerSnapshot: CustomerSnapshot;
  recipientSnapshot?: CustomerSnapshot;
  issueDate: Date;
  saleDate: Date;
  paymentDeadline?: Date;
  paymentMethod?: PaymentMethod; // Primary payment method
  paymentSplits?: PaymentSplit[]; // JSONB field for split payments
  paymentStatus: PaymentStatus;
  paidAmount: number;
  subtotalNet: number;
  totalVat: number;
  totalGross: number;
  notes?: string;
  pdfUrl?: string;
  createdByUserId?: number;
  createdAt: Date;
  updatedAt: Date;
  invoiceType?: InvoiceType;
  proformaId?: number;
  proformaStatus?: ProformaStatus;
  transactionType?: 'domestic' | 'wdt' | 'export';
}

// Invoice Item
export interface InvoiceItem {
  id: number;
  invoiceId: number;
  productId?: number;
  description: string;
  quantity: number;
  unitPriceNet: number;
  unitPriceGross?: number;
  vatRate: number;
  totalNet: number; // generated column
  totalVat: number; // generated column
  totalGross: number; // generated column
  growerPassport?: string;
  createdAt: Date;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

// Receipt
export interface Receipt {
  id: number;
  receiptNumber: string;
  orderId?: number;
  customerId?: number;
  customerName?: string;
  customerCode?: string;
  customerEmail?: string;
  vatEu?: string;
  buyerSnapshot?: CustomerSnapshot;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  totalAmount: number;
  discountPercentage?: number;
  totalAmountAfterDiscount?: number;
  notes?: string;
  createdByUserId?: number;
  createdAt: Date;
}

export interface ReceiptItem {
  id: number;
  receiptId: number;
  productId?: number;
  description: string;
  quantity: number;
  unitPriceGross: number;
  vatRate: number;
  totalGross: number;
  createdAt: Date;
}

export interface ReceiptWithItems extends Receipt {
  items: ReceiptItem[];
}

// Order Status Log
export interface OrderStatusLog {
  id: number;
  orderId: number;
  oldStatus?: OrderStatus;
  newStatus: OrderStatus;
  changedByUserId?: number;
  notes?: string;
  createdAt: Date;
}

// JWT Payload
export interface JWTPayload {
  userId: number;
  email: string;
  role: UserRole;
  firstName?: string;
  permissions?: string[];
  login?: string;
  sessionId?: string;
  priceMultiplier?: number;
  priceGroupName?: string;
  defaultCustomerId?: number;
  iat?: number;
  exp?: number;
}

// API Request/Response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserWithoutPassword;
}

export interface RegisterRequest {
  email: string;
  password: string;
  companyName?: string;
  firstName?: string;
  permissions?: string[];
  lastName?: string;
  nip?: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
  profileId?: number;
  firstName?: string;
  permissions?: string[];
  lastName?: string;
  login?: string;
  sessionId?: string;
}

export interface UpdateUserRequest {
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  profileId?: number;
  firstName?: string;
  permissions?: string[];
  lastName?: string;
  login?: string;
  sessionId?: string;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface CreatePriceGroupRequest {
  name: string;
  discountPercentage: number;
  description?: string;
}

export interface UpdatePriceGroupRequest {
  name?: string;
  discountPercentage?: number;
  description?: string;
}

export interface CreateProductRequest {
  barcode?: string;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  plantPassport?: string;
  palletCount: number;
  unitsPerPallet: number;
  purchasePricePln: number;
  visibleInShop?: boolean;
  imageUrl?: string;
  createdAt?: Date;
  deliveryDate?: Date;
  vatRate?: number;
  grower?: string;
  tags?: string[];
}

export interface UpdateProductRequest {
  pricePlus?: number;
  basePriceGross?: number;
  priceDiscount10?: number;
  priceDiscount12?: number;
  priceDiscount15?: number;
  priceDiscount20?: number;
  priceDiscount25?: number;
  priceAuchan8?: number;
  barcode?: string;
  plantName?: string;
  potSize?: string;
  plantHeightCm?: number;
  plantPassport?: string;
  palletCount?: number;
  unitsPerPallet?: number;
  totalUnits?: number;
  looseUnits?: number;
  purchasePricePln?: number;
  visibleInShop?: boolean;
  imageUrl?: string;
  createdAt?: Date;
  deliveryDate?: Date;
  vatRate?: number;
  grower?: string;
  tags?: string[];
}

export interface CreateOrderRequest {
  customerId: number;
  items: Array<{
    productId: number;
    unitPriceGross?: number;
    quantity: number;
  }>;
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
  vatEu?: string;
  isEuCompany?: boolean;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  notes?: string;
}

export interface CancelOrderRequest {
  reason: string;
}

export interface PaymentSplit {
  paymentMethod: PaymentMethod;
  amount: number;
}

export interface CheckoutRequest {
  paymentDeadlineDays?: number; // For transfer payments - number of days for payment deadline
  orderId: number;
  paymentMethod?: PaymentMethod; // Single payment (legacy)
  paymentSplits?: PaymentSplit[]; // Split payment (new)
  documentType: DocumentType;
  discountPercentage?: number;
  items?: Array<{
    productId: number;
    unitPriceGross?: number;
    quantity: number;
  }>;
}

export interface CheckoutResponse {
  message: string;
  documentType: DocumentType;
  discountPercentage?: number;
  documentNumber: string;
  documentId: number;
  totalAmount: number;
  totalAmountAfterDiscount?: number;
}

export interface LookupNIPRequest {
  nip: string;
}

export interface LookupNIPResponse {
  companyName: string;
  nip: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

// WebSocket Message types
export interface WSMessage {
  type: string;
  data?: any;
}

export interface WSAuthMessage extends WSMessage {
  type: 'auth';
  token: string;
}

export interface WSSubscribeMessage extends WSMessage {
  type: 'subscribe';
  channel: string;
}

export interface WSOrderStatusChangedMessage extends WSMessage {
  type: 'order:status_changed';
  data: {
    orderId: number;
    orderNumber: string;
    oldStatus: OrderStatus;
    newStatus: OrderStatus;
    changedBy: string;
    timestamp: Date;
  };
}

export interface WSOrderCreatedMessage extends WSMessage {
  type: 'order:created';
  data: {
    orderId: number;
    orderNumber: string;
    customerName?: string;
  customerCode?: string;
  customerEmail?: string;
  vatEu?: string;
    itemCount: number;
    totalAmount: number;
  discountPercentage?: number;
  totalAmountAfterDiscount?: number;
    timestamp: Date;
  };
}

export interface WSInventoryLowStockMessage extends WSMessage {
  type: 'inventory:low_stock';
  data: {
    productId: number;
    unitPriceGross?: number;
    plantName: string;
    palletCount: number;
    totalUnits: number;
    timestamp: Date;
  };
}

// Express Request with User
export interface AuthRequest extends Request {
  user?: JWTPayload;
}

// Order with document info (for POS completed orders view)
export interface OrderWithDocument extends Order {
  customerName?: string;
  customerCode?: string;
  customerEmail?: string;
  vatEu?: string;
  itemCount?: number;
  document?: {
    type: 'invoice' | 'receipt';
    id: number;
    number: string;
    paymentMethod?: string;
  };
}

// ============================================
// DAILY REPORT TYPES
// ============================================

export interface DailyReportTransaction {
  time: string;
  documentNumber: string;
  documentType: 'invoice' | 'receipt' | 'proforma';
  customerName: string;
  paymentMethod: string;
  paymentSplits?: { method: string; amount: number }[];
  amount: number;
}

export interface DailyReportPaymentSummary {
  method: 'cash' | 'card' | 'transfer';
  transactionCount: number;
  total: number;
}

export interface DailyReportDocumentSummary {
  type: 'invoice' | 'receipt' | 'proforma';
  count: number;
  total: number;
}

export interface DailyReportVatSummary {
  vatRate: number;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
}

export interface DailyReportData {
  reportDate: string;
  generatedAt: string;
  operatorName: string;
  companyName: string;
  transactions: DailyReportTransaction[];
  paymentSummary: DailyReportPaymentSummary[];
  documentSummary: DailyReportDocumentSummary[];
  vatSummary: DailyReportVatSummary[];
  totals: {
    transactionCount: number;
    grandTotal: number;
    netTotal: number;
    vatTotal: number;
    grossTotal: number;
  };
}

// Invoice Correction Types
export interface InvoiceCorrection {
  id: number;
  correctionNumber: string;
  originalInvoiceId: number;
  originalInvoiceNumber: string;
  originalInvoiceDate: Date;
  correctionReason: string;
  buyerSnapshot: CustomerSnapshot;
  originalSubtotalNet: number;
  originalTotalVat: number;
  originalTotalGross: number;
  correctedSubtotalNet: number;
  correctedTotalVat: number;
  correctedTotalGross: number;
  differenceNet: number;
  differenceVat: number;
  differenceGross: number;
  issueDate: Date;
  createdByUserId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceCorrectionItem {
  id: number;
  correctionId: number;
  originalItemId?: number;
  description: string;
  originalQuantity: number;
  originalUnitPriceNet: number;
  originalVatRate: number;
  originalTotalNet: number;
  originalTotalVat: number;
  originalTotalGross: number;
  correctedQuantity: number;
  correctedUnitPriceNet: number;
  correctedUnitPriceGross: number;
  correctedVatRate: number;
  correctedTotalNet: number;
  correctedTotalVat: number;
  correctedTotalGross: number;
  differenceQuantity: number;
  differenceNet: number;
  differenceVat: number;
  differenceGross: number;
  createdAt: Date;
}

export interface InvoiceCorrectionWithItems extends InvoiceCorrection {
  items: InvoiceCorrectionItem[];
}
