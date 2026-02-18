import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, PrintTemplate } from '../../types';
import { API } from '../../services/api';
import { usePrint } from '../../hooks/usePrint';

interface BarcodeModalProps {
  product: Product | null;
  onClose: () => void;
  onGenerate: (productId: number, barcode: string) => Promise<void>;
}

export function BarcodeModal({ product, onClose, onGenerate }: BarcodeModalProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [barcode, setBarcode] = useState('');
  const [labelCount, setLabelCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [_showPrintPreview, setShowPrintPreview] = useState(false);
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [printStatus, setPrintStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Use print hook
  const { printBarcodes, isBrokerAvailable } = usePrint({
    onBrowserPrint: () => {
      setPrintStatus({
        type: 'info',
        message: 'Otwarto okno drukowania przegladarki',
      });
      setTimeout(() => setPrintStatus(null), 3000);
    },
    onError: (error) => {
      setPrintStatus({
        type: 'error',
        message: error,
      });
    },
  });

  const hasPrinterConfigured = isBrokerAvailable();

  // Load label templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await API.getPrintTemplates('label');
        setTemplates(data);
        // Select default template
        const defaultTemplate = data.find(t => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        } else if (data.length > 0) {
          setSelectedTemplateId(data[0].id);
        }
      } catch (error) {
        console.error('Error loading templates:', error);
      }
    };
    loadTemplates();
  }, []);

  useEffect(() => {
    if (product?.barcode) {
      setBarcode(product.barcode);
    } else if (product) {
      generateNewBarcode();
    }
  }, [product]);

  useEffect(() => {
    if (barcode && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, barcode, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
        });
      } catch (error) {
        console.error('Barcode generation error:', error);
      }
    }
  }, [barcode]);

  const generateNewBarcode = () => {
    // Generowanie kodu EAN-13 (tylko cyfry)
    const prefix = '590'; // Prefix dla Polski
    let code = prefix;
    for (let i = 0; i < 9; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    // Oblicz cyfrę kontrolną EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    setBarcode(code + checkDigit.toString());
  };

  const handleSaveBarcode = async () => {
    if (!product || !barcode) return;

    setIsGenerating(true);
    try {
      await onGenerate(product.id, barcode);
      onClose();
    } catch (error) {
      console.error('Error saving barcode:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Replace template placeholders with actual values
  const replacePlaceholders = (content: string): string => {
    if (!product) return content;
    return content
      .replace(/\{\{plantName\}\}/g, product.plantName || '')
      .replace(/\{\{productName\}\}/g, product.plantName || '')
      .replace(/\{\{potSize\}\}/g, product.potSize || '')
      .replace(/\{\{plantHeightCm\}\}/g, product.plantHeightCm?.toString() || '')
      .replace(/\{\{unitsPerPallet\}\}/g, product.unitsPerPallet?.toString() || '')
      .replace(/\{\{barcode\}\}/g, barcode || '')
      .replace(/\{\{purchasePrice\}\}/g, product.purchasePricePln?.toFixed(2) || '')
      .replace(/\{\{salePrice\}\}/g, product.basePriceGross?.toFixed(2) || '');
  };

  // Generate print HTML from template
  const generateTemplateHtml = (template: PrintTemplate): string => {
    const mmToPx = 3.7795275591;

    // Generate styles for each element
    const elementsHtml = template.elements.map(el => {
      const style = el.style || {};
      const x = el.x * mmToPx;
      const y = el.y * mmToPx;
      const width = el.width * mmToPx;
      const height = el.height * mmToPx;

      const baseStyles = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${width}px;
        height: ${height}px;
        font-size: ${style.fontSize || 10}px;
        font-weight: ${style.fontWeight || 'normal'};
        text-align: ${style.textAlign || 'left'};
        color: ${style.color || '#000000'};
        background-color: ${style.backgroundColor || 'transparent'};
        border-width: ${style.borderWidth || 0}px;
        border-color: ${style.borderColor || '#000000'};
        border-style: solid;
        border-radius: ${style.borderRadius || 0}px;
        transform: rotate(${style.rotation || 0}deg);
        transform-origin: center center;
        box-sizing: border-box;
        overflow: hidden;
      `;

      const content = replacePlaceholders(el.content || '');

      switch (el.type) {
        case 'text':
          return '<div style="' + baseStyles + ' display: flex; align-items: center; padding: 1px;">' + content + '</div>';
        case 'barcode':
          // Pass element dimensions as data attributes for JsBarcode
          const barcodeWidth = Math.max(0.5, Math.min(3, el.width / 30)); // Scale width relative to element width
          const barcodeHeight = Math.max(20, Math.min(100, el.height * 0.7)); // Scale height to ~70% of element height
          return '<svg class="template-barcode" data-barcode="' + content + '" data-width="' + barcodeWidth + '" data-height="' + barcodeHeight + '" style="' + baseStyles + '"></svg>';
        case 'rectangle':
          return '<div style="' + baseStyles + '"></div>';
        case 'line':
          return '<div style="' + baseStyles + ' height: ' + (style.borderWidth || 1) + 'px; background-color: ' + (style.borderColor || '#000') + '; border: none;"></div>';
        default:
          return '';
      }
    }).join('');

    return '<div class="template-label" style="width: ' + (template.paperWidth * mmToPx) + 'px; height: ' + (template.paperHeight * mmToPx) + 'px; position: relative; margin: 0; box-sizing: border-box; page-break-inside: avoid;">' + elementsHtml + '</div>';
  };

  const generatePrintHtml = (): string => {
    let labelsHtml: string;

    if (false && selectedTemplate) { // Disabled - using hardcoded template
      // Use custom template
      labelsHtml = Array(labelCount).fill('').map(() => generateTemplateHtml(selectedTemplate!)).join('');
    } else {
      // Fallback to default hardcoded template
      labelsHtml = Array(labelCount).fill('').map(() =>
        '<div class="label">' +
        '<div class="product-name">' + (product?.plantName || '') + '</div>' +
        '<div class="units-info">' + (product?.unitsPerPallet || '-') + ' szt./paleta</div>' +
        '<svg class="barcode-svg" id="print-barcode"></svg>' +
        '</div>'
      ).join('');
    }

    const paperWidth = selectedTemplate ? selectedTemplate.paperWidth : 50;
    const paperHeight = selectedTemplate ? selectedTemplate.paperHeight : 30;

    return '<!DOCTYPE html><html><head><title>Drukuj kody kreskowe - ' + (product?.plantName || '') + '</title>' +
      '<style>' +
      '@page { size: ' + paperWidth + 'mm ' + paperHeight + 'mm; margin: 0; }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; } body { margin: 0; padding: 0; font-family: Arial, sans-serif; }' +
      '.label-container { width: 100%; }' +
      '.template-label { position: relative; page-break-inside: avoid; page-break-after: always; overflow: hidden; }' +
      '.label { width: ' + paperWidth + 'mm; height: ' + paperHeight + 'mm; padding: 0mm; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid; page-break-after: always; overflow: hidden; }' +
      '.product-name { font-size: 10px; font-weight: bold; text-align: center; max-width: ' + (paperWidth - 2) + 'mm; line-height: 1.2; margin-bottom: 0.5mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-wrap: break-word; }' +
      '.barcode-svg { max-width: ' + (paperWidth - 4) + 'mm; height: auto; margin-top: 4mm; margin-left: 2mm; }' +
      '.units-info { font-size: 6px; font-weight: bold; margin-top: 2.5mm; color: #333; }' +
      '</style></head><body>' +
      '<div class="label-container">' + labelsHtml + '</div>' +
      '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>' +
      '<script>' +
      'document.querySelectorAll(".template-barcode").forEach(function(svg) { var barcodeValue = svg.getAttribute("data-barcode"); var barcodeWidth = parseFloat(svg.getAttribute("data-width")) || 1.5; var barcodeHeight = parseFloat(svg.getAttribute("data-height")) || 50; if (barcodeValue) { JsBarcode(svg, barcodeValue, { format: "CODE128", width: barcodeWidth, height: barcodeHeight, displayValue: true, fontSize: Math.max(8, Math.min(14, barcodeHeight * 0.2)), margin: 0, textMargin: 1 }); } });' +
      'document.querySelectorAll("#print-barcode").forEach(function(svg) { JsBarcode(svg, "' + barcode + '", { format: "CODE128", width: 1.5, height: 50, displayValue: true, fontSize: 10, margin: 0, textMargin: 1 }); });' +
      '</script></body></html>';
  };

  const handlePrint = async () => {
    setShowPrintPreview(true);
    setPrintStatus(null);

    const htmlContent = generatePrintHtml();

    // Use the print hook - it will send to queue if printer is configured, or fallback to browser
    await printBarcodes(htmlContent, {
      title: 'Etykiety - ' + (product?.plantName || ''),
      productId: product?.id,
      copies: labelCount,
    });

    setShowPrintPreview(false);
  };

  if (!product) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Kod kreskowy</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              x
            </button>
          </div>

          {/* Print status notification */}
          {printStatus && (
            <div className={'mb-4 px-4 py-3 rounded-lg text-sm ' + (
              printStatus.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
              printStatus.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
              'bg-blue-100 text-blue-800 border border-blue-200'
            )}>
              {printStatus.message}
            </div>
          )}

          {/* Printer status indicator */}
          <div className="mb-4 flex items-center gap-2 text-sm">
            <div className={'w-2 h-2 rounded-full ' + (hasPrinterConfigured ? 'bg-primary-500' : 'bg-gray-400')}></div>
            <span className={hasPrinterConfigured ? 'text-primary-700' : 'text-gray-600'}>
              {hasPrinterConfigured
                ? 'Drukarka etykiet skonfigurowana - automatyczny wydruk'
                : 'Brak skonfigurowanej drukarki - wydruk przez przegladarke'}
            </span>
          </div>

          <div className="mb-4">
            <p className="text-lg font-medium">{product.plantName}</p>
            <p className="text-sm text-gray-500">
              {product.potSize} {product.plantHeightCm && '/ ' + product.plantHeightCm + 'cm'}
            </p>
            <p className="text-sm text-gray-500">
              {product.unitsPerPallet} szt./paleta
            </p>
          </div>

          <div className="mb-6 flex flex-col items-center">
            <svg ref={barcodeRef} className="max-w-full"></svg>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kod kreskowy
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Wprowadz lub wygeneruj kod"
              />
              <button
                onClick={generateNewBarcode}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                title="Generuj nowy kod Code128"
              >
                Generuj
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Format: Code128 (dowolne znaki alfanumeryczne)
            </p>
          </div>

          {templates.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Szablon etykiety
              </label>
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.paperWidth}x{t.paperHeight}mm)
                    {t.isDefault ? ' - Domyslny' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ilość etykiet do wydruku
            </label>
            <input
              type="number"
              value={labelCount}
              onChange={(e) => setLabelCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              min="1"
              max="100"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Anuluj
            </button>
            {(!product.barcode || barcode !== product.barcode) && (
              <button
                onClick={handleSaveBarcode}
                disabled={!barcode || isGenerating}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {isGenerating ? 'Zapisuje...' : 'Zapisz kod'}
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={!barcode}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
            >
              <span>🖨️</span>
              Drukuj ({labelCount})
            </button>
          </div>
        </div>

        <div ref={printRef} style={{ display: 'none' }}></div>
      </div>
    </div>
  );
}
