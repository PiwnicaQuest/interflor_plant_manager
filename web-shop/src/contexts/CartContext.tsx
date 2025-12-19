import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { CartItem, Product } from '../types';

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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('shop_cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('shop_cart', JSON.stringify(items));
  }, [items]);

  const getUnitsPerPallet = (product: Product) => product.unitsPerPallet || 1;
  const getMaxPallets = (product: Product) => product.palletCount || Math.floor(product.availableUnits / getUnitsPerPallet(product));

  const addItem = (product: Product, palletCount = 1) => {
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
  };

  const removeItem = (productId: number) => {
    setItems(prev => prev.filter(item => item.product.id !== productId));
  };

  const updatePalletCount = (productId: number, palletCount: number) => {
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
  };

  const clearCart = () => {
    setItems([]);
  };

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
