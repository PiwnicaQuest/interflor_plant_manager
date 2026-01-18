import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HiX, HiMenuAlt4, HiRefresh, HiCheck } from 'react-icons/hi';
import { 
  ALL_COLUMNS, 
  ColumnDefinition,
  COLUMN_GROUP_HEADER_COLORS 
} from './columnDefinitions';

interface SortableColumnItemProps {
  column: ColumnDefinition;
  isVisible: boolean;
  onToggle: () => void;
}

function SortableColumnItem({ column, isVisible, onToggle }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
  };

  const groupColor = COLUMN_GROUP_HEADER_COLORS[column.group];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-2 rounded-lg border ${
        isDragging 
          ? 'bg-blue-100 border-blue-400 shadow-lg' 
          : 'bg-white border-gray-200 hover:border-gray-300'
      } ${column.fixed ? 'opacity-60' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className={`p-1 rounded hover:bg-gray-100 cursor-grab active:cursor-grabbing ${
          column.fixed ? 'opacity-30 cursor-not-allowed' : ''
        }`}
        disabled={column.fixed}
      >
        <HiMenuAlt4 className="w-4 h-4 text-gray-400" />
      </button>

      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={isVisible}
          onChange={onToggle}
          disabled={column.fixed}
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
        />
      </label>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${groupColor}`}>
            {column.group}
          </span>
          <span className="font-medium text-gray-900 truncate">
            {column.label || '(bez nazwy)'}
          </span>
        </div>
        {column.description && (
          <span className="text-xs text-gray-500">{column.description}</span>
        )}
      </div>

      {column.fixed && (
        <span className="text-xs text-gray-400 italic">stale</span>
      )}
    </div>
  );
}

interface ColumnConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnOrder: string[];
  visibleColumns: string[];
  onReorder: (newOrder: string[]) => void;
  onToggleVisibility: (columnKey: string) => void;
  onReset: () => void;
}

export function ColumnConfigModal({
  isOpen,
  onClose,
  columnOrder,
  visibleColumns,
  onReorder,
  onToggleVisibility,
  onReset,
}: ColumnConfigModalProps) {
  const [localOrder, setLocalOrder] = useState<string[]>(columnOrder);
  const [localVisible, setLocalVisible] = useState<string[]>(visibleColumns);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalOrder(columnOrder);
      setLocalVisible(visibleColumns);
      setHasChanges(false);
    }
  }, [isOpen, columnOrder, visibleColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localOrder.indexOf(active.id as string);
      const newIndex = localOrder.indexOf(over.id as string);
      const newOrder = arrayMove(localOrder, oldIndex, newIndex);
      setLocalOrder(newOrder);
      setHasChanges(true);
    }
  };

  const handleToggle = (columnKey: string) => {
    const column = ALL_COLUMNS.find(col => col.key === columnKey);
    if (column?.fixed) return;

    setLocalVisible(prev => 
      prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey]
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    onReorder(localOrder);
    const currentVisible = new Set(visibleColumns);
    const newVisible = new Set(localVisible);
    
    localOrder.forEach(key => {
      const wasVisible = currentVisible.has(key);
      const isNowVisible = newVisible.has(key);
      if (wasVisible !== isNowVisible) {
        onToggleVisibility(key);
      }
    });
    
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  const handleShowAll = () => {
    const allKeys = ALL_COLUMNS.map(col => col.key);
    setLocalVisible(allKeys);
    setHasChanges(true);
  };

  const handleHideOptional = () => {
    const fixedKeys = ALL_COLUMNS.filter(col => col.fixed).map(col => col.key);
    const essential = ['checkbox', 'image', 'plantName', 'totalUnits', 'basePrice', 'actions'];
    setLocalVisible([...new Set([...fixedKeys, ...essential])]);
    setHasChanges(true);
  };

  const orderedColumns = localOrder
    .map(key => ALL_COLUMNS.find(col => col.key === key)!)
    .filter(Boolean);

  const visibleCount = localVisible.length;
  const totalCount = ALL_COLUMNS.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Konfiguracja kolumn
            </h2>
            <p className="text-sm text-gray-500">
              {visibleCount} z {totalCount} kolumn widocznych
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 p-3 border-b bg-gray-50">
          <button
            onClick={handleShowAll}
            className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Pokaż wszystkie
          </button>
          <button
            onClick={handleHideOptional}
            className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Tylko podstawowe
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localOrder}
              strategy={verticalListSortingStrategy}
            >
              {orderedColumns.map(column => (
                <SortableColumnItem
                  key={column.key}
                  column={column}
                  isVisible={localVisible.includes(column.key)}
                  onToggle={() => handleToggle(column.key)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <HiRefresh className="w-4 h-4" />
            Reset domyslne
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                hasChanges
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <HiCheck className="w-4 h-4" />
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
