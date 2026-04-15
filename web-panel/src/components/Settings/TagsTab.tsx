import { useState, useEffect } from 'react';
import { IoAdd, IoTrash, IoPencil, IoClose, IoCheckmark, IoSearch, IoAlertCircle, IoCube, IoPricetag, IoChevronDown, IoChevronUp } from 'react-icons/io5';
import { api } from '../../services/api';

interface TagInfo {
  name: string;
  productCount: number;
  isDefined: boolean;
}

interface KeywordEntry {
  id: number;
  keyword: string;
}

export function TagsTab() {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [tagKeywords, setTagKeywords] = useState<Record<string, KeywordEntry[]>>({});
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

  // Keywords expansion
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [bulkKeywords, setBulkKeywords] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);

  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchTags();
    fetchKeywords();
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

  const fetchKeywords = async () => {
    try {
      const data = await api.getTagKeywords();
      setTagKeywords(data.tagKeywords || {});
    } catch (err) {
      console.error('Error fetching keywords:', err);
    }
  };

  const handleAddTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) { setError('Nazwa tagu jest wymagana'); return; }
    if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Tag o tej nazwie już istnieje'); return;
    }
    try {
      setSaving(true); setError(null);
      const response = await fetch(`${API_URL}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: trimmed })
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error); }
      setNewTagName('');
      setSuccess('Tag został dodany');
      setTimeout(() => setSuccess(null), 3000);
      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Nie udało się dodać tagu');
    } finally { setSaving(false); }
  };

  const handleStartEdit = (tagName: string) => { setEditingTag(tagName); setEditTagName(tagName); };
  const handleCancelEdit = () => { setEditingTag(null); setEditTagName(''); };

  const handleSaveEdit = async () => {
    const trimmed = editTagName.trim();
    if (!trimmed) { setError('Nazwa tagu jest wymagana'); return; }
    if (trimmed === editingTag) { handleCancelEdit(); return; }
    if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase() && t.name !== editingTag)) {
      setError('Tag o tej nazwie już istnieje'); return;
    }
    try {
      setSaving(true); setError(null);
      const response = await fetch(`${API_URL}/tags/${encodeURIComponent(editingTag!)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ newName: trimmed })
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error); }
      setEditingTag(null); setEditTagName('');
      setSuccess('Tag został zaktualizowany');
      setTimeout(() => setSuccess(null), 3000);
      fetchTags(); fetchKeywords();
    } catch (err: any) {
      setError(err.message || 'Błąd');
    } finally { setSaving(false); }
  };

  const handleDeleteTag = async (tagName: string) => {
    try {
      setSaving(true); setError(null);
      const url = `${API_URL}/tags/${encodeURIComponent(tagName)}${removeFromProducts ? '?removeFromProducts=true' : ''}`;
      const response = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error); }
      setDeleteConfirmTag(null); setRemoveFromProducts(false);
      setSuccess('Tag został usunięty');
      setTimeout(() => setSuccess(null), 3000);
      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Błąd');
    } finally { setSaving(false); }
  };

  const handleAddKeyword = async (tagName: string) => {
    const trimmed = newKeyword.trim().toLowerCase();
    if (!trimmed) return;
    try {
      await api.addTagKeyword(tagName, trimmed);
      setNewKeyword('');
      fetchKeywords();
      setSuccess(`Dodano słowo "${trimmed}" do tagu "${tagName}"`);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd dodawania słowa');
    }
  };

  const handleBulkAddKeywords = async (tagName: string) => {
    const keywords = bulkKeywords.split(/[,;\n]+/).map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) return;
    try {
      const result = await api.bulkAddTagKeywords(tagName, keywords);
      setBulkKeywords('');
      setShowBulkInput(false);
      fetchKeywords();
      setSuccess(`Dodano ${result.added} słów do tagu "${tagName}"`);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError('Błąd dodawania słów');
    }
  };

  const handleDeleteKeyword = async (id: number) => {
    try {
      await api.deleteTagKeyword(id);
      fetchKeywords();
    } catch (err) {
      setError('Błąd usuwania słowa');
    }
  };

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <IoPricetag className="h-5 w-5 text-purple-600" />
        <h2 className="text-lg font-semibold text-gray-900">Zarządzanie tagami</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 mb-4">
          <IoAlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><IoClose className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-green-700 mb-4">
          <IoCheckmark className="h-4 w-4" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Add new tag */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Dodaj nowy tag</h3>
        <div className="flex gap-2">
          <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTag()} placeholder="Nazwa tagu..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          <button onClick={handleAddTag} disabled={saving || !newTagName.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            <IoAdd className="h-4 w-4" /> Dodaj
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <IoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Szukaj tagów..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
      </div>

      {/* Tags list with keywords */}
      <div className="space-y-2">
        {filteredTags.length === 0 ? (
          <div className="text-center text-gray-500 py-8">{searchTerm ? 'Nie znaleziono tagów' : 'Brak tagów'}</div>
        ) : (
          filteredTags.map((tag) => {
            const keywords = tagKeywords[tag.name] || [];
            const isExpanded = expandedTag === tag.name;

            return (
              <div key={tag.name} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Tag header row */}
                <div className="flex items-center px-4 py-3 bg-white hover:bg-gray-50">
                  <button onClick={() => { setExpandedTag(isExpanded ? null : tag.name); setNewKeyword(''); setShowBulkInput(false); }} className="flex items-center gap-2 flex-1 text-left">
                    {isExpanded ? <IoChevronUp className="h-4 w-4 text-gray-400" /> : <IoChevronDown className="h-4 w-4 text-gray-400" />}
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                      <IoPricetag className="h-3 w-3 mr-1" /> {editingTag === tag.name ? '' : tag.name}
                    </span>
                    {editingTag !== tag.name && (
                      <>
                        <span className="text-xs text-gray-500 flex items-center"><IoCube className="h-3 w-3 mr-0.5" />{tag.productCount} prod.</span>
                        <span className="text-xs text-blue-500">{keywords.length} słów</span>
                      </>
                    )}
                  </button>
                  {editingTag === tag.name ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={editTagName} onChange={(e) => setEditTagName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }} className="px-2 py-1 border border-green-300 rounded text-sm w-40" autoFocus />
                      <button onClick={handleSaveEdit} disabled={saving} className="p-1 text-green-600 hover:bg-green-100 rounded"><IoCheckmark className="h-4 w-4" /></button>
                      <button onClick={handleCancelEdit} className="p-1 text-gray-600 hover:bg-gray-100 rounded"><IoClose className="h-4 w-4" /></button>
                    </div>
                  ) : deleteConfirmTag === tag.name ? (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input type="checkbox" checked={removeFromProducts} onChange={(e) => setRemoveFromProducts(e.target.checked)} className="rounded border-gray-300" /> Usuń z produktów
                      </label>
                      <button onClick={() => handleDeleteTag(tag.name)} disabled={saving} className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">Usuń</button>
                      <button onClick={() => { setDeleteConfirmTag(null); setRemoveFromProducts(false); }} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">Anuluj</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleStartEdit(tag.name)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded" title="Edytuj"><IoPencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteConfirmTag(tag.name)} className="p-1.5 text-red-600 hover:bg-red-100 rounded" title="Usuń"><IoTrash className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>

                {/* Expanded keywords section */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-gray-600 uppercase">Słowa kluczowe ({keywords.length})</h4>
                      <button onClick={() => setShowBulkInput(!showBulkInput)} className="text-xs text-blue-600 hover:text-blue-800">
                        {showBulkInput ? 'Pojedyncze dodawanie' : 'Dodaj wiele'}
                      </button>
                    </div>

                    {/* Add keyword input */}
                    {!showBulkInput ? (
                      <div className="flex gap-2 mb-3">
                        <input type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword(tag.name)} placeholder="Nowe słowo kluczowe..." className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" />
                        <button onClick={() => handleAddKeyword(tag.name)} disabled={!newKeyword.trim()} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                          <IoAdd className="h-3 w-3" /> Dodaj
                        </button>
                      </div>
                    ) : (
                      <div className="mb-3">
                        <textarea value={bulkKeywords} onChange={(e) => setBulkKeywords(e.target.value)} placeholder="Wpisz słowa kluczowe oddzielone przecinkami, średnikami lub nowymi liniami..." className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 h-20" />
                        <button onClick={() => handleBulkAddKeywords(tag.name)} disabled={!bulkKeywords.trim()} className="mt-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
                          Dodaj wszystkie
                        </button>
                      </div>
                    )}

                    {/* Keywords list */}
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map(kw => (
                        <span key={kw.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-700 hover:border-red-300 group">
                          {kw.keyword}
                          <button onClick={() => handleDeleteKeyword(kw.id)} className="text-gray-300 hover:text-red-500 group-hover:text-red-400" title="Usuń">
                            <IoClose className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {keywords.length === 0 && (
                        <span className="text-xs text-gray-400 italic">Brak słów kluczowych - dodaj aby włączyć automatyczne sugestie</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Info */}
      <div className="text-sm text-gray-500 mt-4 space-y-1">
        <p><strong>Tagi</strong> grupują rośliny w magazynie.</p>
        <p><strong>Słowa kluczowe</strong> służą do automatycznego sugerowania tagów dla nowych produktów. Jeśli nazwa rośliny zawiera słowo kluczowe, system zaproponuje odpowiedni tag.</p>
        <p>Tagi <strong>Małe</strong> i <strong>Duże</strong> są sugerowane automatycznie na podstawie rozmiaru doniczki (≤10cm / ≥17cm).</p>
      </div>
    </div>
  );
}
