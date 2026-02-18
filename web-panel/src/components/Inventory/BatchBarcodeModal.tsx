import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, PrintTemplate } from '../../types';
import { API } from '../../services/api';
import { usePrint } from '../../hooks/usePrint';

interface ProductWithQuantity {
  product: Product;
  quantity: number;
}

interface BatchBarcodeModalProps {
  products: Product[];
  onClose: () => void;
}

export function BatchBarcodeModal({ products, onClose }: BatchBarcodeModalProps) {
  const [productsWithQuantity, setProductsWithQuantity] = useState<ProductWithQuantity[]>(
    products.map(p => ({ product: p, quantity: 1 }))
  );
  const [isPrinting, setIsPrinting] = useState(false);
  const previewRefs = useRef<Map<number, SVGSVGElement>>(new Map());
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
    // Generate barcodes for preview
    productsWithQuantity.forEach(({ product }) => {
      const svg = previewRefs.current.get(product.id);
      if (svg && product.barcode) {
        try {
          JsBarcode(svg, product.barcode, {
            format: 'CODE128',
            width: 1.5,
            height: 40,
            displayValue: true,
            fontSize: 10,
            margin: 5,
          });
        } catch (error) {
          console.error('Barcode generation error:', error);
        }
      }
    });
  }, [productsWithQuantity]);

  const handleQuantityChange = (productId: number, quantity: number) => {
    setProductsWithQuantity(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity: Math.max(0, Math.min(100, quantity)) }
          : item
      )
    );
  };

  const getTotalLabels = () => {
    return productsWithQuantity.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getProductsWithBarcodes = () => {
    return productsWithQuantity.filter(item => item.product.barcode && item.quantity > 0);
  };

  const getProductsWithoutBarcodes = () => {
    return productsWithQuantity.filter(item => !item.product.barcode);
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Replace template placeholders with actual values
  const replacePlaceholders = (content: string, product: Product): string => {
    return content
      .replace(/\{\{plantName\}\}/g, product.plantName || '')
      .replace(/\{\{productName\}\}/g, product.plantName || '')
      .replace(/\{\{potSize\}\}/g, product.potSize || '')
      .replace(/\{\{plantHeightCm\}\}/g, product.plantHeightCm?.toString() || '')
      .replace(/\{\{unitsPerPallet\}\}/g, product.unitsPerPallet?.toString() || '')
      .replace(/\{\{barcode\}\}/g, product.barcode || '')
      .replace(/\{\{purchasePrice\}\}/g, product.purchasePricePln?.toFixed(2) || '')
      .replace(/\{\{salePrice\}\}/g, product.basePriceGross?.toFixed(2) || '');
  };

  // Generate print HTML from template for a product
  const generateTemplateHtml = (template: PrintTemplate, product: Product): string => {
    const mmToPx = 3.7795275591;

    const elementsHtml = template.elements.map(el => {
      const style = el.style || {};
      const x = el.x * mmToPx;
      const y = el.y * mmToPx;
      const width = el.width * mmToPx;
      const height = el.height * mmToPx;

      const baseStyles = 'position: absolute; left: ' + x + 'px; top: ' + y + 'px; width: ' + width + 'px; height: ' + height + 'px; ' +
        'font-size: ' + (style.fontSize || 10) + 'px; font-weight: ' + (style.fontWeight || 'normal') + '; ' +
        'text-align: ' + (style.textAlign || 'left') + '; color: ' + (style.color || '#000000') + '; ' +
        'background-color: ' + (style.backgroundColor || 'transparent') + '; border-width: ' + (style.borderWidth || 0) + 'px; ' +
        'border-color: ' + (style.borderColor || '#000000') + '; border-style: solid; border-radius: ' + (style.borderRadius || 0) + 'px; ' +
        'box-sizing: border-box; overflow: hidden;';

      const content = replacePlaceholders(el.content || '', product);

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

    return '<div class="label" style="width: ' + (template.paperWidth * mmToPx) + 'px; height: ' + (template.paperHeight * mmToPx) + 'px; position: relative; margin: 0; box-sizing: border-box; page-break-inside: avoid;">' + elementsHtml + '</div>';
  };

  const generatePrintHtml = (): string => {
    const productsToprint = getProductsWithBarcodes();

    // Generate labels HTML
    let labelsHtml: string;

    if (selectedTemplate) {
      labelsHtml = productsToprint.flatMap(({ product, quantity }) =>
        Array(quantity).fill('').map(() => generateTemplateHtml(selectedTemplate, product))
      ).join('');
    } else {
      labelsHtml = productsToprint.flatMap(({ product, quantity }) =>
        Array(quantity).fill('').map(() =>
          '<div class="label">' +
          '<div class="product-name">' + (product.plantName || '') + '</div>' +
          '<div class="product-info">' + (product.potSize || '') + (product.plantHeightCm ? ' / ' + product.plantHeightCm + 'cm' : '') + '</div>' +
          '<svg class="barcode-svg" data-barcode="' + product.barcode + '"></svg>' +
          '<div class="units-info">' + (product.unitsPerPallet || '-') + ' szt./paleta</div>' +
          '</div>'
        )
      ).join('');
    }

    const paperWidth = selectedTemplate ? selectedTemplate.paperWidth : 50;
    const paperHeight = selectedTemplate ? selectedTemplate.paperHeight : 30;

    return '<!DOCTYPE html><html><head><title>Drukuj kody kreskowe - Zbiorczo</title>' +
      '<style>' +
      '@page { size: ' + paperWidth + 'mm ' + paperHeight + 'mm; margin: 1mm; }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; } body { margin: 0; padding: 0; font-family: Arial, sans-serif; }' +
      '.label-container { width: 100%; }' +
      '.label { width: ' + paperWidth + 'mm; height: ' + paperHeight + 'mm; padding: 1mm; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid; }' +
      '.product-name { font-size: 8px; font-weight: bold; margin-bottom: 1mm; text-align: center; max-width: ' + (paperWidth - 4) + 'mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
      '.product-info { font-size: 7px; color: #333; margin-bottom: 1mm; }' +
      '.barcode-svg { max-width: ' + (paperWidth - 4) + 'mm; height: auto; }' +
      '.units-info { font-size: 6px; font-weight: bold; margin-top: 0.5mm; color: #333; }' +
      '</style></head><body>' +
      '<div class="label-container">' + labelsHtml + '</div>' +
      '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>' +
      '<script>' +
      'document.querySelectorAll(".template-barcode").forEach(function(svg) { var barcode = svg.getAttribute("data-barcode"); var barcodeWidth = parseFloat(svg.getAttribute("data-width")) || 1.5; var barcodeHeight = parseFloat(svg.getAttribute("data-height")) || 50; if (barcode) { JsBarcode(svg, barcode, { format: "CODE128", width: barcodeWidth, height: barcodeHeight, displayValue: true, fontSize: Math.max(8, Math.min(14, barcodeHeight * 0.2)), margin: 0, textMargin: 1 }); } });' +
      'document.querySelectorAll(".barcode-svg").forEach(function(svg) { var barcode = svg.getAttribute("data-barcode"); if (barcode) { JsBarcode(svg, barcode, { format: "CODE128", width: 1.5, height: 50, displayValue: true, fontSize: 10, margin: 0, textMargin: 1 }); } });' +
      '</script></body></html>';
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    setPrintStatus(null);

    const productsToprint = getProductsWithBarcodes();
    if (productsToprint.length === 0) {
      setPrintStatus({
        type: 'error',
        message: 'Brak produktów z kodami kreskowymi do wydruku',
      });
      setIsPrinting(false);
      return;
    }

    const htmlContent = generatePrintHtml();

    // Use the print hook - it will send to queue if printer is configured, or fallback to browser
    await printBarcodes(htmlContent, {
      title: 'Etykiety zbiorczo - ' + getTotalLabels() + ' szt.',
    });

    setIsPrinting(false);
  };

  const productsWithoutBarcodes = getProductsWithoutBarcodes();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Drukuj kody kreskowe - {products.length} produktów</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              x
            </button>
          </div>

          {/* Printer status indicator */}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <div className={'w-2 h-2 rounded-full ' + (hasPrinterConfigured ? 'bg-primary-500' : 'bg-gray-400')}></div>
            <span className={hasPrinterConfigured ? 'text-primary-700' : 'text-gray-600'}>
              {hasPrinterConfigured
                ? 'Drukarka etykiet skonfigurowana - automatyczny wydruk'
                : 'Brak skonfigurowanej drukarki - wydruk przez przegladarke'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
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

          {productsWithoutBarcodes.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm font-medium">
                {productsWithoutBarcodes.length} produkt(ow) nie ma przypisanego kodu kreskowego:
              </p>
              <ul className="mt-2 text-sm text-yellow-700">
                {productsWithoutBarcodes.slice(0, 5).map(({ product }) => (
                  <li key={product.id}>* {product.plantName}</li>
                ))}
                {productsWithoutBarcodes.length > 5 && (
                  <li>* ... i {productsWithoutBarcodes.length - 5} wiecej</li>
                )}
              </ul>
            </div>
          )}

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

          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Produkt</th>
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 w-32">Podgląd kodu</th>
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 w-24">Ilość</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {productsWithQuantity.map(({ product, quantity }) => (
                <tr key={product.id} className={!product.barcode ? 'bg-gray-50 opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{product.plantName}</div>
                    <div className="text-sm text-gray-500">
                      {product.potSize} {product.plantHeightCm && '/ ' + product.plantHeightCm + 'cm'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {product.unitsPerPallet} szt./paleta
                    </div>
                    {!product.barcode && (
                      <div className="text-xs text-red-500 mt-1">Brak kodu kreskowego</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {product.barcode ? (
                      <svg
                        ref={(el) => {
                          if (el) previewRefs.current.set(product.id, el);
                        }}
                        className="inline-block"
                        style={{ maxWidth: '100px' }}
                      />
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => handleQuantityChange(product.id, parseInt(e.target.value) || 0)}
                      disabled={!product.barcode}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      min="0"
                      max="100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Łącznie etykiet do wydruku: <span className="font-bold text-lg">{getTotalLabels()}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Anuluj
              </button>
              <button
                onClick={handlePrint}
                disabled={getTotalLabels() === 0 || isPrinting}
                className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>🖨️</span>
                Drukuj ({getTotalLabels()})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
