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
}

export interface AuthState {
  user: User | null;
  customer: Customer | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
