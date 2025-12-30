import { useState, useEffect } from 'react';
import { IoAdd, IoTrash, IoPencil, IoClose, IoCheckmark, IoSearch, IoAlertCircle, IoCube, IoPricetag } from 'react-icons/io5';

interface TagInfo {
  name: string;
  productCount: number;
  isDefined: boolean;
}

export function TagsTab() {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New tag form
  const [newTagName, setNewTagName] = useState('');

  // Edit mode
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState('');

  // Delete confirmation
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<string | null>(null);
  const [removeFromProducts, setRemoveFromProducts] = useState(false);

  // Search/filter
  const [searchTerm, setSearchTerm] = useState('');

  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/tags`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch tags');
      const data = await response.json();
      setTags(data.tags || []);
    } catch (err: any) {
      setError('Nie udało się załadować tagów');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setError('Nazwa tagu jest wymagana');
      return;
    }

    if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Tag o tej nazwie już istnieje');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`${API_URL}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name: trimmed })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add tag');
      }

      setNewTagName('');
      setSuccess('Tag został dodany');
      setTimeout(() => setSuccess(null), 3000);
      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Nie udało się dodać tagu');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (tagName: string) => {
    setEditingTag(tagName);
    setEditTagName(tagName);
  };

  const handleCancelEdit = () => {
    setEditingTag(null);
    setEditTagName('');
  };

  const handleSaveEdit = async () => {
    const trimmed = editTagName.trim();
    if (!trimmed) {
      setError('Nazwa tagu jest wymagana');
      return;
    }

    if (trimmed === editingTag) {
      handleCancelEdit();
      return;
    }

    if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase() && t.name !== editingTag)) {
      setError('Tag o tej nazwie już istnieje');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`${API_URL}/tags/${encodeURIComponent(editingTag!)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ newName: trimmed })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update tag');
      }

      setEditingTag(null);
      setEditTagName('');
      setSuccess('Tag został zaktualizowany');
      setTimeout(() => setSuccess(null), 3000);
      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Nie udało się zaktualizować tagu');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    try {
      setSaving(true);
      setError(null);
      const url = `${API_URL}/tags/${encodeURIComponent(tagName)}${removeFromProducts ? '?removeFromProducts=true' : ''}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete tag');
      }

      setDeleteConfirmTag(null);
      setRemoveFromProducts(false);
      setSuccess('Tag został usunięty');
      setTimeout(() => setSuccess(null), 3000);
      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Nie udało się usunąć tagu');
    } finally {
      setSaving(false);
    }
  };

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <IoPricetag className="h-5 w-5 text-purple-600" />
        <h2 className="text-lg font-semibold text-gray-900">Zarządzanie tagami</h2>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 mb-4">
          <IoAlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <IoClose className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-green-700 mb-4">
          <IoCheckmark className="h-4 w-4" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Add new tag form */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Dodaj nowy tag</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            placeholder="Nazwa tagu..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          <button
            onClick={handleAddTag}
            disabled={saving || !newTagName.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <IoAdd className="h-4 w-4" />
            Dodaj
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <IoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Szukaj tagów..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
        />
      </div>

      {/* Tags list */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tag
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Produkty
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredTags.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  {searchTerm ? 'Nie znaleziono tagów' : 'Brak tagów'}
                </td>
              </tr>
            ) : (
              filteredTags.map((tag) => (
                <tr key={tag.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editingTag === tag.name ? (
                      <input
                        type="text"
                        value={editTagName}
                        onChange={(e) => setEditTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="px-2 py-1 border border-green-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 w-full max-w-xs"
                        autoFocus
                      />
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                        <IoPricetag className="h-3 w-3 mr-1" />
                        {tag.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center text-sm text-gray-600">
                      <IoCube className="h-4 w-4 mr-1 text-gray-400" />
                      {tag.productCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingTag === tag.name ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                          title="Zapisz"
                        >
                          <IoCheckmark className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                          title="Anuluj"
                        >
                          <IoClose className="h-4 w-4" />
                        </button>
                      </div>
                    ) : deleteConfirmTag === tag.name ? (
                      <div className="flex items-center justify-end gap-2">
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={removeFromProducts}
                            onChange={(e) => setRemoveFromProducts(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          Usuń z produktów
                        </label>
                        <button
                          onClick={() => handleDeleteTag(tag.name)}
                          disabled={saving}
                          className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                        >
                          Usuń
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmTag(null);
                            setRemoveFromProducts(false);
                          }}
                          className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                        >
                          Anuluj
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleStartEdit(tag.name)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                          title="Edytuj"
                        >
                          <IoPencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmTag(tag.name)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                          title="Usuń"
                        >
                          <IoTrash className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div className="text-sm text-gray-500 mt-4">
        <p>Tagi są używane do kategoryzacji produktów w magazynie.</p>
        <p>Możesz dodawać nowe tagi, edytować istniejące lub usuwać nieużywane.</p>
        <p>Zmiana nazwy tagu automatycznie zaktualizuje wszystkie produkty z tym tagiem.</p>
      </div>
    </div>
  );
}
