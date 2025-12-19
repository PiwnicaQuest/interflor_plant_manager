import { useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { TemplateElement, PrintTemplate, TEMPLATE_PLACEHOLDERS } from '../../types';

interface TemplateEditorProps {
  template: PrintTemplate;
  onSave: (template: PrintTemplate) => void;
  onCancel: () => void;
}

// MM to pixels conversion (96 DPI)
const MM_TO_PX = 3.7795275591;

// Element types available for adding
const ELEMENT_TYPES = [
  { type: 'text', label: 'Tekst', icon: 'T' },
  { type: 'barcode', label: 'Kod kreskowy', icon: '|||' },
  { type: 'qrcode', label: 'Kod QR', icon: '▣' },
  { type: 'rectangle', label: 'Prostokąt', icon: '□' },
  { type: 'line', label: 'Linia', icon: '—' },
  { type: 'image', label: 'Obrazek', icon: '🖼' },
] as const;

export function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const [elements, setElements] = useState<TemplateElement[]>(template.elements || []);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState(template.name);
  const [paperWidth, setPaperWidth] = useState(template.paperWidth);
  const [paperHeight, setPaperHeight] = useState(template.paperHeight);
  const [marginTop, setMarginTop] = useState(template.marginTop ?? 0);
  const [marginRight, setMarginRight] = useState(template.marginRight ?? 0);
  const [marginBottom, setMarginBottom] = useState(template.marginBottom ?? 0);
  const [marginLeft, setMarginLeft] = useState(template.marginLeft ?? 0);
  const [zoom, setZoom] = useState(2); // Default zoom for small labels
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedElement = elements.find(el => el.id === selectedElementId);

  // Calculate canvas size in pixels
  const canvasWidth = paperWidth * MM_TO_PX * zoom;
  const canvasHeight = paperHeight * MM_TO_PX * zoom;

  // Generate unique ID for elements
  const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add new element
  const addElement = (type: TemplateElement['type']) => {
    const newElement: TemplateElement = {
      id: generateId(),
      type,
      x: marginLeft,
      y: marginTop,
      width: type === 'line' ? 20 : 15,
      height: type === 'line' ? 0.5 : (type === 'barcode' ? 10 : 8),
      content: type === 'text' ? 'Nowy tekst' : (type === 'barcode' ? '{{barcode}}' : ''),
      style: {
        fontSize: type === 'text' ? 10 : 8,
        fontWeight: 'normal',
        textAlign: 'left',
        color: '#000000',
        backgroundColor: type === 'rectangle' ? '#ffffff' : 'transparent',
        borderWidth: type === 'rectangle' || type === 'line' ? 1 : 0,
        borderColor: '#000000',
        borderRadius: 0,
      },
    };
    setElements([...elements, newElement]);
    setSelectedElementId(newElement.id);
  };

  // Update element position/size
  const updateElement = (id: string, updates: Partial<TemplateElement>) => {
    setElements(elements.map(el =>
      el.id === id ? { ...el, ...updates } : el
    ));
  };

  // Update element style
  const updateElementStyle = (id: string, styleUpdates: Partial<TemplateElement['style']>) => {
    setElements(elements.map(el =>
      el.id === id ? { ...el, style: { ...el.style, ...styleUpdates } } : el
    ));
  };

  // Delete selected element
  const deleteElement = () => {
    if (selectedElementId) {
      setElements(elements.filter(el => el.id !== selectedElementId));
      setSelectedElementId(null);
    }
  };

  // Duplicate selected element
  const duplicateElement = () => {
    if (selectedElement) {
      const newElement = {
        ...selectedElement,
        id: generateId(),
        x: selectedElement.x + 2,
        y: selectedElement.y + 2,
      };
      setElements([...elements, newElement]);
      setSelectedElementId(newElement.id);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          deleteElement();
        }
      }
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        if (selectedElement) {
          e.preventDefault();
          duplicateElement();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, selectedElement]);

  // Save template
  const handleSave = () => {
    const updatedTemplate: PrintTemplate = {
      ...template,
      name: templateName,
      paperWidth: paperWidth,
      paperHeight: paperHeight,
      marginTop: marginTop,
      marginRight: marginRight,
      marginBottom: marginBottom,
      marginLeft: marginLeft,
      elements,
    };
    onSave(updatedTemplate);
  };

  // Get placeholders for current template type
  const placeholders = TEMPLATE_PLACEHOLDERS[template.type] || [];

  // Insert placeholder into selected element
  const insertPlaceholder = (placeholder: string) => {
    if (selectedElement && (selectedElement.type === 'text' || selectedElement.type === 'barcode')) {
      updateElement(selectedElement.id, {
        content: selectedElement.content + placeholder,
      });
    }
  };

  // Render element on canvas
  const renderElement = (element: TemplateElement) => {
    const style = element.style || {};
    const pxX = element.x * MM_TO_PX * zoom;
    const pxY = element.y * MM_TO_PX * zoom;
    const pxWidth = element.width * MM_TO_PX * zoom;
    const pxHeight = element.height * MM_TO_PX * zoom;

    const commonStyle: React.CSSProperties = {
      fontSize: (style.fontSize || 10) * zoom,
      fontWeight: style.fontWeight || 'normal',
      textAlign: style.textAlign as any || 'left',
      color: style.color || '#000000',
      backgroundColor: style.backgroundColor || 'transparent',
      borderWidth: style.borderWidth ? style.borderWidth * zoom : 0,
      borderColor: style.borderColor || '#000000',
      borderStyle: 'solid',
      borderRadius: (style.borderRadius || 0) * zoom,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: style.textAlign === 'center' ? 'center' : (style.textAlign === 'right' ? 'flex-end' : 'flex-start'),
      overflow: 'hidden',
      boxSizing: 'border-box' as const,
      padding: 2 * zoom,
    };

    let content: React.ReactNode;
    switch (element.type) {
      case 'text':
        content = <div style={commonStyle}>{element.content}</div>;
        break;
      case 'barcode':
        content = (
          <div style={{ ...commonStyle, flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 1 }}>
              {Array(15).fill(0).map((_, i) => (
                <div key={i} style={{
                  width: Math.random() > 0.5 ? 2 * zoom : 1 * zoom,
                  height: pxHeight * 0.7,
                  backgroundColor: '#000'
                }} />
              ))}
            </div>
            <div style={{ fontSize: 8 * zoom, marginTop: 2 }}>{element.content}</div>
          </div>
        );
        break;
      case 'qrcode':
        content = (
          <div style={{ ...commonStyle, justifyContent: 'center', alignItems: 'center' }}>
            <div style={{
              width: Math.min(pxWidth, pxHeight) * 0.9,
              height: Math.min(pxWidth, pxHeight) * 0.9,
              backgroundColor: '#000',
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 1,
              padding: 2,
            }}>
              {Array(25).fill(0).map((_, i) => (
                <div key={i} style={{
                  backgroundColor: Math.random() > 0.4 ? '#000' : '#fff',
                }} />
              ))}
            </div>
          </div>
        );
        break;
      case 'rectangle':
        content = <div style={commonStyle} />;
        break;
      case 'line':
        content = (
          <div style={{
            width: '100%',
            height: style.borderWidth ? style.borderWidth * zoom : zoom,
            backgroundColor: style.borderColor || '#000000'
          }} />
        );
        break;
      case 'image':
        content = (
          <div style={{ ...commonStyle, justifyContent: 'center', alignItems: 'center', border: '1px dashed #ccc' }}>
            <span style={{ fontSize: 10 * zoom, color: '#999' }}>Obrazek</span>
          </div>
        );
        break;
      default:
        content = null;
    }

    const isSelected = selectedElementId === element.id;

    return (
      <Rnd
        key={element.id}
        position={{ x: pxX, y: pxY }}
        size={{ width: pxWidth, height: pxHeight }}
        onDragStop={(_e, d) => {
          updateElement(element.id, {
            x: d.x / (MM_TO_PX * zoom),
            y: d.y / (MM_TO_PX * zoom),
          });
        }}
        onResizeStop={(_e, _direction, ref, _delta, position) => {
          updateElement(element.id, {
            width: parseInt(ref.style.width) / (MM_TO_PX * zoom),
            height: parseInt(ref.style.height) / (MM_TO_PX * zoom),
            x: position.x / (MM_TO_PX * zoom),
            y: position.y / (MM_TO_PX * zoom),
          });
        }}
        onClick={() => setSelectedElementId(element.id)}
        bounds="parent"
        style={{
          border: isSelected ? '2px solid #3b82f6' : '1px dashed transparent',
          cursor: 'move',
        }}
        enableResizing={{
          top: true,
          right: true,
          bottom: true,
          left: true,
          topRight: true,
          bottomRight: true,
          bottomLeft: true,
          topLeft: true,
        }}
      >
        {content}
      </Rnd>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[95vw] h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="text-xl font-bold border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-1"
            />
            <span className="text-sm text-gray-500">
              ({template.type === 'label' ? 'Etykieta' : template.type === 'invoice' ? 'Faktura' : template.type})
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Zapisz szablon
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Elements */}
          <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
            <h3 className="font-medium text-gray-700 mb-3">Dodaj element</h3>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {ELEMENT_TYPES.map(({ type, label, icon }) => (
                <button
                  key={type}
                  onClick={() => addElement(type as TemplateElement['type'])}
                  className="flex flex-col items-center p-3 bg-white border border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <span className="text-xl mb-1">{icon}</span>
                  <span className="text-xs text-gray-600">{label}</span>
                </button>
              ))}
            </div>

            <h3 className="font-medium text-gray-700 mb-3">Zmienne</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {placeholders.map((p) => (
                <button
                  key={p}
                  onClick={() => insertPlaceholder(p)}
                  disabled={!selectedElement || (selectedElement.type !== 'text' && selectedElement.type !== 'barcode')}
                  className="w-full text-left px-2 py-1.5 text-sm bg-white border border-gray-200 rounded hover:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={p}
                >
                  {p}
                </button>
              ))}
            </div>

            <h3 className="font-medium text-gray-700 mt-6 mb-3">Rozmiar papieru (mm)</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="text-xs text-gray-500">Szerokość</label>
                <input
                  type="number"
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Wysokość</label>
                <input
                  type="number"
                  value={paperHeight}
                  onChange={(e) => setPaperHeight(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>

            <h3 className="font-medium text-gray-700 mb-3">Marginesy (mm)</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Góra</label>
                <input
                  type="number"
                  value={marginTop}
                  onChange={(e) => setMarginTop(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Dół</label>
                <input
                  type="number"
                  value={marginBottom}
                  onChange={(e) => setMarginBottom(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Lewy</label>
                <input
                  type="number"
                  value={marginLeft}
                  onChange={(e) => setMarginLeft(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Prawy</label>
                <input
                  type="number"
                  value={marginRight}
                  onChange={(e) => setMarginRight(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>

            <h3 className="font-medium text-gray-700 mt-6 mb-3">Powiększenie</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(Math.max(0.5, zoom - 0.5))}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                -
              </button>
              <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(Math.min(5, zoom + 0.5))}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                +
              </button>
            </div>
          </div>

          {/* Center - Canvas */}
          <div className="flex-1 overflow-auto bg-gray-200 p-8">
            <div
              ref={canvasRef}
              className="bg-white shadow-lg relative mx-auto"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                backgroundImage: `
                  linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)
                `,
                backgroundSize: `${5 * MM_TO_PX * zoom}px ${5 * MM_TO_PX * zoom}px`,
              }}
              onClick={(e) => {
                if (e.target === canvasRef.current) {
                  setSelectedElementId(null);
                }
              }}
            >
              {/* Margin guides */}
              <div
                className="absolute border border-dashed border-blue-300 pointer-events-none"
                style={{
                  left: marginLeft * MM_TO_PX * zoom,
                  top: marginTop * MM_TO_PX * zoom,
                  width: (paperWidth - marginLeft - marginRight) * MM_TO_PX * zoom,
                  height: (paperHeight - marginTop - marginBottom) * MM_TO_PX * zoom,
                }}
              />

              {/* Elements */}
              {elements.map(renderElement)}
            </div>
          </div>

          {/* Right Panel - Properties */}
          <div className="w-72 border-l bg-gray-50 p-4 overflow-y-auto">
            {selectedElement ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium text-gray-700">Właściwości</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={duplicateElement}
                      className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-200 rounded"
                      title="Duplikuj (Ctrl+D)"
                    >
                      📋
                    </button>
                    <button
                      onClick={deleteElement}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded"
                      title="Usuń (Delete)"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Position & Size */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">Pozycja i rozmiar (mm)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">X</label>
                      <input
                        type="number"
                        value={selectedElement.x.toFixed(1)}
                        onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        step="0.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Y</label>
                      <input
                        type="number"
                        value={selectedElement.y.toFixed(1)}
                        onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        step="0.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Szerokość</label>
                      <input
                        type="number"
                        value={selectedElement.width.toFixed(1)}
                        onChange={(e) => updateElement(selectedElement.id, { width: Number(e.target.value) })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        step="0.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Wysokość</label>
                      <input
                        type="number"
                        value={selectedElement.height.toFixed(1)}
                        onChange={(e) => updateElement(selectedElement.id, { height: Number(e.target.value) })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        step="0.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Content */}
                {(selectedElement.type === 'text' || selectedElement.type === 'barcode') && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Treść</h4>
                    <textarea
                      value={selectedElement.content || ''}
                      onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      rows={3}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Użyj zmiennych np. {"{{plantName}}"} z listy po lewej
                    </p>
                  </div>
                )}

                {/* Font settings */}
                {selectedElement.type === 'text' && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Czcionka</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Rozmiar</label>
                        <input
                          type="number"
                          value={selectedElement.style?.fontSize || 10}
                          onChange={(e) => updateElementStyle(selectedElement.id, { fontSize: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Grubość</label>
                        <select
                          value={selectedElement.style?.fontWeight || 'normal'}
                          onChange={(e) => updateElementStyle(selectedElement.id, { fontWeight: e.target.value as any })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="normal">Normalna</option>
                          <option value="bold">Pogrubiona</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-xs text-gray-500">Wyrównanie</label>
                      <div className="flex gap-1 mt-1">
                        {['left', 'center', 'right'].map((align) => (
                          <button
                            key={align}
                            onClick={() => updateElementStyle(selectedElement.id, { textAlign: align as any })}
                            className={`flex-1 py-1 border rounded text-sm ${
                              selectedElement.style?.textAlign === align
                                ? 'bg-primary-100 border-primary-500 text-primary-700'
                                : 'border-gray-300 hover:bg-gray-100'
                            }`}
                          >
                            {align === 'left' ? '⬅' : align === 'center' ? '⬌' : '➡'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Colors */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">Kolory</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedElement.type !== 'line' && (
                      <>
                        <div>
                          <label className="text-xs text-gray-500">Tekst/Linia</label>
                          <input
                            type="color"
                            value={selectedElement.style?.color || '#000000'}
                            onChange={(e) => updateElementStyle(selectedElement.id, { color: e.target.value })}
                            className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Tło</label>
                          <input
                            type="color"
                            value={selectedElement.style?.backgroundColor || '#ffffff'}
                            onChange={(e) => updateElementStyle(selectedElement.id, { backgroundColor: e.target.value })}
                            className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Border */}
                {(selectedElement.type === 'rectangle' || selectedElement.type === 'line') && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Obramowanie</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Grubość</label>
                        <input
                          type="number"
                          value={selectedElement.style?.borderWidth || 1}
                          onChange={(e) => updateElementStyle(selectedElement.id, { borderWidth: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          min="0"
                          step="0.5"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Kolor</label>
                        <input
                          type="color"
                          value={selectedElement.style?.borderColor || '#000000'}
                          onChange={(e) => updateElementStyle(selectedElement.id, { borderColor: e.target.value })}
                          className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                        />
                      </div>
                      {selectedElement.type === 'rectangle' && (
                        <div className="col-span-2">
                          <label className="text-xs text-gray-500">Zaokrąglenie</label>
                          <input
                            type="number"
                            value={selectedElement.style?.borderRadius || 0}
                            onChange={(e) => updateElementStyle(selectedElement.id, { borderRadius: Number(e.target.value) })}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            min="0"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <p className="mb-2">Wybierz element</p>
                <p className="text-sm">lub dodaj nowy z panelu po lewej</p>
              </div>
            )}

            {/* Elements list */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="font-medium text-gray-700 mb-3">Elementy ({elements.length})</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {elements.map((el, index) => (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer ${
                      selectedElementId === el.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'hover:bg-gray-200'
                    }`}
                  >
                    <span className="text-sm truncate">
                      {index + 1}. {el.type === 'text' ? (el.content || 'Tekst').slice(0, 20) : el.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
