// PlantManager Web Panel Types
// These mirror the backend types

export enum UserRole {
  ADMIN = 'admin',
  WAREHOUSE = 'warehouse',
  POS = 'pos',
  CUSTOMER = 'customer'
}

export enum OrderStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
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

export interface PaymentSplit {
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  amount: number;
}

export enum DocumentType {
  INVOICE = 'invoice',
  RECEIPT = 'receipt'
}

export enum InvoiceType {
  INVOICE = 'invoice',
  PROFORMA = 'proforma'
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue'
}

export interface User {
  id: number;
  email: string;
  role: UserRole;
  isActive: boolean;
  firstName?: string;
  lastName?: string;
  login?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithoutPassword {
  id: number;
  email: string;
  role: UserRole;
  isActive: boolean;
  firstName?: string;
  lastName?: string;
  login?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: number;
  barcode?: string;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  grower?: string;
  growerPassport?: string;
  plantPassport?: string;
  palletCount: number;
  unitsPerPallet: number;
  looseUnits?: number;
  totalUnits: number;
  purchasePricePln: number;
  pricePlus?: number;
  basePriceGross: number;
  priceDiscount10: number;
  priceDiscount12: number;
  priceDiscount15: number;
  priceDiscount20: number;
  priceDiscount25: number;
  priceAuchan8?: number;
  inventoryStatus: InventoryStatus;
  visibleInShop: boolean;
  imageUrl?: string;
  deliveryDate?: string;
  vatRate: number;
  createdAt: string;
  updatedAt: string;
  // Extended fields for merged products
  tags?: string[];
  totalSold?: number;
  mergedProductIds?: number[];
  mergedIntoId?: number;
  mergedBarcodes?: string[];
  isArchived?: boolean;
}

export interface InventoryMovement {
  id: number;
  productId: number;
  userId?: number;
  movementType: MovementType;
  deltaUnits: number;
  deltaPallets: number;
  reason?: string;
  referenceType?: string;
  referenceId?: number;
  createdAt: string;
  plantName?: string;
  barcode?: string;
  userEmail?: string;
  orderNumber?: string;
  orderStatus?: string;
  orderCustomerName?: string;
}

export interface Customer {
  id: number;
  userId?: number;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  priceGroupId: number;
  customerCode?: string;
  priceGroupName?: string;
  notes?: string;
  // Recipient (delivery address)
  recipientCompanyName?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  customerId?: number;
  customerName?: string;
  customerCode?: string;
  status: OrderStatus;
  totalAmount: number;
  itemCount?: number;
  notes?: string;
  // Recipient (delivery address)
  recipientCompanyName?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientPhone?: string;
  customerNotes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProductSnapshot {
  id: number;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  barcode?: string;
  imageUrl?: string;
  unitsPerPallet?: number;
  createdAt?: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId?: number;
  productSnapshot?: ProductSnapshot;
  productName?: string;
  quantity: number;
  unitPriceGross: number;
  totalPrice: number;
  palletCount?: number;
  unitsPerPallet?: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface OrderStatusHistoryItem {
  id: number;
  orderId: number;
  statusFrom?: OrderStatus;
  statusTo: OrderStatus;
  notes?: string;
  // Recipient (delivery address)
  recipientCompanyName?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientPhone?: string;
  changedBy: number;
  changedByEmail?: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: number;
  invoiceId: number;
  productId?: number;
  description: string;
  quantity: number;
  unitPriceNet: number;
  vatRate: number;
  totalNet?: number;
  totalVat?: number;
  totalGross?: number;
  growerPassport?: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  orderId?: number;
  customerId?: number;
  customerName?: string;
  customerCode?: string;
  issueDate: string;
  saleDate: string;
  paymentDeadline?: string;
  paymentMethod?: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  paymentStatus: PaymentStatus;
  paidAmount: number;
  subtotalNet: number;
  totalVat: number;
  totalGross: number;
  notes?: string;
  // Recipient (delivery address)
  recipientCompanyName?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientPhone?: string;
  pdfUrl?: string;
  createdAt: string;
  invoiceType?: InvoiceType;
  proformaId?: number;
  validUntil?: string;
  items?: InvoiceItem[];
  buyerSnapshot?: {
    companyName?: string;
    firstName?: string;
    lastName?: string;
    nip?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    customerCode?: string;
  };
  recipientSnapshot?: {
    companyName?: string;
    firstName?: string;
    lastName?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
  };
}

// Proforma (same structure as Invoice but with invoiceType = 'proforma')
export type Proforma = Invoice;

export interface Receipt {
  id: number;
  receiptNumber: string;
  orderId?: number;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  totalAmount: number;
  notes?: string;
  // Recipient (delivery address)
  recipientCompanyName?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientPhone?: string;
  createdAt: string;
  customerName?: string;
  customerCode?: string;
  buyerSnapshot?: any;
}

export interface ReceiptItem {
  id: number;
  receiptId: number;
  productId?: number;
  productName?: string;
  description?: string;
  quantity: number;
  unitPriceGross: number;
  vatRate?: number;
  totalPrice: number;
  totalGross?: number;
}

export interface ReceiptWithItems extends Receipt {
  items: ReceiptItem[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiError {
  error: string;
}

// Reports types
export interface SalesReport {
  startDate: string;
  endDate: string;
  totalGross: number;
  totalNet: number;
  totalVat: number;
  orderCount: number;
  averageOrderValue: number;
  dailySales: DailySale[];
}

export interface DailySale {
  date: string;
  orderCount: number;
  totalGross: number;
  totalNet: number;
  totalVat: number;
}

export interface TopProduct {
  productId: number;
  productName: string;
  quantity: number;
  totalRevenue: number;
}

export interface RevenueSummary {
  startDate: string;
  endDate: string;
  totalGross: number;
  totalNet: number;
  totalVat: number;
  orderCount: number;
  averageOrderValue: number;
}

// User management types
export interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
  firstName?: string;
  lastName?: string;
  login?: string;
}

export interface UpdateUserRequest {
  profileId?: number;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  firstName?: string;
  lastName?: string;
  login?: string;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

// Price Group types
export interface PriceGroup {
  id: number;
  name: string;
  discountPercentage: number;
  description?: string;
  createdAt: string;
  customerCount?: number;
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

// Grower Passport types
export interface GrowerPassport {
  id: number;
  growerName: string;
  passportNumber: string;
  createdAt: string;
  updatedAt: string;
}

// Print Template types
export enum TemplateType {
  LABEL = 'label',
  BARCODE = 'barcode',
  ORDER = 'order',
  INVOICE = 'invoice',
  RECEIPT = 'receipt',
  REPORT = 'report'
}

export interface TemplateElementStyle {
  fontSize?: number;
  fontWeight?: string;
  textAlign?: string;
  color?: string;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
}

export interface TemplateElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: string;
  placeholder?: string;
  style?: TemplateElementStyle;
}

export interface PrintTemplate {
  id: number;
  name: string;
  type: TemplateType;
  width: number;
  height: number;
  paperWidth: number;
  paperHeight: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  elements: TemplateElement[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  barcode: ['barcode', 'plantName', 'potSize', 'plantHeightCm', 'price', 'grower'],
  order: ['orderNumber', 'customerName', 'totalAmount', 'status', 'createdAt'],
  invoice: ['invoiceNumber', 'customerName', 'totalGross', 'issueDate', 'paymentDeadline'],
  receipt: ['receiptNumber', 'totalAmount', 'paymentMethod', 'createdAt']
};

// Loss (Strata)
export interface Loss {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  notes?: string;
  // Recipient (delivery address)
  recipientCompanyName?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientStreet?: string;
  recipientPostalCode?: string;
  recipientCity?: string;
  recipientPhone?: string;
  isReversed: boolean;
  reversedAt?: string;
  createdAt: string;
  createdBy?: number;
  // Joined fields
  plantName?: string;
  potSize?: string;
  barcode?: string;
}

export interface LossStats {
  totals: {
    count: number;
    totalQuantity: number;
    totalValue: number;
  };
  recipientSnapshot?: {
    companyName?: string;
    firstName?: string;
    lastName?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
  };
  byProduct: Array<{
    id: number;
    plantName: string;
    potSize?: string;
    lossCount: number;
    totalQuantity: number;
    totalValue: number;
  }>;
  byMonth: Array<{
    month: string;
    count: number;
    totalQuantity: number;
    totalValue: number;
  }>;
}

// POS History types
export interface CompletedOrderSummary {
  id: number;
  orderNumber: string;
  customerId?: number;
  customerName?: string;
  customerCode?: string;
  totalAmount: number;
  completedAt?: string;
  createdAt: string;
  document?: {
    type: DocumentType;
    number: string;
    id: number;
    paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  };
}

export interface TodaySummary {
  totalTransactions: number;
  cashTotal: number;
  cardTotal: number;
  transferTotal: number;
  grandTotal: number;
}

// ============================================
// PERMISSION PROFILES
// ============================================

export interface PermissionProfile {
  id: number;
  name: string;
  description?: string;
  color: string;
  isSystem: boolean;
  permissions: string[];
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionItem {
  key: string;
  label: string;
}

export interface PermissionCategory {
  label: string;
  permissions: PermissionItem[];
}

export interface PermissionCategories {
  [key: string]: PermissionCategory;
}

export interface CreatePermissionProfileRequest {
  name: string;
  description?: string;
  color?: string;
  permissions: string[];
}

export interface UpdatePermissionProfileRequest {
  name?: string;
  description?: string;
  color?: string;
  permissions?: string[];
}

// Extended User with profile info
export interface UserWithProfile extends User {
  profileId?: number;
  profileName?: string;
}
