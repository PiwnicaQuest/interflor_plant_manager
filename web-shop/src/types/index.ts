export interface Product {
  id: number;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  imageUrl?: string;
  price: number;
  availableUnits: number;
  palletCount?: number;
  unitsPerPallet?: number;
  looseUnits?: number;
  grower?: string;
  barcode?: string;
  plantPassport?: string;
  tags?: string[];
}

// Available categories for filtering
export const AVAILABLE_CATEGORIES = [
  'Anthurium', 'Bonsai', 'Bromelia', 'Cebulowe', 'Ceramika', 'Cytrusy',
  'Doniczki', 'Dzień Matki', 'Iglaste', 'Kaktus', 'Kolekcjonerskie',
  'Kompozycje', 'Kwitnące', 'Nawozy', 'Ogrodowe', 'Orchidea', 'Owadożerne',
  'Palmy', 'Pnącza', 'Promocja', 'Rośliny Mini', 'Spathiphyllum', 'Sukulenty',
  'Świąteczne', 'Walentynki', 'Wielkanoc', 'Wiszące', 'Zielone', 'Zioła'
] as const;

export type Category = typeof AVAILABLE_CATEGORIES[number];

// Category groups for better organization
export const CATEGORY_GROUPS = {
  'Rodzaje roślin': ['Anthurium', 'Bonsai', 'Bromelia', 'Iglaste', 'Kaktus', 'Orchidea', 'Palmy', 'Spathiphyllum', 'Sukulenty', 'Zioła'],
  'Cechy roślin': ['Kwitnące', 'Zielone', 'Wiszące', 'Pnącza', 'Owadożerne', 'Rośliny Mini', 'Kolekcjonerskie'],
  'Okazje': ['Dzień Matki', 'Walentynki', 'Wielkanoc', 'Świąteczne', 'Promocja'],
  'Akcesoria': ['Ceramika', 'Doniczki', 'Nawozy', 'Kompozycje'],
  'Inne': ['Cebulowe', 'Cytrusy', 'Ogrodowe']
} as const;

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  customerNotes?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: number;
  productId: number;
  productSnapshot: {
    plantName: string;
    potSize?: string;
    imageUrl?: string;
  };
  quantity: number;
  unitPriceGross: number;
  totalPrice: number;
}

export type OrderStatus =
  | 'pending'
  | 'in_progress'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';

export interface Customer {
  id: number;
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
  priceGroup: string;
}

export interface User {
  id: number;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

// Role labels in Polish
export const ROLE_LABELS: Record<string, string> = {
  'admin': 'Administrator',
  'pos': 'Kasjer',
  'warehouse': 'Magazynier',
  'seller': 'Sprzedawca',
  'customer': 'Klient',
};

export interface AuthState {
  user: User | null;
  customer: Customer | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Invoice types for customer panel
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export interface Invoice {
  id: number;
  invoiceNumber: string;
  orderId: number;
  issueDate: string;
  saleDate: string;
  paymentDeadline: string;
  paymentStatus: PaymentStatus;
  totalGross: number;
  paidAmount: number;
  buyerName: string;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  'unpaid': 'Nieopłacona',
  'partially_paid': 'Częściowo opłacona',
  'paid': 'Opłacona',
  'overdue': 'Zaległa',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  'unpaid': 'bg-yellow-100 text-yellow-800',
  'partially_paid': 'bg-blue-100 text-blue-800',
  'paid': 'bg-pink-100 text-pink-800',
  'overdue': 'bg-red-100 text-red-800',
};

// Invoice data for printing HTML template
export interface InvoiceForPrint {
  id: number;
  invoiceNumber: string;
  orderId?: number;
  orderNumber?: string;
  issueDate: string;
  saleDate: string;
  paymentDeadline?: string;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  paymentSplits?: Array<{ paymentMethod: 'card' | 'cash' | 'transfer'; amount: number }>;
  paymentStatus: PaymentStatus;
  subtotalNet: number;
  totalVat: number;
  totalGross: number;
  paidAmount: number;
  notes?: string;
  buyerInfo?: {
    customerCode?: string;
    companyName?: string;
    firstName?: string;
    lastName?: string;
    nip?: string;
    address?: string;
    city?: string;
    postalCode?: string;
  };
  recipientInfo?: {
    companyName?: string;
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    phone?: string;
  };
  items?: Array<{
    id: number;
    name: string;
    quantity: number;
    unit: string;
    unitPriceNet: number;
    unitPriceGross: number;
    totalNet: number;
    totalGross: number;
    vatRate: number;
    vatAmount: number;
    growerPassport?: string;
  }>;
}

export interface SellerInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  nip: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  invoiceComment?: string;
}
