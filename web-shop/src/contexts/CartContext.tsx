import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CartItem, Product } from '../types';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, palletCount?: number) => void;
  removeItem: (productId: number) => void;
  updatePalletCount: (productId: number, palletCount: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPallets: number;
  totalPrice: number;
  isLoading: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  // Load cart from API when user logs in
  useEffect(() => {
    const loadCart = async () => {
      if (isAuthenticated && user?.id) {
        setIsLoading(true);
        try {
          const response = await api.getCart();
          setItems(response.cart || []);
        } catch (error) {
          console.error('Failed to load cart from server:', error);
          setItems([]);
        } finally {
          setIsLoading(false);
          isInitialLoad.current = false;
        }
      } else {
        setItems([]);
        isInitialLoad.current = true;
      }
    };

    loadCart();
  }, [user?.id, isAuthenticated]);

  // Save cart to API when items change (debounced)
  useEffect(() => {
    // Skip saving on initial load
    if (isInitialLoad.current) return;
    if (!isAuthenticated || !user?.id) return;

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save to avoid too many API calls
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.saveCart(items);
      } catch (error) {
        console.error('Failed to save cart to server:', error);
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [items, user?.id, isAuthenticated]);

  const getUnitsPerPallet = (product: Product) => product.unitsPerPallet || 1;
  const getMaxPallets = (product: Product) => product.palletCount || Math.floor(product.availableUnits / getUnitsPerPallet(product));

  const addItem = useCallback((product: Product, palletCount = 1) => {
    if (!isAuthenticated) return;

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

  const clearCart = useCallback(async () => {
    setItems([]);
    if (isAuthenticated && user?.id) {
      try {
        await api.clearCartApi();
      } catch (error) {
        console.error('Failed to clear cart on server:', error);
      }
    }
  }, [user?.id, isAuthenticated]);

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
      isLoading,
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
