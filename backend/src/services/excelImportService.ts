import * as XLSX from 'xlsx';
import { ProductModel } from '../models/Product';
import { SettingsModel } from '../models/Settings';

export interface ExcelImportResult {
  success: number;
  failed: number;
  skipped: number; // Pozycje pominięte (np. bez barcodu - opakowania)
  errors: Array<{ row: number; error: string; data?: any }>;
}

export class ExcelImportService {
  /**
   * Importuje produkty z pliku Excel (.xls/.xlsx)
   * Obsługuje format z plików dostawców (np. z 1PS)
   *
   * Mapowanie kolumn:
   * - Item → nazwa rośliny
   * - Identifier code → rozmiar doniczki i wysokość (np. "14.70" = 14, 70cm)
   * - AVE → liczba palet
   * - APE → sztuk na paletę
   * - Price → cena zakupu w EUR (przeliczana na PLN wg kursu z ustawień)
   * - Photo → URL zdjęcia
   * - Grower → nazwa ogrodnika
   * - Barcode (kolumna V, nie Barcode.1) → kod kreskowy
   */
  static async importProducts(fileBuffer: Buffer): Promise<ExcelImportResult> {
    const result: ExcelImportResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // Pobierz aktualne ustawienia cenowe z bazy danych (w tym kurs EUR/PLN)
      const pricingSettings = await SettingsModel.getPricingSettings();
      const { costPercentage, marginPercentage, eurToPlnRate } = pricingSettings;

      console.log('Import Excel - używany kurs EUR/PLN:', eurToPlnRate);

      // Parsuj plik Excel z opcją raw aby zachować oryginalne wartości tekstowe (np. kody kreskowe z wiodącym zerem)
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellText: true, raw: false });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Konwertuj do JSON z opcją raw:false aby uzyskać sformatowane wartości tekstowe
      const records = XLSX.utils.sheet_to_json(worksheet, { raw: false });

      console.log('Excel import: znaleziono ' + records.length + ' wierszy');

      // Przetwarzaj każdy wiersz
      for (let i = 0; i < records.length; i++) {
        const row: any = records[i];
        const rowNumber = i + 2; // +2 bo pierwszy wiersz to nagłówek

        try {
          // Kod kreskowy - kolumna "Barcode_1" (kolumna V, indeks 21)
          // WAŻNE: "Barcode" (kolumna R) zawiera same zera, właściwy kod jest w "Barcode_1"
          // XLSX dodaje "_1" do duplikatów nagłówków (nie ".1" jak pandas)
          // Używamy raw:false więc wartości są już stringami z zachowanym formatowaniem (np. wiodące zera)
          let barcode: string | null = null;
          const barcodeValue = row['Barcode_1'];

          if (barcodeValue) {
            const barcodeStr = barcodeValue.toString().trim();
            // Jeśli kod to pusty lub składa się z samych zer, ignoruj
            if (barcodeStr !== '' && barcodeStr.replace(/0/g, '') !== '') {
              barcode = barcodeStr;
            }
          }

          // FILTR: Pomijaj pozycje bez prawidłowego kodu kreskowego (np. opakowania Normtray)
          if (!barcode) {
            console.log('[Row ' + rowNumber + '] Pominięto (brak barcodu): ' + (row['Item'] || 'BRAK NAZWY'));
            result.skipped++;
            continue; // Nie liczymy jako błąd, po prostu pomijamy
          }

          // Pobierz nazwę rośliny - kolumna "Item"
          const plantName = row['Item']?.toString().trim();

          if (!plantName) {
            result.errors.push({
              row: rowNumber,
              error: 'Brak nazwy rośliny (kolumna Item)',
              data: row,
            });
            result.failed++;
            continue;
          }

          // Parsuj "Identifier code" dla doniczki i wysokości (np. "14.70" = 14, 70cm)
          const identifierCode = row['Identifier code ']?.toString() || row['Identifier code']?.toString() || '';
          let potSize: string | null = null;
          let plantHeightCm: number | null = null;

          if (identifierCode) {
            // Format: "14.70" lub "12.40" lub "8,5.20" lub "27.200.5"
            const parts = identifierCode.replace(',', '.').split('.');
            if (parts.length >= 2) {
              // Pierwsza część to rozmiar doniczki (bez "C")
              const potNumber = parseFloat(parts[0]);
              if (!isNaN(potNumber)) {
                potSize = Math.round(potNumber).toString();
              }
              // Druga część to wysokość
              const height = parseInt(parts[1]);
              if (!isNaN(height) && height > 0) {
                plantHeightCm = height;
              }
            }
          }

          // Cena zakupu w EUR - kolumna "Price" (może być w formacie "1,65" z przecinkiem)
          let purchasePriceEur = 0;
          const priceStr = row['Price']?.toString();
          if (priceStr) {
            purchasePriceEur = parseFloat(priceStr.replace(',', '.')) || 0;
          }

          // Przelicz cenę EUR na PLN
          const purchasePricePln = purchasePriceEur * eurToPlnRate;

          // Liczba palet - kolumna "AVE"
          const palletCount = parseInt(row['AVE']) || 0;

          // Sztuki na paletę - kolumna "APE"
          const unitsPerPallet = parseInt(row['APE']) || 0;

          // Zdjęcie - kolumna "Photo"
          const imageUrl = row['Photo']?.toString().trim() || null;

          // Ogrodnik - kolumna "Grower"
          const grower = row['Grower']?.toString().trim() || null;

          // Oblicz wszystkie ceny na podstawie ustawień z bazy danych
          const prices = purchasePricePln > 0
            ? SettingsModel.calculatePrices(purchasePricePln, costPercentage, marginPercentage)
            : {
                pricePlus: null,
                basePriceGross: null,
                priceDiscount10: null,
                priceDiscount12: null,
                priceDiscount15: null,
                priceDiscount20: null,
                priceDiscount25: null,
              };

          const productData: any = {
            plantName,
            potSize,
            plantHeightCm,
            barcode,
            purchasePricePln: parseFloat(purchasePricePln.toFixed(2)),
            pricePlus: prices.pricePlus,
            basePriceGross: prices.basePriceGross,
            priceDiscount10: prices.priceDiscount10,
            priceDiscount12: prices.priceDiscount12,
            priceDiscount15: prices.priceDiscount15,
            priceDiscount20: prices.priceDiscount20,
            priceDiscount25: prices.priceDiscount25,
            palletCount,
            unitsPerPallet,
            vatRate: 8.0, // Domyślna stawka VAT 8%
            imageUrl,
            grower,
            visibleInShop: false, // Domyślnie ukryte
          };


          // Sprawdź czy produkt z takim kodem kreskowym już istnieje
          if (productData.barcode && productData.barcode.length > 3) {
            const existing = await ProductModel.getByBarcode(productData.barcode);
            if (existing) {
              // Aktualizuj istniejący produkt - dodaj palety
              const newPalletCount = (existing.palletCount || 0) + (productData.palletCount || 0);
              await ProductModel.update(existing.id, { palletCount: newPalletCount });
              result.success++;
              console.log('[Row ' + rowNumber + '] Zaktualizowano: ' + plantName + ' (+' + palletCount + ' palet, razem: ' + newPalletCount + ')');
              continue;
            }
          }

          // Utwórz nowy produkt
          await ProductModel.create(productData);
          result.success++;

          console.log('[Row ' + rowNumber + '] Zaimportowano: ' + plantName + ' (' + potSize + ', ' + plantHeightCm + 'cm, ' + palletCount + ' palet x ' + unitsPerPallet + ' szt, ' + purchasePriceEur.toFixed(2) + ' EUR = ' + purchasePricePln.toFixed(2) + ' PLN, ogrodnik: ' + grower + ')');
        } catch (error: any) {
          result.errors.push({
            row: rowNumber,
            error: error.message || 'Nieznany błąd podczas dodawania produktu',
            data: row,
          });
          result.failed++;
        }
      }

      return result;
    } catch (error: any) {
      throw new Error('Błąd podczas parsowania pliku Excel: ' + error.message);
    }
  }
}
