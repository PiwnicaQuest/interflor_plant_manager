import { InvoiceCorrectionWithItems } from '../../types';

interface CorrectionDetailsModalProps {
  correction: InvoiceCorrectionWithItems;
  onClose: () => void;
  onPrint: () => void;
}

export function CorrectionDetailsModal({ correction, onClose, onPrint }: CorrectionDetailsModalProps) {
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pl-PL');
  const formatMoney = (amount: number) => amount.toFixed(2).replace('.', ',') + ' zł';
  const formatDiff = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return sign + amount.toFixed(2).replace('.', ',') + ' zł';
  };

  const buyer = correction.buyerSnapshot;
  const buyerName = buyer.companyName || `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-red-600 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Faktura korygująca</h2>
            <p className="text-red-200">{correction.correctionNumber}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-red-800 mb-2">Dotyczy faktury</h3>
              <p className="font-bold text-lg">{correction.originalInvoiceNumber}</p>
              <p className="text-sm text-gray-600">z dnia {formatDate(correction.originalInvoiceDate)}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-2">Nabywca</h3>
              <p className="font-bold">{buyerName}</p>
              {buyer.nip && <p className="text-sm text-gray-600">NIP: {buyer.nip}</p>}
              <p className="text-sm text-gray-600">{buyer.street}, {buyer.postalCode} {buyer.city}</p>
            </div>
          </div>

          {/* Correction reason */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-yellow-800 mb-1">Przyczyna korekty</h3>
            <p>{correction.correctionReason}</p>
          </div>

          {/* Items table */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-3">Pozycje</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left border-b">Lp.</th>
                    <th className="px-3 py-2 text-left border-b">Opis</th>
                    <th className="px-3 py-2 text-center border-b">Ilość przed</th>
                    <th className="px-3 py-2 text-center border-b">Ilość po</th>
                    <th className="px-3 py-2 text-center border-b">Różnica</th>
                    <th className="px-3 py-2 text-right border-b">Brutto przed</th>
                    <th className="px-3 py-2 text-right border-b">Brutto po</th>
                    <th className="px-3 py-2 text-right border-b">Różnica</th>
                  </tr>
                </thead>
                <tbody>
                  {correction.items.map((item, index) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">{index + 1}</td>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 text-center">{item.originalQuantity}</td>
                      <td className="px-3 py-2 text-center font-medium">{item.correctedQuantity}</td>
                      <td className={`px-3 py-2 text-center font-bold ${item.differenceQuantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.differenceQuantity >= 0 ? '+' : ''}{item.differenceQuantity}
                      </td>
                      <td className="px-3 py-2 text-right">{formatMoney(item.originalTotalGross)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(item.correctedTotalGross)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${item.differenceGross >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatDiff(item.differenceGross)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-100 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-500 mb-1">PRZED KOREKTĄ</div>
              <div className="text-xl font-bold">{formatMoney(correction.originalTotalGross)}</div>
              <div className="text-xs text-gray-500 mt-1">
                Netto: {formatMoney(correction.originalSubtotalNet)}
              </div>
              <div className="text-xs text-gray-500">
                VAT: {formatMoney(correction.originalTotalVat)}
              </div>
            </div>
            <div className="bg-green-100 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-500 mb-1">PO KOREKCIE</div>
              <div className="text-xl font-bold text-green-700">{formatMoney(correction.correctedTotalGross)}</div>
              <div className="text-xs text-gray-500 mt-1">
                Netto: {formatMoney(correction.correctedSubtotalNet)}
              </div>
              <div className="text-xs text-gray-500">
                VAT: {formatMoney(correction.correctedTotalVat)}
              </div>
            </div>
            <div className="bg-red-100 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-500 mb-1">RÓŻNICA</div>
              <div className={`text-xl font-bold ${correction.differenceGross >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatDiff(correction.differenceGross)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Netto: {formatDiff(correction.differenceNet)}
              </div>
              <div className="text-xs text-gray-500">
                VAT: {formatDiff(correction.differenceVat)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-between">
          <div className="text-sm text-gray-500">
            Wystawiono: {formatDate(correction.issueDate)}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onPrint}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              🖨️ Drukuj
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
