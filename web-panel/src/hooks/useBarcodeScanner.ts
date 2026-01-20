import { useEffect, useRef, useCallback } from 'react';

interface UseBarcodeScanner {
  onScan: (barcode: string) => void;
  startChar?: string;
  endChar?: string;
  enabled?: boolean;
}

/**
 * Hook do obsługi skanera kodów kreskowych z prefiksem i sufiksem
 * Domyślnie: prefix '[' i suffix ']'
 * Działa globalnie, nawet gdy fokus jest w innym polu input
 */
export function useBarcodeScanner({
  onScan,
  startChar = '[',
  endChar = ']',
  enabled = true,
}: UseBarcodeScanner) {
  const isScanning = useRef(false);
  const buffer = useRef('');
  const onScanRef = useRef(onScan);

  // Aktualizuj ref gdy zmieni się callback
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    const key = e.key;

    if (key === startChar) {
      // Początek skanowania
      isScanning.current = true;
      buffer.current = '';
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (key === endChar && isScanning.current) {
      // Koniec skanowania - wywołaj callback
      const scannedBarcode = buffer.current.trim();
      isScanning.current = false;
      buffer.current = '';
      e.preventDefault();
      e.stopPropagation();
      
      if (scannedBarcode) {
        onScanRef.current(scannedBarcode);
      }
      return;
    }

    if (isScanning.current) {
      // Zbieraj znaki do bufora (tylko pojedyncze znaki)
      if (key.length === 1) {
        buffer.current += key;
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, [enabled, startChar, endChar]);

  useEffect(() => {
    if (!enabled) return;

    // Użyj capture phase aby przechwycić event przed innymi handlerami
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      // Reset state on cleanup
      isScanning.current = false;
      buffer.current = '';
    };
  }, [handleKeyDown, enabled]);
}
