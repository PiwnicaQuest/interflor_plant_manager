import * as XLSX from 'xlsx';
import { ProductModel } from '../models/Product';
import { SettingsModel } from '../models/Settings';

export interface ExcelImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string; data?: any }>;
  deliveryDate: string | null;
}

export class ExcelImportService {
  /**
   * Importuje produkty z pliku Excel/ODS w formacie "Szablon dostaw"
   *
   * Format szablonu:
   * - Wiersz 1: "Data dostawy" (merged A1:G1) — wartość daty dostawy
   * - Wiersz 2: Nagłówki (pomijane)
   * - Wiersze 3+: Dane produktów
   *
   * Kolumny:
   * A: Zdjęcie (URL) → image_url
   * B: Nazwa → plant_name (wymagane)
   * C: doniczka → pot_size
   * D: wysokość → plant_height_cm
   * E: Ilość Szt./pal → units_per_pallet
   * F: Ilość pal. → pallet_count
   * G: Cena Euro / PLN → purchase_price_pln (przeliczane wg waluty)
   */
  static async importProducts(
    fileBuffer: Buffer,
    currency: 'EUR' | 'PLN'
  ): Promise<ExcelImportResult> {
    const result: ExcelImportResult = {
      success: 0,
      failed: 0,
      errors: [],
      deliveryDate: null,
    };

    try {
      // Pobierz ustawienia cenowe (kurs EUR/PLN, marże)
      const pricingSettings = await SettingsModel.getPricingSettings();
      const { costPercentage, marginPercentage, eurToPlnRate } = pricingSettings;

      console.log(`Import Excel - waluta: ${currency}, kurs EUR/PLN: ${eurToPlnRate}`);

      // Parsuj plik (SheetJS obsługuje xlsx, xls i ods natywnie)
      const workbook = XLSX.read(fileBuffer, {
        type: 'buffer',
        cellDates: true,
        cellText: true,
        raw: false,
      });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // --- Parsuj datę dostawy z wiersza 1 ---
      // Sprawdź merged cells — data może być w A1 (merged A1:G1)
      let deliveryDateStr: string | null = null;

      // Spróbuj odczytać z A1, B1 itd. (merged cell zwykle ma wartość w pierwszej komórce)
      for (const cellAddr of ['A1', 'B1', 'C1', 'D1']) {
        const cell = worksheet[cellAddr];
        if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
          const val = cell.v;
          if (val instanceof Date) {
            deliveryDateStr = val.toISOString().split('T')[0];
          } else {
            const strVal = val.toString().trim();
            // Pomiń nagłówek "Data dostawy" — szukamy wartości daty
            if (strVal.toLowerCase().includes('data dostawy')) {
              continue;
            }
            // Spróbuj sparsować datę
            const parsed = new Date(strVal);
            if (!isNaN(parsed.getTime())) {
              deliveryDateStr = parsed.toISOString().split('T')[0];
            } else {
              // Spróbuj format DD.MM.YYYY lub DD/MM/YYYY
              const match = strVal.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
              if (match) {
                const [, day, month, year] = match;
                deliveryDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              }
            }
          }
          if (deliveryDateStr) break;
        }
      }

      // Jeśli nie znaleziono w osobnych komórkach, sprawdź czy data jest w tej samej komórce po "Data dostawy"
      if (!deliveryDateStr) {
        const cellA1 = worksheet['A1'];
        if (cellA1) {
          const fullStr = (cellA1.w || cellA1.v || '').toString().trim();
          // "Data dostawy 15.03.2026" lub "Data dostawy: 2026-03-15"
          const match = fullStr.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
          if (match) {
            const [, day, month, year] = match;
            deliveryDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            const isoMatch = fullStr.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) {
              deliveryDateStr = isoMatch[0];
            }
          }
        }
      }

      result.deliveryDate = deliveryDateStr;
      console.log('Import Excel - data dostawy:', deliveryDateStr || 'nie znaleziono');

      // --- Parsuj dane od wiersza 3 (indeks 2) ---
      // Używamy sheet_to_json z header:1 aby uzyskać tablice (nie obiekty)
      // Pomijamy wiersz 1 (data) i wiersz 2 (nagłówki)
      const allRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        blankrows: false,
      });

      // Dane zaczynają się od wiersza 3 (indeks 2 w tablicy)
      const dataRows = allRows.slice(2);

      console.log(`Excel import: znaleziono ${dataRows.length} wierszy danych`);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNumber = i + 3; // Wiersz w pliku (1-indexed, dane od wiersza 3)

        try {
          // Kolumna B (indeks 1): Nazwa — wymagane
          const plantName = (row[1] || '').toString().trim();
          if (!plantName) {
            // Pusty wiersz — pomiń cicho
            continue;
          }

          // Kolumna A (indeks 0): Zdjęcie (URL)
          const imageUrl = (row[0] || '').toString().trim() || null;

          // Kolumna C (indeks 2): doniczka
          const potSize = (row[2] || '').toString().trim() || null;

          // Kolumna D (indeks 3): wysokość (cm)
          let plantHeightCm: number | null = null;
          const heightStr = (row[3] || '').toString().replace(',', '.').trim();
          if (heightStr) {
            const h = parseInt(heightStr, 10);
            if (!isNaN(h) && h > 0) {
              plantHeightCm = h;
            }
          }

          // Kolumna E (indeks 4): Ilość Szt./pal
          let unitsPerPallet = 0;
          const unitsStr = (row[4] || '').toString().trim();
          if (unitsStr) {
            unitsPerPallet = parseInt(unitsStr, 10) || 0;
          }

          // Kolumna F (indeks 5): Ilość pal.
          let palletCount = 0;
          const palletsStr = (row[5] || '').toString().trim();
          if (palletsStr) {
            palletCount = parseInt(palletsStr, 10) || 0;
          }

          // Kolumna G (indeks 6): Cena
          let price = 0;
          const priceStr = (row[6] || '').toString().replace(',', '.').replace(/[^\d.]/g, '').trim();
          if (priceStr) {
            price = parseFloat(priceStr) || 0;
          }

          // Przelicz cenę wg waluty
          let purchasePricePln: number;
          if (currency === 'EUR') {
            purchasePricePln = price * eurToPlnRate;
          } else {
            purchasePricePln = price;
          }

          // Oblicz ceny rabatowe
          const vatRate = 8.0;
          const prices =
            purchasePricePln > 0
              ? SettingsModel.calculatePrices(purchasePricePln, costPercentage, marginPercentage, vatRate)
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
            barcode: null,
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
            vatRate,
            imageUrl,
            grower: null,
            visibleInShop: false,
            deliveryDate: deliveryDateStr || undefined,
          };

          // Utwórz nowy produkt (bez barcodu — zawsze nowy)
          await ProductModel.create(productData);
          result.success++;

          const priceInfo =
            currency === 'EUR'
              ? `${price.toFixed(2)} EUR = ${purchasePricePln.toFixed(2)} PLN`
              : `${purchasePricePln.toFixed(2)} PLN`;

          console.log(
            `[Row ${rowNumber}] Zaimportowano: ${plantName} (doniczka: ${potSize}, ` +
              `${plantHeightCm || '-'}cm, ${palletCount} pal x ${unitsPerPallet} szt, ${priceInfo})`
          );
        } catch (error: any) {
          result.errors.push({
            row: rowNumber,
            error: error.message || 'Nieznany błąd podczas dodawania produktu',
            data: { col_A: row[0], col_B: row[1], col_C: row[2], col_D: row[3], col_E: row[4], col_F: row[5], col_G: row[6] },
          });
          result.failed++;
        }
      }

      return result;
    } catch (error: any) {
      throw new Error('Błąd podczas parsowania pliku: ' + error.message);
    }
  }
}
