import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { CartItem, Product } from '../types';
import { useAuth } from './AuthContext';

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, palletCount?: number) => void;
  removeItem: (productId: number) => void;
  updatePalletCount: (productId: number, palletCount: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPallets: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | null>(null);

// Get cart storage key for specific user
const getCartKey = (userId: number | null) => {
  return userId ? `shop_cart_user_${userId}` : null;
};

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart when user changes
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const cartKey = getCartKey(user.id);
      if (cartKey) {
        const saved = localStorage.getItem(cartKey);
        setItems(saved ? JSON.parse(saved) : []);
      }
    } else {
      // Not authenticated - clear cart state
      setItems([]);
    }
  }, [user?.id, isAuthenticated]);

  // Save cart when items change (only for authenticated users)
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const cartKey = getCartKey(user.id);
      if (cartKey) {
        localStorage.setItem(cartKey, JSON.stringify(items));
      }
    }
  }, [items, user?.id, isAuthenticated]);

  const getUnitsPerPallet = (product: Product) => product.unitsPerPallet || 1;
  const getMaxPallets = (product: Product) => product.palletCount || Math.floor(product.availableUnits / getUnitsPerPallet(product));

  const addItem = useCallback((product: Product, palletCount = 1) => {
    if (!isAuthenticated) return; // Don't allow adding if not authenticated

    const unitsPerPallet = getUnitsPerPallet(product);
    const maxPallets = getMaxPallets(product);
    const quantity = palletCount * unitsPerPallet;

    setItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const currentPallets = Math.floor(existing.quantity / unitsPerPallet);
        const newPallets = Math.min(currentPallets + palletCount, maxPallets);
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: newPallets * unitsPerPallet }
            : item
        );
      }
      return [...prev, { product, quantity: Math.min(quantity, maxPallets * unitsPerPallet) }];
    });
  }, [isAuthenticated]);

  const removeItem = useCallback((productId: number) => {
    setItems(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  const updatePalletCount = useCallback((productId: number, palletCount: number) => {
    if (palletCount <= 0) {
      removeItem(productId);
      return;
    }
    setItems(prev =>
      prev.map(item => {
        if (item.product.id === productId) {
          const unitsPerPallet = getUnitsPerPallet(item.product);
          const maxPallets = getMaxPallets(item.product);
          const newPallets = Math.min(palletCount, maxPallets);
          return { ...item, quantity: newPallets * unitsPerPallet };
        }
        return item;
      })
    );
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
    // Also clear from localStorage
    if (user?.id) {
      const cartKey = getCartKey(user.id);
      if (cartKey) {
        localStorage.removeItem(cartKey);
      }
    }
  }, [user?.id]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPallets = items.reduce((sum, item) => {
    const unitsPerPallet = getUnitsPerPallet(item.product);
    return sum + Math.floor(item.quantity / unitsPerPallet);
  }, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updatePalletCount,
      clearCart,
      totalItems,
      totalPallets,
      totalPrice,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
