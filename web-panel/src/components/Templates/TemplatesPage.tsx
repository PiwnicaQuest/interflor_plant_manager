import { useState, useEffect } from 'react';
import { PrintTemplate } from '../../types';
import { API } from '../../services/api';
import { TemplateEditor } from './TemplateEditor';

export function TemplatesPage() {
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PrintTemplate | null>(null);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // Fetch label templates only
  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const data = await API.getPrintTemplates('label');
      setTemplates(data);
      setError(null);
    } catch (err) {
      setError('Błąd podczas pobierania szablonów');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Create new label template
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;

    try {
      const newTemplate = await API.createPrintTemplate({
        name: newTemplateName,
        type: 'label',
        paperWidth: 50,
        paperHeight: 30,
        marginTop: 1,
        marginRight: 1,
        marginBottom: 1,
        marginLeft: 1,
        elements: [],
        isDefault: false,
      });

      setTemplates([newTemplate, ...templates]);
      setShowNewTemplateModal(false);
      setNewTemplateName('');
      setEditingTemplate(newTemplate);
    } catch (err) {
      setError('Błąd podczas tworzenia szablonu');
      console.error(err);
    }
  };

  // Save template
  const handleSaveTemplate = async (template: PrintTemplate) => {
    try {
      await API.updatePrintTemplate(template.id, {
        name: template.name,
        paperWidth: template.paperWidth,
        paperHeight: template.paperHeight,
        marginTop: template.marginTop,
        marginRight: template.marginRight,
        marginBottom: template.marginBottom,
        marginLeft: template.marginLeft,
        elements: template.elements,
      });

      setTemplates(templates.map(t => t.id === template.id ? template : t));
      setEditingTemplate(null);
    } catch (err) {
      setError('Błąd podczas zapisywania szablonu');
      console.error(err);
    }
  };

  // Delete template
  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Czy na pewno chcesz usunąć ten szablon?')) return;

    try {
      await API.deletePrintTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err) {
      setError('Błąd podczas usuwania szablonu');
      console.error(err);
    }
  };

  // Set as default
  const handleSetDefault = async (id: number) => {
    try {
      await API.setTemplateAsDefault(id);
      setTemplates(templates.map(t => ({
        ...t,
        isDefault: t.id === id,
      })));
    } catch (err) {
      setError('Błąd podczas ustawiania domyślnego szablonu');
      console.error(err);
    }
  };

  // Duplicate template
  const handleDuplicateTemplate = async (id: number) => {
    try {
      const duplicated = await API.duplicatePrintTemplate(id);
      setTemplates([duplicated, ...templates]);
    } catch (err) {
      setError('Błąd podczas duplikowania szablonu');
      console.error(err);
    }
  };

  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        onSave={handleSaveTemplate}
        onCancel={() => setEditingTemplate(null)}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Szablony etykiet</h1>
          <p className="text-gray-500 mt-1">
            Zarządzaj szablonami etykiet do drukowania kodów kreskowych
          </p>
        </div>
        <button
          onClick={() => setShowNewTemplateModal(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2"
        >
          <span>+</span>
          Nowy szablon
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500">×</button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Ładowanie...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Brak szablonów etykiet</p>
          <button
            onClick={() => setShowNewTemplateModal(true)}
            className="text-primary-600 hover:text-primary-700"
          >
            Utwórz pierwszy szablon
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => setEditingTemplate(template)}
              onDelete={() => handleDeleteTemplate(template.id)}
              onSetDefault={() => handleSetDefault(template.id)}
              onDuplicate={() => handleDuplicateTemplate(template.id)}
            />
          ))}
        </div>
      )}

      {/* New Template Modal */}
      {showNewTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold mb-4">Nowy szablon etykiety</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nazwa szablonu
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="np. Etykieta 50x30mm"
                autoFocus
              />
            </div>

            <p className="text-sm text-gray-500 mb-6">
              Domyślny rozmiar: 50mm × 30mm (można zmienić w edytorze)
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewTemplateModal(false);
                  setNewTemplateName('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Anuluj
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                Utwórz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Template Card Component
interface TemplateCardProps {
  template: PrintTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onDuplicate: () => void;
}

function TemplateCard({ template, onEdit, onDelete, onSetDefault, onDuplicate }: TemplateCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-medium text-gray-900">{template.name}</h3>
          <p className="text-sm text-gray-500">
            {template.paperWidth} × {template.paperHeight} mm
          </p>
        </div>
        {template.isDefault && (
          <span className="px-2 py-1 text-xs bg-primary-100 text-primary-700 rounded-full">
            Domyślny
          </span>
        )}
      </div>

      <div className="mb-4">
        <div
          className="bg-gray-100 rounded flex items-center justify-center"
          style={{
            aspectRatio: `${template.paperWidth} / ${template.paperHeight}`,
            maxHeight: 120,
          }}
        >
          <div
            className="bg-white border border-gray-300 relative"
            style={{
              width: '80%',
              height: '80%',
            }}
          >
            {/* Mini preview of elements */}
            {template.elements?.slice(0, 5).map((el, i) => (
              <div
                key={el.id || i}
                className="absolute bg-gray-200 rounded-sm"
                style={{
                  left: `${(el.x / template.paperWidth) * 100}%`,
                  top: `${(el.y / template.paperHeight) * 100}%`,
                  width: `${(el.width / template.paperWidth) * 100}%`,
                  height: `${(el.height / template.paperHeight) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500 mb-4">
        {template.elements?.length || 0} elementów
      </div>

      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            Edytuj
          </button>
          <button
            onClick={onDuplicate}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
            title="Duplikuj"
          >
            📋
          </button>
        </div>
        <div className="flex gap-1">
          {!template.isDefault && (
            <button
              onClick={onSetDefault}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
              title="Ustaw jako domyślny"
            >
              ⭐
            </button>
          )}
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
            title="Usuń"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}
