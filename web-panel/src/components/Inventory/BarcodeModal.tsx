import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, PrintTemplate } from '../../types';
import { API } from '../../services/api';

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
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const code = 'PLM' + timestamp + random;
    setBarcode(code);
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
        box-sizing: border-box;
        overflow: hidden;
      `;

      const content = replacePlaceholders(el.content || '');

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
    setShowPrintPreview(true);
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      let labelsHtml: string;

      if (selectedTemplate) {
        // Use custom template
        labelsHtml = Array(labelCount).fill('').map(() => generateTemplateHtml(selectedTemplate)).join('');
      } else {
        // Fallback to default hardcoded template
        labelsHtml = Array(labelCount).fill('').map(() => `
          <div class="label">
            <div class="product-name">${product?.plantName || ''}</div>
            <div class="product-info">${product?.potSize || ''} ${product?.plantHeightCm ? `/ ${product.plantHeightCm}cm` : ''}</div>
            <svg class="barcode-svg" id="print-barcode"></svg>
            <div class="units-info">${product?.unitsPerPallet || '-'} szt./paleta</div>
          </div>
        `).join('');
      }

      const paperWidth = selectedTemplate ? selectedTemplate.paperWidth : 50;
      const paperHeight = selectedTemplate ? selectedTemplate.paperHeight : 30;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Drukuj kody kreskowe - ${product?.plantName}</title>
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
              const barcodeValue = svg.getAttribute('data-barcode');
              if (barcodeValue) {
                JsBarcode(svg, barcodeValue, {
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
            document.querySelectorAll('#print-barcode').forEach(svg => {
              JsBarcode(svg, "${barcode}", {
                format: "CODE128",
                width: 1.5,
                height: 35,
                displayValue: true,
                fontSize: 8,
                margin: 2
              });
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
      setShowPrintPreview(false);
    }, 100);
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
              ×
            </button>
          </div>

          <div className="mb-4">
            <p className="text-lg font-medium">{product.plantName}</p>
            <p className="text-sm text-gray-500">
              {product.potSize} {product.plantHeightCm && `/ ${product.plantHeightCm}cm`}
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
                placeholder="Wprowadź lub wygeneruj kod"
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
                    {t.isDefault ? ' - Domyślny' : ''}
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
            {!product.barcode && (
              <button
                onClick={handleSaveBarcode}
                disabled={!barcode || isGenerating}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {isGenerating ? 'Zapisuję...' : 'Zapisz kod'}
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={!barcode}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
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
