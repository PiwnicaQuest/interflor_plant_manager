import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, PrintTemplate } from '../../types';
import { API } from '../../services/api';

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
        box-sizing: border-box;
        overflow: hidden;
      `;

      const content = replacePlaceholders(el.content || '', product);

      switch (el.type) {
        case 'text':
          return `<div style="${baseStyles} display: flex; align-items: center; padding: 1px;">${content}</div>`;
        case 'barcode':
          return `<svg class="template-barcode" data-barcode="${content}" style="${baseStyles}"></svg>`;
        case 'rectangle':
          return `<div style="${baseStyles}"></div>`;
        case 'line':
          return `<div style="${baseStyles} height: ${style.borderWidth || 1}px; background-color: ${style.borderColor || '#000'}; border: none;"></div>`;
        default:
          return '';
      }
    }).join('');

    return `
      <div class="label" style="
        width: ${template.paperWidth * mmToPx}px;
        height: ${template.paperHeight * mmToPx}px;
        position: relative;
        border: 1px solid #ddd;
        margin: 2px;
        box-sizing: border-box;
        page-break-inside: avoid;
      ">
        ${elementsHtml}
      </div>
    `;
  };

  const handlePrint = () => {
    setIsPrinting(true);

    const productsToprint = getProductsWithBarcodes();
    if (productsToprint.length === 0) {
      alert('Brak produktów z kodami kreskowymi do wydruku');
      setIsPrinting(false);
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setIsPrinting(false);
      return;
    }

    // Generate labels HTML
    let labelsHtml: string;

    if (selectedTemplate) {
      labelsHtml = productsToprint.flatMap(({ product, quantity }) =>
        Array(quantity).fill('').map(() => generateTemplateHtml(selectedTemplate, product))
      ).join('');
    } else {
      labelsHtml = productsToprint.flatMap(({ product, quantity }) =>
        Array(quantity).fill('').map(() => `
          <div class="label">
            <div class="product-name">${product.plantName || ''}</div>
            <div class="product-info">${product.potSize || ''} ${product.plantHeightCm ? `/ ${product.plantHeightCm}cm` : ''}</div>
            <svg class="barcode-svg" data-barcode="${product.barcode}"></svg>
            <div class="units-info">${product.unitsPerPallet || '-'} szt./paleta</div>
          </div>
        `)
      ).join('');
    }

    const paperWidth = selectedTemplate ? selectedTemplate.paperWidth : 50;
    const paperHeight = selectedTemplate ? selectedTemplate.paperHeight : 30;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Drukuj kody kreskowe - Zbiorczo</title>
        <style>
          @page {
            size: ${paperWidth}mm ${paperHeight}mm;
            margin: 1mm;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
          }
          .label-container {
            display: flex;
            flex-wrap: wrap;
            gap: 1mm;
          }
          .label {
            width: ${paperWidth - 2}mm;
            height: ${paperHeight - 2}mm;
            border: 1px solid #ddd;
            padding: 1mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            page-break-inside: avoid;
          }
          .product-name {
            font-size: 8px;
            font-weight: bold;
            margin-bottom: 1mm;
            text-align: center;
            max-width: ${paperWidth - 4}mm;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .product-info {
            font-size: 7px;
            color: #333;
            margin-bottom: 1mm;
          }
          .barcode-svg {
            max-width: ${paperWidth - 6}mm;
            height: auto;
          }
          .units-info {
            font-size: 7px;
            font-weight: bold;
            margin-top: 1mm;
            color: #333;
          }
          @media print {
            .label {
              border: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="label-container">
          ${labelsHtml}
        </div>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        <script>
          // Handle template barcodes
          document.querySelectorAll('.template-barcode').forEach(svg => {
            const barcode = svg.getAttribute('data-barcode');
            if (barcode) {
              JsBarcode(svg, barcode, {
                format: 'CODE128',
                width: 1.5,
                height: 35,
                displayValue: true,
                fontSize: 8,
                margin: 2
              });
            }
          });
          // Handle default template barcodes
          document.querySelectorAll('.barcode-svg').forEach(svg => {
            const barcode = svg.getAttribute('data-barcode');
            if (barcode) {
              JsBarcode(svg, barcode, {
                format: 'CODE128',
                width: 1.5,
                height: 35,
                displayValue: true,
                fontSize: 8,
                margin: 2
              });
            }
          });
          setTimeout(() => {
            window.print();
            window.close();
          }, 500);
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
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
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {productsWithoutBarcodes.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm font-medium">
                ⚠️ {productsWithoutBarcodes.length} produkt(ów) nie ma przypisanego kodu kreskowego:
              </p>
              <ul className="mt-2 text-sm text-yellow-700">
                {productsWithoutBarcodes.slice(0, 5).map(({ product }) => (
                  <li key={product.id}>• {product.plantName}</li>
                ))}
                {productsWithoutBarcodes.length > 5 && (
                  <li>• ... i {productsWithoutBarcodes.length - 5} więcej</li>
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
                    {t.isDefault ? ' - Domyślny' : ''}
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
                      {product.potSize} {product.plantHeightCm && `/ ${product.plantHeightCm}cm`}
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
                      <span className="text-gray-400 text-sm">—</span>
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
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
