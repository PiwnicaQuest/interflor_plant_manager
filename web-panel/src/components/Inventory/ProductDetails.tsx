import { useState, useRef, useEffect } from 'react';
import { Product, InventoryMovement, MovementType } from '../../types';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

interface ProductDetailsProps {
  product: Product;
  movements: InventoryMovement[];
  onClose: () => void;
  onUpdateProduct?: (productId: number, field: keyof Product, value: any) => Promise<void>;
  onImageUpdated?: (productId: number, imageUrl: string | null) => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const getFullImageUrl = (imageUrl: string | null | undefined) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${API_URL}${imageUrl}`;
};

export function ProductDetails({ product, movements, onClose, onUpdateProduct, onImageUpdated }: ProductDetailsProps) {
  const [editingBarcode, setEditingBarcode] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState(product.barcode || '');
  const [savingBarcode, setSavingBarcode] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(product.imageUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Passport editing state
  const [editingPassport, setEditingPassport] = useState(false);
  const [passportValue, setPassportValue] = useState(product.plantPassport || '');
  const [savingPassport, setSavingPassport] = useState(false);

  // Grower editing state
  const [editingGrower, setEditingGrower] = useState(false);
  const [growerValue, setGrowerValue] = useState(product.grower || '');
  const [savingGrower, setSavingGrower] = useState(false);
  // VAT editing state
  const [editingVat, setEditingVat] = useState(false);
  const [vatValue, setVatValue] = useState(product.vatRate || 8);
  const [savingVat, setSavingVat] = useState(false);

  // Slave product view state
  const [viewingSlave, setViewingSlave] = useState<number | null>(null);
  const [slaveDetails, setSlaveDetails] = useState<any>(null);
  const [loadingSlaveDetails, setLoadingSlaveDetails] = useState(false);


  // Update state when product changes (e.g., modal reopened for different product)
  useEffect(() => {
    setBarcodeValue(product.barcode || '');
    setPassportValue(product.plantPassport || '');
    setGrowerValue(product.grower || '');
    setVatValue(product.vatRate || 8);
    setCurrentImageUrl(product.imageUrl);
    // Reset editing states
    setEditingBarcode(false);
    setEditingPassport(false);
    setEditingGrower(false);
    setEditingVat(false);
  }, [product.id, product.barcode, product.plantPassport, product.grower, product.vatRate, product.imageUrl]);


  // Fetch slave product details
  const handleViewSlaveProduct = async (slaveId: number) => {
    setViewingSlave(slaveId);
    setLoadingSlaveDetails(true);
    try {
      const response = await api.getSlaveDetails(slaveId);
      if (response.success) {
        setSlaveDetails(response.slave);
      }
    } catch (error) {
      console.error("Error fetching slave details:", error);
    } finally {
      setLoadingSlaveDetails(false);
    }
  };

  const handleCloseSlaveView = () => {
    setViewingSlave(null);
    setSlaveDetails(null);
  };

  const handleSaveBarcode = async () => {
    if (!onUpdateProduct) return;
    setSavingBarcode(true);
    try {
      await onUpdateProduct(product.id, 'barcode', barcodeValue || null);
      setEditingBarcode(false);
    } catch (error) {
      console.error('Error saving barcode:', error);
    } finally {
      setSavingBarcode(false);
    }
  };

  const handleSavePassport = async () => {
    if (!onUpdateProduct) return;
    setSavingPassport(true);
    try {
      await onUpdateProduct(product.id, 'plantPassport', passportValue || null);
      setEditingPassport(false);
    } catch (error) {
      console.error('Error saving passport:', error);
    } finally {
      setSavingPassport(false);
    }
  };

  const handleSaveGrower = async () => {
    if (!onUpdateProduct) return;
    setSavingGrower(true);
    try {
      await onUpdateProduct(product.id, 'grower', growerValue || null);
      setEditingGrower(false);
    } catch (error) {
      console.error('Error saving grower:', error);
    } finally {
      setSavingGrower(false);
    }
  };

  

  const handleSaveVat = async () => {
    if (!onUpdateProduct) return;
    setSavingVat(true);
    try {
      await onUpdateProduct(product.id, 'vatRate', vatValue);
      setEditingVat(false);
    } catch (error) {
      console.error('Error saving VAT rate:', error);
    } finally {
      setSavingVat(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const result = await api.uploadProductImage(product.id, file);
      setCurrentImageUrl(result.imageUrl);
      if (onImageUpdated) {
        onImageUpdated(product.id, result.imageUrl);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Błąd podczas przesyłania zdjęcia');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteImage = async () => {
    if (!window.confirm('Czy na pewno chcesz usunąć zdjęcie?')) return;

    setUploadingImage(true);
    try {
      await api.deleteProductImage(product.id);
      setCurrentImageUrl(undefined);
      if (onImageUpdated) {
        onImageUpdated(product.id, null);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Błąd podczas usuwania zdjęcia');
    } finally {
      setUploadingImage(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMovementTypeLabel = (type: MovementType) => {
    const labels: Record<MovementType, { label: string; color: string }> = {
      [MovementType.PURCHASE]: { label: 'Zakup', color: 'text-blue-600' },
      [MovementType.SALE]: { label: 'Sprzedaż', color: 'text-green-600' },
      [MovementType.CORRECTION]: { label: 'Korekta', color: 'text-yellow-600' },
      [MovementType.RETURN]: { label: 'Zwrot', color: 'text-purple-600' },
      [MovementType.ADJUSTMENT]: { label: 'Korekta stanu', color: 'text-orange-600' },
      [MovementType.ORDER]: { label: 'Zamówienie', color: 'text-indigo-600' },
      [MovementType.DAMAGE]: { label: 'Uszkodzenie', color: 'text-red-600' },
      [MovementType.LOSS]: { label: 'Strata', color: 'text-red-700' },
      [MovementType.LOSS_REVERSAL]: { label: 'Cofnięcie straty', color: 'text-green-700' },
      [MovementType.MERGE]: { label: 'Połączenie', color: 'text-cyan-600' },
      [MovementType.OTHER]: { label: 'Inne', color: 'text-gray-600' },
    };
    return labels[type] || { label: type, color: 'text-gray-600' };
  };

  const imageUrl = getFullImageUrl(currentImageUrl);

  // Get passport to display - prefer plantPassport, fallback to growerPassport
  const displayPassport = product.plantPassport || product.growerPassport;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {product.plantName}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {product.potSize && `Doniczka: ${product.potSize}`}
                {product.plantHeightCm && ` | Wysokość: ${product.plantHeightCm} cm`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Product Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card p-4">
              <div className="text-xs text-gray-500 mb-1">Palety</div>
              <div className="text-2xl font-bold text-gray-900">
                {product.palletCount}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-500 mb-1">Sztuki / paleta</div>
              <div className="text-2xl font-bold text-gray-900">
                {product.unitsPerPallet}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-500 mb-1">Suma sztuk</div>
              <div className="text-2xl font-bold text-primary-600">
                {product.totalUnits}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-500 mb-1">Status</div>
              <div>
                <span
                  className={`badge ${
                    product.inventoryStatus === 'ok'
                      ? 'badge-success'
                      : 'badge-warning'
                  }`}
                >
                  {product.inventoryStatus === 'ok' ? 'OK' : 'NISKI'}
                </span>
              </div>
            </div>
          </div>

          {/* Prices */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Cennik</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Cena zakupu:</span>
                <span className="ml-2 font-semibold">
                  {product.purchasePricePln?.toFixed(2) || '-'} PLN
                </span>
              </div>
              <div>
                <span className="text-gray-600">Cena podstawowa:</span>
                <span className="ml-2 font-semibold">
                  {product.basePriceGross?.toFixed(2) || '-'} PLN
                </span>
              </div>
              {product.priceDiscount10 != null && (
                <div>
                  <span className="text-gray-600">Rabat 10%:</span>
                  <span className="ml-2 font-semibold">
                    {(Number(product.priceDiscount10) || 0).toFixed(2)} PLN
                  </span>
                </div>
              )}
              {product.priceDiscount12 != null && (
                <div>
                  <span className="text-gray-600">Rabat 12%:</span>
                  <span className="ml-2 font-semibold">
                    {(Number(product.priceDiscount12) || 0).toFixed(2)} PLN
                  </span>
                </div>
              )}
              {product.priceDiscount15 != null && (
                <div>
                  <span className="text-gray-600">Rabat 15%:</span>
                  <span className="ml-2 font-semibold">
                    {(Number(product.priceDiscount15) || 0).toFixed(2)} PLN
                  </span>
                </div>
              )}
              {product.priceDiscount20 != null && (
                <div>
                  <span className="text-gray-600">Rabat 20%:</span>
                  <span className="ml-2 font-semibold">
                    {(Number(product.priceDiscount20) || 0).toFixed(2)} PLN
                  </span>
                </div>
              )}
              {product.priceDiscount25 != null && (
                <div>
                  <span className="text-gray-600">Rabat 25%:</span>
                  <span className="ml-2 font-semibold">
                    {(Number(product.priceDiscount25) || 0).toFixed(2)} PLN
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Grower and Passport Section */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Ogrodnik i Paszport</h3>
            <div className="text-sm text-gray-700 space-y-3">
              {/* Grower - editable */}
              <div className="flex items-start gap-2">
                <strong className="mt-1">Ogrodnik:</strong>
                {editingGrower ? (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={growerValue}
                        onChange={(e) => setGrowerValue(e.target.value)}
                        className="input text-sm py-1 px-2 w-64"
                        placeholder="Wprowadź nazwę ogrodnika..."
                        autoFocus
                      />
                      <button
                        onClick={handleSaveGrower}
                        disabled={savingGrower}
                        className="btn btn-primary text-xs py-1 px-2"
                      >
                        {savingGrower ? 'Zapisuję...' : 'Zapisz'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingGrower(false);
                          setGrowerValue(product.grower || '');
                        }}
                        className="btn btn-secondary text-xs py-1 px-2"
                      >
                        Anuluj
                      </button>
                    </div>
                  </div>
                ) : (
                  <span
                    onClick={() => onUpdateProduct && setEditingGrower(true)}
                    className={`${onUpdateProduct ? 'cursor-pointer hover:bg-gray-100 px-1 rounded' : ''}`}
                    title={onUpdateProduct ? 'Kliknij aby edytować' : ''}
                  >
                    {product.grower || <span className="text-gray-400 italic">Brak - kliknij aby dodać</span>}
                  </span>
                )}
              </div>
              
              {/* Passport - editable */}
              <div className="flex items-start gap-2">
                <strong className="mt-1">Paszport:</strong>
                {editingPassport ? (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={passportValue}
                        onChange={(e) => setPassportValue(e.target.value)}
                        className="input text-sm py-1 px-2 w-64"
                        placeholder="Wprowadź numer paszportu..."
                        autoFocus
                      />
                      <button
                        onClick={handleSavePassport}
                        disabled={savingPassport}
                        className="btn btn-primary text-xs py-1 px-2"
                      >
                        {savingPassport ? 'Zapisuję...' : 'Zapisz'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingPassport(false);
                          setPassportValue(product.plantPassport || '');
                        }}
                        className="btn btn-secondary text-xs py-1 px-2"
                      >
                        Anuluj
                      </button>
                    </div>
                    {product.growerPassport && !product.plantPassport && (
                      <p className="text-xs text-gray-500 mt-1">
                        Paszport ogrodnika: {product.growerPassport}
                      </p>
                    )}
                  </div>
                ) : (
                  <span
                    onClick={() => onUpdateProduct && setEditingPassport(true)}
                    className={`${onUpdateProduct ? 'cursor-pointer hover:bg-gray-100 px-1 rounded' : ''}`}
                    title={onUpdateProduct ? 'Kliknij aby edytować' : ''}
                  >
                    {displayPassport || <span className="text-gray-400 italic">Brak - kliknij aby dodać</span>}
                    {product.plantPassport && product.growerPassport && product.plantPassport !== product.growerPassport && (
                      <span className="text-xs text-gray-400 ml-2">(własny)</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-2">
                Dodatkowe informacje
              </h3>
              <div className="text-sm text-gray-700 space-y-1">
                <div className="flex items-center gap-2">
                  <strong>Kod kreskowy:</strong>
                  {editingBarcode ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={barcodeValue}
                        onChange={(e) => setBarcodeValue(e.target.value)}
                        className="input text-sm py-1 px-2 w-64"
                        placeholder="Wprowadź kod kreskowy..."
                        autoFocus
                      />
                      <button
                        onClick={handleSaveBarcode}
                        disabled={savingBarcode}
                        className="btn btn-primary text-xs py-1 px-2"
                      >
                        {savingBarcode ? 'Zapisuję...' : 'Zapisz'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingBarcode(false);
                          setBarcodeValue(product.barcode || '');
                        }}
                        className="btn btn-secondary text-xs py-1 px-2"
                      >
                        Anuluj
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => onUpdateProduct && setEditingBarcode(true)}
                      className={`${onUpdateProduct ? 'cursor-pointer hover:bg-gray-100 px-1 rounded' : ''}`}
                      title={onUpdateProduct ? 'Kliknij aby edytować' : ''}
                    >
                      {product.barcode || <span className="text-gray-400 italic">Brak - kliknij aby dodać</span>}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <strong>Stawka VAT:</strong>
                  {editingVat ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={vatValue}
                        onChange={(e) => setVatValue(Number(e.target.value))}
                        className="input text-sm py-1 px-2 w-32"
                        autoFocus
                      >
                        <option value={0}>0% (zwolniony)</option>
                        <option value={8}>8% (rośliny)</option>
                        <option value={23}>23% (standardowy)</option>
                      </select>
                      <button
                        onClick={handleSaveVat}
                        disabled={savingVat}
                        className="btn btn-primary text-xs py-1 px-2"
                      >
                        {savingVat ? 'Zapisuję...' : 'Zapisz'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingVat(false);
                          setVatValue(product.vatRate || 8);
                        }}
                        className="btn btn-secondary text-xs py-1 px-2"
                      >
                        Anuluj
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => onUpdateProduct && setEditingVat(true)}
                      className={`${onUpdateProduct ? 'cursor-pointer hover:bg-gray-100 px-1 rounded' : ''}`}
                      title={onUpdateProduct ? 'Kliknij aby zmienić stawkę VAT' : ''}
                    >
                      {product.vatRate || 8}%
                      {product.vatRate === 0 && <span className="text-gray-500 ml-1">(zwolniony)</span>}
                      {product.vatRate === 23 && <span className="text-gray-500 ml-1">(standardowy)</span>}
                      {(product.vatRate === 8 || !product.vatRate) && <span className="text-gray-500 ml-1">(rośliny)</span>}
                    </span>
                  )}
                </div>
                <p>
                  <strong>Widoczna w sklepie:</strong>{' '}
                  {product.visibleInShop ? 'Tak' : 'Nie'}
                </p>
                {product.deliveryDate && (
                  <p>
                    <strong>Data dostawy:</strong>{' '}
                    {formatDate(product.deliveryDate)}
                  </p>
                )}
              </div>
            </div>

            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Zdjęcie</h3>
              {imageUrl ? (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt={product.plantName}
                    className="w-full h-48 object-cover rounded"
                  />
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    <label className="btn btn-primary text-xs py-1 px-2 cursor-pointer">
                      {uploadingImage ? 'Przesyłanie...' : 'Zmień'}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploadingImage}
                      />
                    </label>
                    <button
                      onClick={handleDeleteImage}
                      disabled={uploadingImage}
                      className="btn btn-secondary text-xs py-1 px-2 bg-red-500 hover:bg-red-600 text-white border-red-500"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full h-48 bg-gray-100 rounded flex items-center justify-center relative">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🌿</div>
                    <p className="text-sm text-gray-500 mb-2">Brak zdjęcia</p>
                    <label className="btn btn-primary text-sm cursor-pointer">
                      {uploadingImage ? 'Przesyłanie...' : 'Dodaj zdjęcie'}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploadingImage}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>


          {/* Merged Products Info */}
          {(product.mergedProductIds && product.mergedProductIds.length > 0) && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">
                Połączone produkty ({product.mergedProductIds.length})
              </h3>
              <div className="card p-4 bg-blue-50 border-blue-200">
                <div className="flex items-start gap-3">
                  <div className="text-blue-600 text-xl">🔗</div>
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 mb-2">
                      Ten produkt zawiera stan magazynowy z następujących połączonych produktów:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {product.mergedProductIds.map((id: number, idx: number) => (
                        <button
                          key={id}
                          onClick={() => handleViewSlaveProduct(id)}
                          className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 transition-colors cursor-pointer"
                          title="Kliknij aby zobaczyć szczegóły"
                        >
                          #{id} {product.mergedBarcodes && product.mergedBarcodes[idx] ? `(${product.mergedBarcodes[idx]})` : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Movement History */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">
                Historia ruchów magazynowych (ostatnie 10)
              </h3>
              <Link
                to={`/inventory-movements?productId=${product.id}`}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                onClick={onClose}
              >
                Zobacz pełną historię →
              </Link>
            </div>
            {movements.length === 0 ? (
              <div className="card p-6 text-center text-gray-500">
                Brak ruchów magazynowych
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Typ</th>
                        <th>Palety</th>
                        <th>Sztuki</th>
                        <th>Powód</th>
                        <th>Użytkownik</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.slice(0, 10).map((movement) => {
                        const typeInfo = getMovementTypeLabel(movement.movementType);
                        return (
                          <tr key={movement.id}>
                            <td className="text-sm">
                              {formatDate(movement.createdAt)}
                            </td>
                            <td>
                              <span className={`font-medium ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                            <td className="text-center">
                              {movement.deltaPallets > 0 && '+'}
                              {movement.deltaPallets}
                            </td>
                            <td className="text-center font-semibold">
                              {movement.deltaUnits > 0 && '+'}
                              {movement.deltaUnits}
                            </td>
                            <td className="text-sm text-gray-600">
                              {movement.reason || '-'}
                            </td>
                            <td className="text-sm text-gray-600">
                              {movement.userEmail || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1">
              Zamknij
            </button>

          {/* Slave Product View Modal */}
          {viewingSlave && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Szczegóły połączonego produktu #{viewingSlave}
                    </h3>
                    <button
                      onClick={handleCloseSlaveView}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {loadingSlaveDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    </div>
                  ) : slaveDetails ? (
                    <div className="space-y-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-amber-700 mb-2">
                          <span className="text-lg">📦</span>
                          <span className="font-medium">Produkt zarchiwizowany (połączony)</span>
                        </div>
                        <p className="text-sm text-amber-600">
                          Stan tego produktu został przeniesiony do produktu #{product.id}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-500">Nazwa</label>
                          <p className="font-medium">{slaveDetails.name}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Kod kreskowy</label>
                          <p className="font-mono text-sm">{slaveDetails.barcode || "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Data dostawy</label>
                          <p className="text-sm">{slaveDetails.deliveryDate ? new Date(slaveDetails.deliveryDate).toLocaleDateString("pl-PL") : "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Stan przed polaczeniem</label>
                          <p className="text-sm font-medium">{slaveDetails.mergedStock || 0} szt.</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Dostawca</label>
                          <p className="text-sm">{slaveDetails.supplier?.name || "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Hodowca</label>
                          <p className="text-sm">{slaveDetails.grower || "-"}</p>
                        </div>
                      </div>

                      {slaveDetails.plantPassport && (
                        <div>
                          <label className="text-xs text-gray-500">Paszport roślin</label>
                          <p className="text-sm font-mono bg-gray-50 p-2 rounded">{slaveDetails.plantPassport}</p>
                        </div>
                      )}

                      <div className="text-xs text-gray-400 pt-2 border-t">
                        Połączono: {slaveDetails.mergedAt ? new Date(slaveDetails.mergedAt).toLocaleString("pl-PL") : "-"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      Nie udało się pobrać danych produktu
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleCloseSlaveView}
                      className="btn btn-secondary"
                    >
                      Wstecz
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
