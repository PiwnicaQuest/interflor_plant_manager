import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';
import { useCart } from '../contexts/CartContext';
import { Link } from 'react-router-dom';
import type { Product } from '../types';

interface ScannedProduct {
  id: number;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  unitsPerPallet: number;
  palletCount: number;
  looseUnits: number;
  availableUnits: number;
  price: number;
  imageUrl?: string;
  barcode?: string;
}

export function ScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const { addItem } = useCart();

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // Html5QrcodeScannerState.SCANNING
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const onScanSuccess = useCallback(async (decodedText: string) => {
    // Stop scanner immediately to prevent multiple scans
    await stopScanner();

    setLoading(true);
    setError(null);
    setScannedProduct(null);

    try {
      const result = await api.scanBarcode(decodedText);
      setScannedProduct(result.product);
      setQuantity(1);
    } catch (err: any) {
      setError(err.message || 'Produkt nie znaleziony');
    } finally {
      setLoading(false);
    }
  }, [stopScanner]);

  const startScanner = async () => {
    if (isStartingRef.current || scanning) return;
    isStartingRef.current = true;

    try {
      setCameraError(null);
      setError(null);

      // Create scanner instance if needed
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('scanner-container');
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.0,
        },
        onScanSuccess,
        () => {} // Ignore scan failures
      );

      setScanning(true);

    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(
        err.message?.includes('Permission')
          ? 'Brak dostepu do kamery. Zezwol na dostep w ustawieniach przegladarki.'
          : 'Nie udało się uruchomić kamery. Sprawdź czy inne aplikacje nie używają kamery.'
      );
    } finally {
      isStartingRef.current = false;
    }
  };

  const handleAddToCart = () => {
    if (!scannedProduct) return;

    const product: Product = {
      id: scannedProduct.id,
      plantName: scannedProduct.plantName,
      potSize: scannedProduct.potSize,
      plantHeightCm: scannedProduct.plantHeightCm,
      unitsPerPallet: scannedProduct.unitsPerPallet,
      palletCount: scannedProduct.palletCount,
      looseUnits: scannedProduct.looseUnits,
      availableUnits: scannedProduct.availableUnits,
      price: scannedProduct.price,
      imageUrl: scannedProduct.imageUrl,
      barcode: scannedProduct.barcode,
    };

    addItem(product, quantity);
    setSuccess(`Dodano ${quantity} pal. "${scannedProduct.plantName}" do koszyka`);
    setScannedProduct(null);
    setQuantity(1);
  };

  const handleScanAgain = () => {
    setScannedProduct(null);
    setError(null);
    startScanner();
  };

  const maxPallets = scannedProduct ? scannedProduct.palletCount : 1;
  const showScanner = !scannedProduct && !loading;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Skaner produktów</h1>
          <Link
            to="/cart"
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Koszyk
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Success message */}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {cameraError}
          </div>
        )}

        {/* Scanner section */}
        <div 
          className="bg-white rounded-xl shadow-sm overflow-hidden mb-4"
          style={{ display: showScanner ? 'block' : 'none' }}
        >
          {/* Scanner container - ALWAYS in DOM, never conditionally rendered */}
          <div className="relative bg-gray-900" style={{ minHeight: '300px' }}>
            <div id="scanner-container" style={{ width: '100%', minHeight: '300px' }} />
            
            {/* Overlay for start button - only visual, doesn't affect scanner-container */}
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <button
                  onClick={startScanner}
                  className="flex flex-col items-center gap-3 text-white"
                >
                  <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="font-medium">Wlacz kamere</span>
                </button>
              </div>
            )}
          </div>

          {/* Controls when scanning */}
          {scanning && (
            <div className="p-3 bg-gray-800 text-center">
              <p className="text-white text-sm mb-2">Skieruj kamere na kod kreskowy</p>
              <button
                onClick={stopScanner}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Zatrzymaj skanowanie
              </button>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Szukanie produktu...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center mb-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-4">{error}</p>
            <button
              onClick={handleScanAgain}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              Skanuj ponownie
            </button>
          </div>
        )}

        {/* Scanned product */}
        {scannedProduct && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
            {scannedProduct.imageUrl ? (
              <img
                src={scannedProduct.imageUrl}
                alt={scannedProduct.plantName}
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}

            <div className="p-4">
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                {scannedProduct.plantName}
              </h2>

              <div className="flex flex-wrap gap-2 text-sm text-gray-600 mb-3">
                {scannedProduct.potSize && (
                  <span className="px-2 py-0.5 bg-gray-100 rounded">{scannedProduct.potSize}</span>
                )}
                {scannedProduct.plantHeightCm && (
                  <span className="px-2 py-0.5 bg-gray-100 rounded">{scannedProduct.plantHeightCm} cm</span>
                )}
                <span className="px-2 py-0.5 bg-gray-100 rounded">{scannedProduct.unitsPerPallet} szt./pal.</span>
              </div>

              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-2xl font-bold text-green-600">
                  {Number(scannedProduct.price || 0).toFixed(2)} PLN
                </span>
                <span className="text-sm text-gray-500">/ szt.</span>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  scannedProduct.palletCount > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {scannedProduct.palletCount > 0
                    ? `Dostepne: ${scannedProduct.palletCount} palet`
                    : 'Brak na stanie'
                  }
                </span>
              </div>

              {scannedProduct.palletCount > 0 && (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-sm font-medium text-gray-700">Ilosc palet:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={maxPallets}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.min(maxPallets, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-16 h-10 text-center text-lg font-bold border border-gray-300 rounded-lg"
                      />
                      <button
                        onClick={() => setQuantity(Math.min(maxPallets, quantity + 1))}
                        className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">
                        {quantity} pal. x {scannedProduct.unitsPerPallet} szt. = {quantity * scannedProduct.unitsPerPallet} szt.
                      </span>
                      <span className="font-bold text-lg text-green-600">
                        {(Number(scannedProduct.price || 0) * quantity * (scannedProduct.unitsPerPallet || 1)).toFixed(2)} PLN
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleAddToCart}
                    className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Dodaj do koszyka
                  </button>
                </>
              )}

              <button
                onClick={handleScanAgain}
                className="w-full mt-3 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Skanuj kolejny produkt
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!scanning && !scannedProduct && !loading && !error && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-medium text-blue-800 mb-2">Jak uzywac skanera?</h3>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Kliknij "Wlacz kamere" powyzej</li>
              <li>Zezwol przegladarce na dostep do kamery</li>
              <li>Skieruj kamere na kod kreskowy produktu</li>
              <li>Po zeskanowaniu wybierz ilosc i dodaj do koszyka</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
