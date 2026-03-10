import { useState, useEffect, useRef, useCallback } from 'react';
import { API } from '../../services/api';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

// Generate EAN-13 with valid check digit
function generateEAN13(): string {
  const digits: number[] = [];
  digits.push(2);
  for (let i = 1; i < 12; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  digits.push(checkDigit);
  return digits.join('');
}

export function ScannerAddPlantPage() {
  const [plantName, setPlantName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [palletCount, setPalletCount] = useState('');
  const [unitsPerPallet, setUnitsPerPallet] = useState('');
  const [priceNet, setPriceNet] = useState('');
  const [potSize, setPotSize] = useState('');
  const [plantHeight, setPlantHeight] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Handle barcode from physical scanner
  const handleBarcodeScan = useCallback((scannedBarcode: string) => {
    setBarcode(scannedBarcode);
  }, []);

  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: true,
  });

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Generate unique barcode
  const handleGenerateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      let code = '';
      let exists = true;
      let attempts = 0;
      while (exists && attempts < 10) {
        code = generateEAN13();
        try {
          const result = await API.checkBarcode(code);
          exists = result.exists;
        } catch {
          exists = false;
        }
        attempts++;
      }
      if (!exists && code) {
        setBarcode(code);
      } else {
        setError('Nie udalo sie wygenerowac unikalnego kodu');
      }
    } finally {
      setGeneratingBarcode(false);
    }
  };

  // Submit
  const handleSubmit = async () => {
    if (!plantName.trim()) { setError('Podaj nazwe rosliny'); return; }
    if (!barcode.trim()) { setError('Podaj lub wygeneruj kod kreskowy'); return; }

    setSubmitting(true);
    setError(null);

    try {
      const check = await API.checkBarcode(barcode);
      if (check.exists) {
        setError('Kod kreskowy juz istnieje w bazie!');
        setSubmitting(false);
        return;
      }

      const pallets = parseInt(palletCount) || 0;
      const upp = parseInt(unitsPerPallet) || 1;
      const netPrice = parseFloat(priceNet) || 0;

      const result = await API.createProduct({
        plantName: plantName.trim(),
        barcode: barcode.trim(),
        palletCount: pallets,
        unitsPerPallet: upp,
        looseUnits: 0,
        potSize: potSize.trim() || undefined,
        plantHeight: plantHeight.trim() || undefined,
        purchasePricePln: netPrice,
        vatRate: 8,
      } as any);

      if (imageFile && result.productId) {
        try {
          await API.uploadProductImage(result.productId, imageFile);
        } catch {}
      }

      setSuccess(`Dodano: ${plantName} (${pallets * upp} szt.)`);

      setPlantName('');
      setBarcode('');
      setPalletCount('');
      setUnitsPerPallet('');
      setPriceNet('');
      setPotSize('');
      setPlantHeight('');
      setImageFile(null);
      setImagePreview(null);

      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Blad podczas dodawania');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3 pb-20">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span>🌱</span> Dodaj rosline
        </h2>
        <p className="text-xs text-gray-500">Wypelnij dane nowej rosliny</p>
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Name */}
        <div className="p-4 border-b border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nazwa rosliny *</label>
          <input type="text" value={plantName} onChange={e => setPlantName(e.target.value)}
            placeholder="np. Anthurium Florida 14O 50cm"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-green-500 focus:border-green-500" />
        </div>

        {/* Pot size + Height */}
        <div className="p-4 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rozmiar doniczki</label>
              <input type="text" value={potSize} onChange={e => setPotSize(e.target.value)}
                placeholder="np. 14O, 17cm"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Wysokosc rosliny</label>
              <input type="text" value={plantHeight} onChange={e => setPlantHeight(e.target.value)}
                placeholder="np. 50cm"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            </div>
          </div>
        </div>

        {/* Barcode */}
        <div className="p-4 border-b border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-1">Kod kreskowy * (skanuj lub generuj)</label>
          <div className="flex gap-2">
            <input ref={barcodeInputRef} type="text" value={barcode} onChange={e => setBarcode(e.target.value)}
              placeholder="Zeskanuj kod..."
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-base font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            <button onClick={handleGenerateBarcode} disabled={generatingBarcode}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
              {generatingBarcode ? '...' : 'Generuj'}
            </button>
          </div>
          {barcode && <div className="mt-1 text-xs text-gray-400 font-mono">{barcode}</div>}
        </div>

        {/* Pallets + Units per pallet */}
        <div className="p-4 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ile paletek</label>
              <input type="number" value={palletCount} onChange={e => setPalletCount(e.target.value)}
                placeholder="0" min="0" inputMode="numeric"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Szt. na palecie</label>
              <input type="number" value={unitsPerPallet} onChange={e => setUnitsPerPallet(e.target.value)}
                placeholder="1" min="1" inputMode="numeric"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          {palletCount && unitsPerPallet && (
            <div className="mt-2 text-center text-sm text-gray-500">
              Razem: <span className="font-bold text-gray-800">{(parseInt(palletCount) || 0) * (parseInt(unitsPerPallet) || 1)} szt.</span>
            </div>
          )}
        </div>

        {/* Price net */}
        <div className="p-4 border-b border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-1">Cena netto (zl)</label>
          <input type="number" value={priceNet} onChange={e => setPriceNet(e.target.value)}
            placeholder="0.00" min="0" step="0.01" inputMode="decimal"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-green-500" />
        </div>

        {/* Image */}
        <div className="p-4 border-b border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-1">Zdjecie rosliny</label>
          <div
            className="w-full h-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors overflow-hidden"
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Podglad" className="w-full h-full object-cover" />
            ) : (
              <>
                <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm text-gray-400">Zrob zdjecie lub wybierz</span>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
          {imagePreview && (
            <button onClick={() => { setImageFile(null); setImagePreview(null); }}
              className="mt-2 text-xs text-red-500 hover:text-red-700">Usun zdjecie</button>
          )}
        </div>

        {/* Submit */}
        <div className="p-4">
          <button onClick={handleSubmit} disabled={submitting || !plantName.trim() || !barcode.trim()}
            className={`w-full py-3.5 rounded-lg font-bold text-white text-base transition-colors ${
              !submitting && plantName.trim() && barcode.trim()
                ? 'bg-green-600 hover:bg-green-700 active:bg-green-800'
                : 'bg-gray-300 cursor-not-allowed'
            }`}>
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Dodawanie...
              </span>
            ) : 'Dodaj rosline'}
          </button>
        </div>
      </div>
    </div>
  );
}
