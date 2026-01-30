import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Receipt, ReceiptWithItems, ReceiptItem } from '../types';

export function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ startDate?: string; endDate?: string }>({});
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptWithItems | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [editForm, setEditForm] = useState<{ paymentMethod: string; totalAmount: string; notes: string }>({
    paymentMethod: '',
    totalAmount: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedReceipts, setSelectedReceipts] = useState<number[]>([]);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      const data = await api.getReceipts(filter);
      setReceipts(data.receipts);
    } catch (error) {
      console.error('Error fetching receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReceiptDetails = async (id: number) => {
    try {
      setLoadingDetails(true);
      const data = await api.getReceipt(id);
      setSelectedReceipt(data.receipt);
    } catch (error) {
      console.error('Error fetching receipt details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [filter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      cash: 'Gotówka',
      card: 'Karta',
      transfer: 'Przelew',
      CASH: 'Gotówka',
      CARD: 'Karta',
      TRANSFER: 'Przelew',
    };
    return methods[method] || method;
  };

  const getCustomerDisplayName = (receipt: Receipt) => {
    if (receipt.customerName) return receipt.customerName;
    if (receipt.buyerSnapshot) {
      if (receipt.buyerSnapshot.companyName) return receipt.buyerSnapshot.companyName;
      if (receipt.buyerSnapshot.firstName && receipt.buyerSnapshot.lastName) {
        return receipt.buyerSnapshot.firstName + ' ' + receipt.buyerSnapshot.lastName;
      }
    }
    return 'Klient detaliczny';
  };

  const handleViewDetails = (receipt: Receipt) => {
    fetchReceiptDetails(receipt.id);
  };

  const handleEdit = (receipt: Receipt) => {
    setEditingReceipt(receipt);
    setEditForm({
      paymentMethod: receipt.paymentMethod,
      totalAmount: String(receipt.totalAmount),
      notes: receipt.notes || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingReceipt) return;

    setSaving(true);
    try {
      await api.updateReceipt(editingReceipt.id, {
        paymentMethod: editForm.paymentMethod,
        totalAmount: parseFloat(editForm.totalAmount),
        notes: editForm.notes || undefined,
      });
      await fetchReceipts();
      setEditingReceipt(null);
    } catch (error) {
      console.error('Error updating receipt:', error);
      alert('Błąd podczas aktualizacji paragonu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (receipt: Receipt) => {
    if (!confirm('Czy na pewno chcesz usunąć paragon ' + receipt.receiptNumber + '?')) {
      return;
    }

    setDeleting(receipt.id);
    try {
      await api.deleteReceipt(receipt.id);
      await fetchReceipts();
      if (selectedReceipt?.id === receipt.id) {
        setSelectedReceipt(null);
      }
    } catch (error) {
      console.error('Error deleting receipt:', error);
      alert('Błąd podczas usuwania paragonu');
    } finally {
      setDeleting(null);
    }
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedReceipts.length === receipts.length) {
      setSelectedReceipts([]);
    } else {
      setSelectedReceipts(receipts.map(r => r.id));
    }
  };

  const handleSelectReceipt = (id: number) => {
    setSelectedReceipts(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Print selected receipts
  const handlePrintSelected = () => {
    if (selectedReceipts.length === 0) {
      alert('Wybierz paragony do wydruku');
      return;
    }

    selectedReceipts.forEach((id, index) => {
      setTimeout(() => {
        window.open('/print/receipt/' + id, '_blank');
      }, index * 300);
    });
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedReceipts.length === 0) return;

    setBulkDeleting(true);
    try {
      const result = await api.deleteReceiptsBulk(selectedReceipts);
      alert(result.message);
      setSelectedReceipts([]);
      setShowBulkDeleteModal(false);
      await fetchReceipts();
    } catch (error: any) {
      console.error("Bulk delete error:", error);
      alert("Błąd podczas usuwania paragonów: " + (error.response?.data?.error || error.message));
    } finally {
      setBulkDeleting(false);
    }
  };

  const allSelected = receipts.length > 0 && selectedReceipts.length === receipts.length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Paragony</h1>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data od
            </label>
            <input
              type="date"
              className="input"
              value={filter.startDate || ''}
              onChange={(e) => setFilter({ ...filter, startDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data do
            </label>
            <input
              type="date"
              className="input"
              value={filter.endDate || ''}
              onChange={(e) => setFilter({ ...filter, endDate: e.target.value || undefined })}
            />
          </div>
        </div>
      </div>

      {/* Selection toolbar */}
      {selectedReceipts.length > 0 && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="text-sm text-blue-800">
              Zaznaczono <strong>{selectedReceipts.length}</strong> z {receipts.length} paragonów
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrintSelected}
                className="btn btn-primary btn-sm"
              >
                Drukuj ({selectedReceipts.length})
              </button>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="btn bg-red-600 hover:bg-red-700 text-white btn-sm"
              >
                Usuń ({selectedReceipts.length})
              </button>
              <button
                onClick={() => setSelectedReceipts([])}
                className="btn btn-secondary btn-sm"
              >
                Odznacz wszystko
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipts Table */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Ładowanie...</p>
        </div>
      ) : receipts.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">Brak paragonów do wyświetlenia</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      className="checkbox checkbox-sm"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Numer paragonu
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data wystawienia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Klient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kwota
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Metoda płatności
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className={'hover:bg-gray-50 ' + (selectedReceipts.includes(receipt.id) ? 'bg-primary-50' : '')}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedReceipts.includes(receipt.id)}
                        onChange={() => handleSelectReceipt(receipt.id)}
                        className="checkbox checkbox-sm"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {receipt.receiptNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {formatDate(receipt.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {getCustomerDisplayName(receipt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {Number(receipt.totalAmount).toFixed(2)} PLN
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {formatPaymentMethod(receipt.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => window.open('/print/receipt/' + receipt.id, '_blank')}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Drukuj
                      </button>
                      <button
                        onClick={() => handleViewDetails(receipt)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Szczegóły
                      </button>
                      <button
                        onClick={() => handleEdit(receipt)}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        Edytuj
                      </button>
                      <button
                        onClick={() => handleDelete(receipt)}
                        disabled={deleting === receipt.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        {deleting === receipt.id ? 'Usuwanie...' : 'Usuń'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipt Details Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Paragon {selectedReceipt.receiptNumber}
                </h2>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {loadingDetails ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Ładowanie szczegółów...</p>
                </div>
              ) : (
                <div className="space-y-6 p-6">
                  {/* Basic info */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Data wystawienia</p>
                      <p className="font-semibold">{formatDate(selectedReceipt.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Metoda płatności</p>
                      <p className="font-semibold">{formatPaymentMethod(selectedReceipt.paymentMethod)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Zamówienie</p>
                      <p className="font-semibold">{selectedReceipt.orderId ? '#' + selectedReceipt.orderId : '-'}</p>
                    </div>
                  </div>

                  {/* Customer info */}
                  {selectedReceipt.buyerSnapshot && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Dane nabywcy</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Nazwa</p>
                          <p className="font-medium">
                            {selectedReceipt.buyerSnapshot.companyName ||
                             (selectedReceipt.buyerSnapshot.firstName + ' ' + selectedReceipt.buyerSnapshot.lastName)}
                          </p>
                        </div>
                        {selectedReceipt.buyerSnapshot.nip && (
                          <div>
                            <p className="text-gray-500">NIP</p>
                            <p className="font-medium">{selectedReceipt.buyerSnapshot.nip}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-gray-500">Adres</p>
                          <p className="font-medium">
                            {selectedReceipt.buyerSnapshot.street}, {selectedReceipt.buyerSnapshot.postalCode} {selectedReceipt.buyerSnapshot.city}
                          </p>
                        </div>
                        {selectedReceipt.buyerSnapshot.phone && (
                          <div>
                            <p className="text-gray-500">Telefon</p>
                            <p className="font-medium">{selectedReceipt.buyerSnapshot.phone}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Items */}
                  {selectedReceipt.items && selectedReceipt.items.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Pozycje</h3>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nazwa</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ilość</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cena jedn.</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">VAT</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Wartość</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedReceipt.items.map((item: ReceiptItem) => (
                            <tr key={item.id}>
                              <td className="px-4 py-2 text-sm">{item.description}</td>
                              <td className="px-4 py-2 text-sm text-center">{item.quantity}</td>
                              <td className="px-4 py-2 text-sm text-right">{Number(item.unitPriceGross).toFixed(2)} PLN</td>
                              <td className="px-4 py-2 text-sm text-right">{Number(item.vatRate).toFixed(0)}%</td>
                              <td className="px-4 py-2 text-sm text-right font-medium">{Number(item.totalGross).toFixed(2)} PLN</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-right">Razem:</td>
                            <td className="px-4 py-2 text-sm font-bold text-right">{Number(selectedReceipt.totalAmount).toFixed(2)} PLN</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedReceipt.notes && (
                    <div>
                      <p className="text-sm text-gray-500">Notatki</p>
                      <p className="mt-1">{selectedReceipt.notes}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => window.open('/print/receipt/' + selectedReceipt.id, '_blank')}
                  className="btn btn-outline flex-1"
                >
                  Drukuj paragon
                </button>
                <button
                  onClick={() => {
                    handleEdit(selectedReceipt);
                    setSelectedReceipt(null);
                  }}
                  className="btn btn-primary flex-1"
                >
                  Edytuj
                </button>
                <button
                  onClick={() => {
                    handleDelete(selectedReceipt);
                    setSelectedReceipt(null);
                  }}
                  className="btn bg-red-600 hover:bg-red-700 text-white flex-1"
                >
                  Usuń
                </button>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="btn btn-secondary flex-1"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Receipt Modal */}
      {editingReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Edytuj paragon {editingReceipt.receiptNumber}
                </h2>
                <button
                  onClick={() => setEditingReceipt(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Metoda płatności
                  </label>
                  <select
                    value={editForm.paymentMethod}
                    onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                    className="input"
                  >
                    <option value="cash">Gotówka</option>
                    <option value="card">Karta</option>
                    <option value="transfer">Przelew</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kwota (PLN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.totalAmount}
                    onChange={(e) => setEditForm({ ...editForm, totalAmount: e.target.value })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notatki
                  </label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="input"
                    rows={3}
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="btn btn-primary flex-1"
                >
                  {saving ? 'Zapisywanie...' : 'Zapisz'}
                </button>
                <button
                  onClick={() => setEditingReceipt(null)}
                  className="btn btn-secondary flex-1"
                >
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Potwierdź usunięcie</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Czy na pewno chcesz usunąć <strong>{selectedReceipts.length}</strong> zaznaczonych paragonów?
              <br />
              <span className="text-red-600 text-sm">Ta operacja jest nieodwracalna.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {bulkDeleting ? "Usuwanie..." : "Usuń paragony"}
              </button>
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={bulkDeleting}
                className="flex-1 btn btn-secondary"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
