import { useState, useEffect } from 'react';
import { IoGlobeOutline, IoSave, IoPricetag } from 'react-icons/io5';

interface TagInfo {
  name: string;
  productCount: number;
}

interface TabSettings {
  enabled: boolean;
  name: string;
  tag: string;
  color: string;
}

const PRESET_COLORS = [
  { value: '#e11d48', label: 'Czerwony' },
  { value: '#16a34a', label: 'Zielony' },
  { value: '#2563eb', label: 'Niebieski' },
  { value: '#9333ea', label: 'Fioletowy' },
  { value: '#ea580c', label: 'Pomarańczowy' },
  { value: '#ca8a04', label: 'Złoty' },
  { value: '#0d9488', label: 'Turkusowy' },
  { value: '#db2777', label: 'Różowy' },
];

export function WebsiteSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);

  const [tab1, setTab1] = useState<TabSettings>({
    enabled: false,
    name: '',
    tag: '',
    color: '#16a34a'
  });

  const [tab2, setTab2] = useState<TabSettings>({
    enabled: false,
    name: '',
    tag: '',
    color: '#16a34a'
  });

  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchSettings();
    fetchTags();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/settings`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();

      const settings = data.settings || [];
      const getVal = (key: string) => settings.find((s: any) => s.settingKey === key)?.settingValue || '';

      setTab1({
        enabled: getVal('shop_tab_1_enabled') === 'true',
        name: getVal('shop_tab_1_name'),
        tag: getVal('shop_tab_1_tag'),
        color: getVal('shop_tab_1_color') || '#16a34a'
      });

      setTab2({
        enabled: getVal('shop_tab_2_enabled') === 'true',
        name: getVal('shop_tab_2_name'),
        tag: getVal('shop_tab_2_tag'),
        color: getVal('shop_tab_2_color') || '#16a34a'
      });
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Nie udało się załadować ustawień');
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch(`${API_URL}/tags`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch tags');
      const data = await response.json();
      setAvailableTags(data.tags || []);
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  };

  const saveSetting = async (key: string, value: string) => {
    const response = await fetch(`${API_URL}/settings/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ value })
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save setting');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      await saveSetting('shop_tab_1_enabled', tab1.enabled.toString());
      await saveSetting('shop_tab_1_name', tab1.name);
      await saveSetting('shop_tab_1_tag', tab1.tag);
      await saveSetting('shop_tab_1_color', tab1.color);

      await saveSetting('shop_tab_2_enabled', tab2.enabled.toString());
      await saveSetting('shop_tab_2_name', tab2.name);
      await saveSetting('shop_tab_2_tag', tab2.tag);
      await saveSetting('shop_tab_2_color', tab2.color);

      setSuccess('Ustawienia zostały zapisane');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Nie udało się zapisać ustawień');
    } finally {
      setSaving(false);
    }
  };

  const renderColorPicker = (tab: TabSettings, setTab: (t: TabSettings) => void) => (
    <div className="mt-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Kolor zakładki
      </label>
      <div className="flex items-center gap-3 flex-wrap">
        {PRESET_COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            onClick={() => tab.enabled && setTab({ ...tab, color: c.value })}
            disabled={!tab.enabled}
            title={c.label}
            className={`w-8 h-8 rounded-full border-2 transition-all disabled:opacity-40 ${
              tab.color === c.value ? 'border-gray-900 scale-110 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300 hover:scale-105'
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        <input
          type="color"
          value={tab.color}
          onChange={(e) => setTab({ ...tab, color: e.target.value })}
          disabled={!tab.enabled}
          className="w-8 h-8 rounded cursor-pointer disabled:opacity-40"
          title="Wybierz dowolny kolor"
        />
      </div>
      {tab.enabled && tab.name && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">Podgląd:</span>
          <span
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white shadow-md"
            style={{ backgroundColor: tab.color }}
          >
            {tab.name}
          </span>
          <span
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: tab.color + '20', color: tab.color }}
          >
            {tab.name}
          </span>
          <span className="text-xs text-gray-400 ml-1">(aktywna / nieaktywna)</span>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <IoGlobeOutline className="text-2xl text-green-600" />
        <div>
          <h2 className="text-lg font-semibold">Ustawienia strony internetowej</h2>
          <p className="text-sm text-gray-500">Konfiguracja dodatkowych zakładek w katalogu sklepu</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-md">
          {success}
        </div>
      )}

      <div className="space-y-8">
        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2">Jak to działa?</h4>
          <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
            <li>Zakładki pojawiają się w sklepie tylko dla zalogowanych użytkowników</li>
            <li>Każda zakładka filtruje produkty według wybranego tagu</li>
            <li>Domyślna zakładka "Wszystkie rośliny" jest zawsze widoczna</li>
          </ul>
        </div>

        {/* Tab 1 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Zakładka 1</h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tab1.enabled}
                onChange={(e) => setTab1({ ...tab1, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              <span className="ml-2 text-sm text-gray-600">{tab1.enabled ? 'Włączona' : 'Wyłączona'}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nazwa zakładki
              </label>
              <input
                type="text"
                value={tab1.name}
                onChange={(e) => setTab1({ ...tab1, name: e.target.value })}
                placeholder="np. Walentynki"
                disabled={!tab1.enabled}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <IoPricetag className="inline mr-1" />
                Tag do filtrowania
              </label>
              <select
                value={tab1.tag}
                onChange={(e) => setTab1({ ...tab1, tag: e.target.value })}
                disabled={!tab1.enabled}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">-- Wybierz tag --</option>
                {availableTags.map(tag => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name} ({tag.productCount} produktów)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {renderColorPicker(tab1, setTab1)}
        </div>

        {/* Tab 2 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Zakładka 2</h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tab2.enabled}
                onChange={(e) => setTab2({ ...tab2, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              <span className="ml-2 text-sm text-gray-600">{tab2.enabled ? 'Włączona' : 'Wyłączona'}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nazwa zakładki
              </label>
              <input
                type="text"
                value={tab2.name}
                onChange={(e) => setTab2({ ...tab2, name: e.target.value })}
                placeholder="np. Na zamówienie"
                disabled={!tab2.enabled}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <IoPricetag className="inline mr-1" />
                Tag do filtrowania
              </label>
              <select
                value={tab2.tag}
                onChange={(e) => setTab2({ ...tab2, tag: e.target.value })}
                disabled={!tab2.enabled}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">-- Wybierz tag --</option>
                {availableTags.map(tag => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name} ({tag.productCount} produktów)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {renderColorPicker(tab2, setTab2)}
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-md transition-colors"
          >
            <IoSave />
            {saving ? 'Zapisywanie...' : 'Zapisz ustawienia'}
          </button>
        </div>
      </div>
    </div>
  );
}
