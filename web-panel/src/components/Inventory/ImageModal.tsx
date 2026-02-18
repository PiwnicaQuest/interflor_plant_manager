import { useState, useRef } from 'react';
import { Product } from '../../types';
import { api } from '../../services/api';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
const BASE_URL = API_URL.replace(/\/api$/, '');

const getFullImageUrl = (imageUrl: string | null | undefined) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${BASE_URL}${imageUrl}?v=${Date.now()}`;
};

const getOptimizedImageUrl = (barcode: string | null | undefined, size: 'thumb' | 'medium' | 'full'): string | null => {
  if (!barcode) return null;
  return `${API_URL}/images/${encodeURIComponent(barcode)}/${size}`;
};

interface ImageModalProps {
  product: Product;
  onClose: () => void;
  onImageUpdated: (product: Product) => void;
}

export function ImageModal({ product, onClose, onImageUpdated }: ImageModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentImageUrl = product.barcode
    ? getOptimizedImageUrl(product.barcode, 'full')
    : getFullImageUrl(product.imageUrl);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Plik musi byc obrazem (JPG, PNG, WEBP, GIF)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Plik jest za duzy (max 10 MB)');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const result = await api.uploadProductImage(product.id, file);
      onImageUpdated({ ...product, imageUrl: result.imageUrl });
      setPreviewUrl(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Blad podczas przesylania pliku');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);

    handleFileUpload(file);
  };

  const handleUrlSubmit = async () => {
    const url = urlInput.trim();
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setError('URL musi zaczynac sie od http:// lub https://');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const result = await api.setProductImageUrl(product.id, url);
      onImageUpdated({ ...product, imageUrl: url });
      setUrlInput('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Blad podczas zapisywania URL');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!product.imageUrl) return;

    setIsUploading(true);
    setError(null);

    try {
      await api.deleteProductImage(product.id);
      onImageUpdated({ ...product, imageUrl: undefined });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Blad podczas usuwania zdjecia');
    } finally {
      setIsUploading(false);
    }
  };

  const displayUrl = previewUrl || currentImageUrl;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{product.plantName}</h3>
            <p className="text-xs text-gray-500">{product.potSize ? `${product.potSize}` : ''} {product.barcode ? `| ${product.barcode}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors ml-3 flex-shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image preview */}
        <div className="flex items-center justify-center bg-gray-50 p-4" style={{ minHeight: '280px' }}>
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={product.plantName}
              className="max-w-full max-h-72 object-contain rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="text-center text-gray-400">
              <svg className="w-20 h-20 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Brak zdjecia</p>
            </div>
          )}
        </div>

        {/* Loading overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-gray-600">Przesylanie...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 p-2.5 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="p-5 space-y-3">
          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Wybierz plik z dysku
          </button>

          {/* URL input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              placeholder="https://... wklej link do zdjecia"
              disabled={isUploading}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              onClick={handleUrlSubmit}
              disabled={isUploading || !urlInput.trim()}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm font-medium whitespace-nowrap"
            >
              Zapisz
            </button>
          </div>

          {/* Delete button */}
          {product.imageUrl && (
            <button
              onClick={handleDelete}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Usun zdjecie
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
