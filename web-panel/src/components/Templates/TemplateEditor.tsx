import { useState, useRef, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { TemplateElement, PrintTemplate, TEMPLATE_PLACEHOLDERS } from '../../types';

interface TemplateEditorProps {
  template: PrintTemplate;
  onSave: (template: PrintTemplate) => void;
  onCancel: () => void;
}

// MM to pixels conversion (96 DPI)
const MM_TO_PX = 3.7795275591;

// Common label sizes
const LABEL_PRESETS = [
  { name: '50 × 30 mm', width: 50, height: 30 },
  { name: '57 × 30 mm', width: 57, height: 30 },
  { name: '40 × 25 mm', width: 40, height: 25 },
  { name: '60 × 40 mm', width: 60, height: 40 },
  { name: '100 × 50 mm', width: 100, height: 50 },
  { name: '100 × 70 mm', width: 100, height: 70 },
];

// Element types available for adding
const ELEMENT_TYPES = [
  { type: 'text', label: 'Tekst', icon: 'T' },
  { type: 'barcode', label: 'Kod kreskowy', icon: '|||' },
  { type: 'qrcode', label: 'Kod QR', icon: '▣' },
  { type: 'rectangle', label: 'Prostokąt', icon: '□' },
  { type: 'line', label: 'Linia', icon: '—' },
] as const;

// Sample data for preview
const SAMPLE_DATA: Record<string, string> = {
  plantName: 'Róża wielkokwiatowa',
  productName: 'Róża wielkokwiatowa',
  potSize: 'C2',
  plantHeightCm: '40',
  unitsPerPallet: '120',
  barcode: '5901234567890',
  purchasePrice: '12.50',
  salePrice: '24.99',
  growerPassport: 'PL-12345',
};

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
  const [zoom, setZoom] = useState(2);
  const [showPreview, setShowPreview] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(1);
  const [history, setHistory] = useState<TemplateElement[][]>([template.elements || []]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedElement = elements.find(el => el.id === selectedElementId);
  const canvasWidth = paperWidth * MM_TO_PX * zoom;
  const canvasHeight = paperHeight * MM_TO_PX * zoom;

  // Save to history
  const saveToHistory = useCallback((newElements: TemplateElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newElements)));
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  }, [history, historyIndex]);

  // Snap value to grid
  const snapValue = (value: number): number => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  };

  const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add new element
  const addElement = (type: TemplateElement['type']) => {
    const newElement: TemplateElement = {
      id: generateId(),
      type,
      x: marginLeft,
      y: marginTop,
      width: type === 'line' ? 20 : 15,
      height: type === 'line' ? 0.5 : (type === 'barcode' || type === 'qrcode' ? 10 : 6),
      content: type === 'text' ? 'Nowy tekst' : (type === 'barcode' ? '{{barcode}}' : (type === 'qrcode' ? '{{barcode}}' : '')),
      style: {
        fontSize: type === 'text' ? 10 : 8,
        fontWeight: 'normal',
        fontFamily: 'Arial',
        textAlign: 'left',
        color: '#000000',
        backgroundColor: type === 'rectangle' ? '#ffffff' : 'transparent',
        borderWidth: type === 'rectangle' || type === 'line' ? 1 : 0,
        borderColor: '#000000',
        borderRadius: 0,
      },
    };
    const newElements = [...elements, newElement];
    setElements(newElements);
    setSelectedElementId(newElement.id);
    saveToHistory(newElements);
  };

  // Update element
  const updateElement = (id: string, updates: Partial<TemplateElement>, addToHistory = true) => {
    const newElements = elements.map(el => el.id === id ? { ...el, ...updates } : el);
    setElements(newElements);
    if (addToHistory) saveToHistory(newElements);
  };

  // Update element style
  const updateElementStyle = (id: string, styleUpdates: Partial<TemplateElement['style']>) => {
    const newElements = elements.map(el =>
      el.id === id ? { ...el, style: { ...el.style, ...styleUpdates } } : el
    );
    setElements(newElements);
    saveToHistory(newElements);
  };

  // Delete element
  const deleteElement = useCallback(() => {
    if (selectedElementId) {
      const newElements = elements.filter(el => el.id !== selectedElementId);
      setElements(newElements);
      setSelectedElementId(null);
      saveToHistory(newElements);
    }
  }, [selectedElementId, elements, saveToHistory]);

  // Duplicate element
  const duplicateElement = useCallback(() => {
    if (selectedElement) {
      const newElement = {
        ...JSON.parse(JSON.stringify(selectedElement)),
        id: generateId(),
        x: selectedElement.x + 2,
        y: selectedElement.y + 2,
      };
      const newElements = [...elements, newElement];
      setElements(newElements);
      setSelectedElementId(newElement.id);
      saveToHistory(newElements);
    }
  }, [selectedElement, elements, saveToHistory]);

  // Move element in layer order
  const moveLayer = (direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (!selectedElementId) return;
    const index = elements.findIndex(el => el.id === selectedElementId);
    if (index === -1) return;

    const newElements = [...elements];
    const [element] = newElements.splice(index, 1);

    switch (direction) {
      case 'up':
        newElements.splice(Math.min(index + 1, newElements.length), 0, element);
        break;
      case 'down':
        newElements.splice(Math.max(index - 1, 0), 0, element);
        break;
      case 'top':
        newElements.push(element);
        break;
      case 'bottom':
        newElements.unshift(element);
        break;
    }
    setElements(newElements);
    saveToHistory(newElements);
  };

  // Alignment functions
  const alignElement = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!selectedElement) return;
    const printableWidth = paperWidth - marginLeft - marginRight;
    const printableHeight = paperHeight - marginTop - marginBottom;
    let updates: Partial<TemplateElement> = {};

    switch (alignment) {
      case 'left':
        updates.x = marginLeft;
        break;
      case 'center':
        updates.x = marginLeft + (printableWidth - selectedElement.width) / 2;
        break;
      case 'right':
        updates.x = paperWidth - marginRight - selectedElement.width;
        break;
      case 'top':
        updates.y = marginTop;
        break;
      case 'middle':
        updates.y = marginTop + (printableHeight - selectedElement.height) / 2;
        break;
      case 'bottom':
        updates.y = paperHeight - marginBottom - selectedElement.height;
        break;
    }
    updateElement(selectedElement.id, updates);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused) {
        e.preventDefault();
        deleteElement();
      }
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicateElement();
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
      // Arrow key movement
      if (selectedElement && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !isInputFocused) {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : (snapToGrid ? gridSize : 0.5);
        let updates: Partial<TemplateElement> = {};
        switch (e.key) {
          case 'ArrowUp': updates.y = Math.max(0, selectedElement.y - step); break;
          case 'ArrowDown': updates.y = Math.min(paperHeight - selectedElement.height, selectedElement.y + step); break;
          case 'ArrowLeft': updates.x = Math.max(0, selectedElement.x - step); break;
          case 'ArrowRight': updates.x = Math.min(paperWidth - selectedElement.width, selectedElement.x + step); break;
        }
        updateElement(selectedElement.id, updates, false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, selectedElement, undo, redo, deleteElement, duplicateElement, snapToGrid, gridSize, paperWidth, paperHeight]);

  // Save template
  const handleSave = () => {
    onSave({
      ...template,
      name: templateName,
      paperWidth, paperHeight,
      marginTop, marginRight, marginBottom, marginLeft,
      elements,
    });
  };

  // Replace placeholders with sample data
  const replacePlaceholders = (content: string): string => {
    let result = content;
    Object.entries(SAMPLE_DATA).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return result;
  };

  const placeholders = TEMPLATE_PLACEHOLDERS[template.type] || [];

  const insertPlaceholder = (placeholder: string) => {
    if (selectedElement && ['text', 'barcode', 'qrcode'].includes(selectedElement.type)) {
      updateElement(selectedElement.id, { content: selectedElement.content + placeholder });
    }
  };

  // Render element
  const renderElement = (element: TemplateElement) => {
    const style = element.style || {};
    const pxX = element.x * MM_TO_PX * zoom;
    const pxY = element.y * MM_TO_PX * zoom;
    const pxWidth = element.width * MM_TO_PX * zoom;
    const pxHeight = element.height * MM_TO_PX * zoom;
    const displayContent = showPreview ? replacePlaceholders(element.content || '') : element.content;

    const commonStyle: React.CSSProperties = {
      fontSize: (style.fontSize || 10) * zoom,
      fontWeight: style.fontWeight || 'normal',
      fontFamily: style.fontFamily || 'Arial',
      textAlign: style.textAlign as React.CSSProperties['textAlign'] || 'left',
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
      lineHeight: 1.2,
    };

    let content: React.ReactNode;
    switch (element.type) {
      case 'text':
        content = <div style={commonStyle}>{displayContent}</div>;
        break;
      case 'barcode':
        content = (
          <div style={{ ...commonStyle, flexDirection: 'column', justifyContent: 'center', padding: 0 }}>
            <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              {Array(20).fill(0).map((_, i) => (
                <div key={i} style={{
                  width: (Math.random() > 0.5 ? 2 : 1) * zoom,
                  height: pxHeight * 0.65,
                  backgroundColor: '#000'
                }} />
              ))}
            </div>
            <div style={{ fontSize: 7 * zoom, marginTop: 1 * zoom }}>{displayContent}</div>
          </div>
        );
        break;
      case 'qrcode':
        content = (
          <div style={{ ...commonStyle, justifyContent: 'center', alignItems: 'center', padding: 0 }}>
            <div style={{
              width: Math.min(pxWidth, pxHeight) * 0.9,
              height: Math.min(pxWidth, pxHeight) * 0.9,
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 0,
              backgroundColor: '#fff',
              padding: 2 * zoom,
            }}>
              {Array(49).fill(0).map((_, i) => (
                <div key={i} style={{ backgroundColor: Math.random() > 0.4 ? '#000' : '#fff' }} />
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
            x: snapValue(d.x / (MM_TO_PX * zoom)),
            y: snapValue(d.y / (MM_TO_PX * zoom)),
          });
        }}
        onResizeStop={(_e, _dir, ref, _delta, pos) => {
          updateElement(element.id, {
            width: snapValue(parseInt(ref.style.width) / (MM_TO_PX * zoom)),
            height: snapValue(parseInt(ref.style.height) / (MM_TO_PX * zoom)),
            x: snapValue(pos.x / (MM_TO_PX * zoom)),
            y: snapValue(pos.y / (MM_TO_PX * zoom)),
          });
        }}
        onClick={() => setSelectedElementId(element.id)}
        bounds="parent"
        style={{
          border: isSelected ? '2px solid #3b82f6' : '1px dashed rgba(0,0,0,0.2)',
          cursor: 'move',
        }}
        enableResizing
      >
        {content}
      </Rnd>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl flex flex-col" style={{ width: '95vw', height: '95vh' }}>
        {/* Header */}
        <div className="p-3 border-b flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="text-lg font-bold border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-1 bg-transparent"
            />
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-30" title="Cofnij (Ctrl+Z)">↩</button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-30" title="Ponów (Ctrl+Y)">↪</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} className="rounded" />
              Podgląd danych
            </label>
            <button onClick={onCancel} className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm">Anuluj</button>
            <button onClick={handleSave} className="px-4 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm">Zapisz</button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel */}
          <div className="w-56 border-r bg-gray-50 p-3 overflow-y-auto text-sm">
            <h3 className="font-medium text-gray-700 mb-2">Dodaj element</h3>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {ELEMENT_TYPES.map(({ type, label, icon }) => (
                <button
                  key={type}
                  onClick={() => addElement(type as TemplateElement['type'])}
                  className="flex flex-col items-center p-2 bg-white border border-gray-200 rounded hover:border-primary-500 hover:bg-primary-50"
                  title={label}
                >
                  <span className="text-lg">{icon}</span>
                  <span className="text-xs text-gray-500 truncate w-full text-center">{label}</span>
                </button>
              ))}
            </div>

            <h3 className="font-medium text-gray-700 mb-2">Rozmiar etykiety</h3>
            <select
              value={`${paperWidth}x${paperHeight}`}
              onChange={(e) => {
                const preset = LABEL_PRESETS.find(p => `${p.width}x${p.height}` === e.target.value);
                if (preset) { setPaperWidth(preset.width); setPaperHeight(preset.height); }
              }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
            >
              {LABEL_PRESETS.map(p => (
                <option key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>{p.name}</option>
              ))}
              <option value="custom">Własny...</option>
            </select>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="text-xs text-gray-500">Szer. (mm)</label>
                <input type="number" value={paperWidth} onChange={(e) => setPaperWidth(Number(e.target.value))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Wys. (mm)</label>
                <input type="number" value={paperHeight} onChange={(e) => setPaperHeight(Number(e.target.value))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
              </div>
            </div>

            <h3 className="font-medium text-gray-700 mb-2">Zmienne</h3>
            <div className="space-y-0.5 max-h-32 overflow-y-auto mb-4">
              {placeholders.map((p) => (
                <button
                  key={p}
                  onClick={() => insertPlaceholder(p)}
                  disabled={!selectedElement || !['text', 'barcode', 'qrcode'].includes(selectedElement.type)}
                  className="w-full text-left px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:border-primary-500 disabled:opacity-40 truncate"
                >
                  {p}
                </button>
              ))}
            </div>

            <h3 className="font-medium text-gray-700 mb-2">Siatka</h3>
            <label className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} className="rounded" />
              <span className="text-xs">Przyciągaj do siatki</span>
            </label>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500">Rozmiar:</span>
              <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs">
                <option value={0.5}>0.5 mm</option>
                <option value={1}>1 mm</option>
                <option value={2}>2 mm</option>
                <option value={5}>5 mm</option>
              </select>
            </div>

            <h3 className="font-medium text-gray-700 mb-2">Powiększenie</h3>
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-xs">−</button>
              <span className="text-xs flex-1 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(Math.min(5, zoom + 0.5))} className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-xs">+</button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto bg-gray-300 p-6">
            <div
              ref={canvasRef}
              className="bg-white shadow-lg relative mx-auto"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                backgroundImage: snapToGrid ? `
                  linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)
                ` : 'none',
                backgroundSize: `${gridSize * MM_TO_PX * zoom}px ${gridSize * MM_TO_PX * zoom}px`,
              }}
              onClick={(e) => { if (e.target === canvasRef.current) setSelectedElementId(null); }}
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
              {elements.map(renderElement)}
            </div>
          </div>

          {/* Right Panel - Properties */}
          <div className="w-64 border-l bg-gray-50 p-3 overflow-y-auto text-sm">
            {selectedElement ? (
              <>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-gray-700">Właściwości</h3>
                  <div className="flex gap-0.5">
                    <button onClick={() => moveLayer('down')} className="p-1 hover:bg-gray-200 rounded" title="W dół">⬇</button>
                    <button onClick={() => moveLayer('up')} className="p-1 hover:bg-gray-200 rounded" title="W górę">⬆</button>
                    <button onClick={duplicateElement} className="p-1 hover:bg-gray-200 rounded" title="Duplikuj">📋</button>
                    <button onClick={deleteElement} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Usuń">🗑</button>
                  </div>
                </div>

                {/* Alignment */}
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-gray-600 mb-1">Wyrównanie</h4>
                  <div className="grid grid-cols-6 gap-0.5">
                    <button onClick={() => alignElement('left')} className="p-1.5 bg-white border rounded hover:bg-gray-100" title="Do lewej">⬅</button>
                    <button onClick={() => alignElement('center')} className="p-1.5 bg-white border rounded hover:bg-gray-100" title="Środek H">↔</button>
                    <button onClick={() => alignElement('right')} className="p-1.5 bg-white border rounded hover:bg-gray-100" title="Do prawej">➡</button>
                    <button onClick={() => alignElement('top')} className="p-1.5 bg-white border rounded hover:bg-gray-100" title="Do góry">⬆</button>
                    <button onClick={() => alignElement('middle')} className="p-1.5 bg-white border rounded hover:bg-gray-100" title="Środek V">↕</button>
                    <button onClick={() => alignElement('bottom')} className="p-1.5 bg-white border rounded hover:bg-gray-100" title="Do dołu">⬇</button>
                  </div>
                </div>

                {/* Position */}
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-gray-600 mb-1">Pozycja (mm)</h4>
                  <div className="grid grid-cols-4 gap-1">
                    <div><label className="text-xs text-gray-400">X</label><input type="number" value={selectedElement.x.toFixed(1)} onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })} className="w-full px-1 py-0.5 border rounded text-xs" step="0.5" /></div>
                    <div><label className="text-xs text-gray-400">Y</label><input type="number" value={selectedElement.y.toFixed(1)} onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })} className="w-full px-1 py-0.5 border rounded text-xs" step="0.5" /></div>
                    <div><label className="text-xs text-gray-400">Szer</label><input type="number" value={selectedElement.width.toFixed(1)} onChange={(e) => updateElement(selectedElement.id, { width: Number(e.target.value) })} className="w-full px-1 py-0.5 border rounded text-xs" step="0.5" /></div>
                    <div><label className="text-xs text-gray-400">Wys</label><input type="number" value={selectedElement.height.toFixed(1)} onChange={(e) => updateElement(selectedElement.id, { height: Number(e.target.value) })} className="w-full px-1 py-0.5 border rounded text-xs" step="0.5" /></div>
                  </div>
                </div>

                {/* Content */}
                {['text', 'barcode', 'qrcode'].includes(selectedElement.type) && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-gray-600 mb-1">Treść</h4>
                    <textarea
                      value={selectedElement.content || ''}
                      onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-xs"
                      rows={2}
                    />
                  </div>
                )}

                {/* Font */}
                {selectedElement.type === 'text' && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-gray-600 mb-1">Czcionka</h4>
                    <div className="grid grid-cols-2 gap-1 mb-1">
                      <select
                        value={selectedElement.style?.fontFamily || 'Arial'}
                        onChange={(e) => updateElementStyle(selectedElement.id, { fontFamily: e.target.value })}
                        className="px-1 py-0.5 border rounded text-xs"
                      >
                        <option value="Arial">Arial</option>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times New Roman">Times</option>
                        <option value="Courier New">Courier</option>
                        <option value="Verdana">Verdana</option>
                      </select>
                      <input type="number" value={selectedElement.style?.fontSize || 10} onChange={(e) => updateElementStyle(selectedElement.id, { fontSize: Number(e.target.value) })} className="px-1 py-0.5 border rounded text-xs" min="4" max="72" />
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => updateElementStyle(selectedElement.id, { fontWeight: selectedElement.style?.fontWeight === 'bold' ? 'normal' : 'bold' })}
                        className={`flex-1 py-1 border rounded text-xs font-bold ${selectedElement.style?.fontWeight === 'bold' ? 'bg-primary-100 border-primary-500' : ''}`}
                      >B</button>
                      {['left', 'center', 'right'].map((a) => (
                        <button key={a} onClick={() => updateElementStyle(selectedElement.id, { textAlign: a as 'left' | 'center' | 'right' })} className={`flex-1 py-1 border rounded text-xs ${selectedElement.style?.textAlign === a ? 'bg-primary-100 border-primary-500' : ''}`}>
                          {a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Colors */}
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-gray-600 mb-1">Kolory</h4>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400">Tekst</label>
                      <input type="color" value={selectedElement.style?.color || '#000000'} onChange={(e) => updateElementStyle(selectedElement.id, { color: e.target.value })} className="w-full h-6 border rounded cursor-pointer" />
                    </div>
                    {selectedElement.type !== 'line' && (
                      <div className="flex-1">
                        <label className="text-xs text-gray-400">Tło</label>
                        <input type="color" value={selectedElement.style?.backgroundColor || '#ffffff'} onChange={(e) => updateElementStyle(selectedElement.id, { backgroundColor: e.target.value })} className="w-full h-6 border rounded cursor-pointer" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Border */}
                {['rectangle', 'line'].includes(selectedElement.type) && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-gray-600 mb-1">Obramowanie</h4>
                    <div className="grid grid-cols-3 gap-1">
                      <div><label className="text-xs text-gray-400">Grubość</label><input type="number" value={selectedElement.style?.borderWidth || 1} onChange={(e) => updateElementStyle(selectedElement.id, { borderWidth: Number(e.target.value) })} className="w-full px-1 py-0.5 border rounded text-xs" min="0" step="0.5" /></div>
                      <div><label className="text-xs text-gray-400">Kolor</label><input type="color" value={selectedElement.style?.borderColor || '#000000'} onChange={(e) => updateElementStyle(selectedElement.id, { borderColor: e.target.value })} className="w-full h-6 border rounded cursor-pointer" /></div>
                      {selectedElement.type === 'rectangle' && <div><label className="text-xs text-gray-400">Zaokr.</label><input type="number" value={selectedElement.style?.borderRadius || 0} onChange={(e) => updateElementStyle(selectedElement.id, { borderRadius: Number(e.target.value) })} className="w-full px-1 py-0.5 border rounded text-xs" min="0" /></div>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-400 py-8 text-xs">
                <p>Wybierz element lub dodaj nowy</p>
                <p className="mt-2 text-gray-300">Strzałki = przesuwanie<br/>Delete = usuń<br/>Ctrl+D = duplikuj<br/>Ctrl+Z = cofnij</p>
              </div>
            )}

            {/* Elements list */}
            <div className="mt-4 pt-3 border-t">
              <h3 className="font-medium text-gray-700 mb-2">Elementy ({elements.length})</h3>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {elements.map((el, i) => (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs ${selectedElementId === el.id ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-200'}`}
                  >
                    <span className="text-gray-400">{i + 1}.</span>
                    <span className="truncate">{el.type === 'text' ? (el.content || 'Tekst').slice(0, 15) : el.type}</span>
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
