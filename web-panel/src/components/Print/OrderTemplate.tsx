import { useEffect, useRef, useState } from 'react';
import { OrderItem, OrderStatus } from '../../types';
import JsBarcode from 'jsbarcode';
import { usePrint } from '../../hooks/usePrint';

interface CustomerInfo {
  customerCode?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
}

interface OrderData {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  customerId?: number;
  customerName?: string;
  customerInfo?: CustomerInfo;
  items: OrderItem[];
  totalAmount: number;
  notes?: string;
  customerNotes?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

interface OrderTemplateProps {
  data: OrderData;
  companyInfo?: {
    name: string;
    nip?: string;
    address: string;
    city: string;
    postalCode: string;
    phone?: string;
    email?: string;
  };
  showPrices?: boolean;
}

const defaultCompanyInfo = {
  name: 'Firma nie skonfigurowana',
  nip: '',
  address: 'ul. Kwiatowa 15',
  city: 'Warszawa',
  postalCode: '00-001',
  phone: '+48 123 456 789',
  email: 'zamowienia@polflor.pl',
};

// Barcode component that renders scannable barcode
function BarcodeDisplay({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value && value !== '-') {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width: 1.5,
          height: 35,
          displayValue: false,
          margin: 2,
        });
      } catch (e) {
        console.error('Barcode generation error:', e);
      }
    }
  }, [value]);

  if (!value || value === '-') {
    return <span className="text-gray-400 text-[10px]">-</span>;
  }

  return <svg ref={svgRef} className="barcode-svg"></svg>;
}

export function OrderTemplate({ data, companyInfo = defaultCompanyInfo, showPrices = true }: OrderTemplateProps) {
  const templateRef = useRef<HTMLDivElement>(null);
  const [printStatus, setPrintStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Use print hook
  const { printOrder, hasConfiguredPrinter, getConfig } = usePrint({
    onQueued: (jobId) => {
      const config = getConfig('orders');
      setPrintStatus({
        type: 'success',
        message: `Wysłano do drukarki ${config?.printerName || 'domyślnej'} (job: ${jobId.slice(0, 8)}...)`,
      });
      setTimeout(() => setPrintStatus(null), 5000);
    },
    onBrowserPrint: () => {
      setPrintStatus({
        type: 'info',
        message: 'Otwarto okno drukowania przeglądarki',
      });
      setTimeout(() => setPrintStatus(null), 3000);
    },
    onError: (error) => {
      setPrintStatus({
        type: 'error',
        message: error,
      });
    },
  });

  const hasPrinterConfigured = hasConfiguredPrinter('orders');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getStatusLabel = (status: OrderStatus) => {
    const labels: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'Oczekujące',
      [OrderStatus.IN_PROGRESS]: 'W realizacji',
      [OrderStatus.READY_FOR_PICKUP]: 'Gotowe do odbioru',
      [OrderStatus.COMPLETED]: 'Zrealizowane',
      [OrderStatus.CANCELLED]: 'Anulowane',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      [OrderStatus.IN_PROGRESS]: 'bg-purple-100 text-purple-800 border-purple-300',
      [OrderStatus.READY_FOR_PICKUP]: 'bg-green-100 text-green-800 border-green-300',
      [OrderStatus.COMPLETED]: 'bg-gray-100 text-gray-800 border-gray-300',
      [OrderStatus.CANCELLED]: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getCustomerName = () => {
    let name = '';
    if (data.customerInfo?.companyName) {
      name = data.customerInfo.companyName;
    } else if (data.customerInfo?.firstName || data.customerInfo?.lastName) {
      name = (data.customerInfo.firstName || '') + ' ' + (data.customerInfo.lastName || '');
    } else {
      name = data.customerName || 'Klient detaliczny';
    }
    // Add customerCode prefix if available
    if (data.customerInfo?.customerCode) {
      return '[' + data.customerInfo.customerCode + '] ' + name;
    }
    return name;
  };

  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);

  const handlePrint = async () => {
    setPrintStatus(null);

    // Get the full HTML content of the page
    const htmlContent = document.documentElement.outerHTML;

    await printOrder(htmlContent, {
      title: 'Zamówienie ' + data.orderNumber,
      orderId: data.id,
    });
  };

  return (
    <div ref={templateRef} className="order-template bg-white text-black p-6 max-w-[210mm] mx-auto font-sans text-xs">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .order-template { max-width: 100% !important; padding: 0 !important; font-size: 10px !important; }
          .no-print { display: none !important; }
          .product-image { max-width: 32px !important; max-height: 32px !important; }
          .barcode-svg { max-width: 140px !important; height: 35px !important; }
        }
        .barcode-svg {
          max-width: 140px;
          height: 35px;
        }
      `}</style>

      {/* Print status notification - no-print */}
      {printStatus && (
        <div className={'no-print mb-4 px-4 py-3 rounded-lg text-sm ' + (
          printStatus.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
          printStatus.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
          'bg-blue-100 text-blue-800 border border-blue-200'
        )}>
          {printStatus.message}
        </div>
      )}

      {/* Printer status indicator - no-print */}
      <div className="no-print mb-4 flex items-center gap-2 text-sm">
        <div className={'w-2 h-2 rounded-full ' + (hasPrinterConfigured ? 'bg-green-500' : 'bg-gray-400')}></div>
        <span className={hasPrinterConfigured ? 'text-green-700' : 'text-gray-600'}>
          {hasPrinterConfigured
            ? 'Drukarka zamówień skonfigurowana - automatyczny wydruk'
            : 'Brak skonfigurowanej drukarki - wydruk przez przeglądarkę'}
        </span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-4 pb-3 border-b-2 border-gray-300">
        <div>
          <h1 className="text-xl font-bold text-gray-800">ZAMÓWIENIE</h1>
          <p className="text-lg font-bold text-blue-600 mt-1">{data.orderNumber}</p>
        </div>
        <div className="text-right">
          <div className={'inline-block px-3 py-1.5 rounded-lg border-2 ' + getStatusColor(data.status)}>
            <span className="font-bold text-xs uppercase">{getStatusLabel(data.status)}</span>
          </div>
          <div className="mt-1 text-[10px] text-gray-500">
            Utworzono: {formatDate(data.createdAt)}
          </div>
        </div>
      </div>

      {/* Company & Customer Info */}
      <div className="grid grid-cols-2 gap-6 mb-4">
        <div className="bg-gray-50 p-3 rounded-lg">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Realizator</h3>
          <p className="font-bold text-xs">{companyInfo.name}</p>
          <p className="text-[11px]">{companyInfo.address}</p>
          <p className="text-[11px]">{companyInfo.postalCode} {companyInfo.city}</p>
          {companyInfo.nip && <p className="text-[11px] mt-1">NIP: <span className="font-semibold">{companyInfo.nip}</span></p>}
          {companyInfo.phone && <p className="text-[11px]">Tel: {companyInfo.phone}</p>}
          {companyInfo.email && <p className="text-[11px]">Email: {companyInfo.email}</p>}
        </div>

        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Zamawiający</h3>
          <p className="font-bold text-xs">{getCustomerName()}</p>
          {data.customerInfo?.address && <p className="text-[11px]">{data.customerInfo.address}</p>}
          {(data.customerInfo?.postalCode || data.customerInfo?.city) && (
            <p className="text-[11px]">{data.customerInfo.postalCode} {data.customerInfo.city}</p>
          )}
          {data.customerInfo?.nip && (
            <p className="text-[11px] mt-1">NIP: <span className="font-semibold">{data.customerInfo.nip}</span></p>
          )}
          {data.customerInfo?.phone && <p className="text-[11px]">Tel: {data.customerInfo.phone}</p>}
          {data.customerInfo?.email && <p className="text-[11px]">Email: {data.customerInfo.email}</p>}
        </div>
      </div>

      {/* Order Items */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2 flex items-center gap-2">
          <span>Pozycje zamówienia</span>
          <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">
            {data.items.length} {data.items.length === 1 ? 'pozycja' : data.items.length < 5 ? 'pozycje' : 'pozycji'}
          </span>
        </h3>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-1 text-left text-[10px] font-semibold w-8">Lp.</th>
              <th className="border border-gray-300 p-1 text-center text-[10px] font-semibold w-10">Foto</th>
              <th className="border border-gray-300 p-1 text-left text-[10px] font-semibold">Nazwa produktu</th>
              <th className="border border-gray-300 p-1 text-center text-[10px] font-semibold w-10">Palety</th>
              <th className="border border-gray-300 p-1 text-center text-[10px] font-semibold w-10">Szt/pal</th>
              <th className="border border-gray-300 p-1 text-center text-[10px] font-semibold w-12">Szt.</th>
              {showPrices && (
                <th className="border border-gray-300 p-1 text-right text-[10px] font-semibold w-16">Cena</th>
              )}
              <th className="border border-gray-300 p-1 text-center text-[10px] font-semibold" style={{ width: '150px' }}>Kod kreskowy</th>
              <th className="border border-gray-300 p-1 text-center text-[10px] font-semibold w-12">Skomp.</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => {
              const unitsPerPallet = item.productSnapshot?.unitsPerPallet || (item as any).unitsPerPallet || 0;
              const palletCount = unitsPerPallet > 0 ? (item.quantity / unitsPerPallet).toFixed(2) : '-';
              const imageUrl = item.productSnapshot?.imageUrl;
              const barcode = item.productSnapshot?.barcode || '';

              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border border-gray-300 p-1 text-center text-[11px]">{index + 1}</td>
                  <td className="border border-gray-300 p-0.5 text-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="product-image w-8 h-8 object-cover rounded mx-auto"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center mx-auto">
                        <span className="text-gray-400 text-[9px]">-</span>
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 p-1">
                    <span className="font-medium text-[11px]">
                      {item.productName || item.productSnapshot?.plantName || 'Produkt #' + item.productId}
                    </span>
                    {item.productSnapshot?.createdAt && (
                      <div className="text-[9px] text-gray-500 mt-0.5">
                        {new Date(item.productSnapshot.createdAt).toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 p-1 text-center text-[11px]">
                    {palletCount}
                  </td>
                  <td className="border border-gray-300 p-1 text-center text-[11px]">
                    {unitsPerPallet || '-'}
                  </td>
                  <td className="border border-gray-300 p-1 text-center font-bold text-sm">
                    {item.quantity}
                  </td>
                  {showPrices && (
                    <td className="border border-gray-300 p-1 text-right text-[11px]">
                      {(Number(item.unitPriceGross) || 0).toFixed(2)} zł
                    </td>
                  )}
                  <td className="border border-gray-300 p-0.5 text-center">
                    <BarcodeDisplay value={barcode} />
                  </td>
                  <td className="border border-gray-300 p-2 text-center">
                    <div className="w-4 h-4 border-2 border-gray-400 rounded mx-auto"></div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={5} className="border border-gray-300 p-1 text-right text-[11px]">RAZEM:</td>
              <td className="border border-gray-300 p-1 text-center text-sm">{totalQuantity}</td>
              {showPrices && (
                <td className="border border-gray-300 p-1 text-right text-blue-600 text-[11px]">
                  {(Number(data.totalAmount) || 0).toFixed(2)} zł
                </td>
              )}
              <td className="border border-gray-300 p-1"></td>
              <td className="border border-gray-300 p-1"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      {(data.notes || data.customerNotes) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {data.customerNotes && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <h3 className="text-[10px] font-semibold text-yellow-700 uppercase mb-1">Uwagi klienta</h3>
              <p className="text-[11px]">{data.customerNotes}</p>
            </div>
          )}
          {data.notes && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Notatki wewnętrzne</h3>
              <p className="text-[11px]">{data.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Summary Box - compact */}
      {showPrices && (
        <div className="flex justify-end mb-3">
          <div className="bg-blue-50 px-2 py-1 rounded border border-blue-200 inline-flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Wartość:</span>
            <span className="text-xs font-bold text-blue-600">{(Number(data.totalAmount) || 0).toFixed(2)} PLN</span>

          </div>
        </div>
      )}

      {/* Print Button */}
      <div className="no-print mt-6 text-center space-x-4">
        <button
          onClick={handlePrint}
          className="px-5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-sans text-xs flex items-center gap-2 mx-auto"
        >
          <span>🖨️</span>
          Drukuj zamówienie
        </button>
      </div>
    </div>
  );
}
