import * as XLSX from 'xlsx';
import { query } from '../models/database';

function generateEAN13(numericPart: number): string {
  // Internal EAN-13: prefix 20 + 10-digit number + check digit
  const base = '20' + numericPart.toString().padStart(10, '0');
  // Calculate EAN-13 check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return base + checkDigit.toString();
}

async function getNextBarcodeSequence(): Promise<number> {
  const result = await query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(barcode FROM 3 FOR 10) AS BIGINT)), 0) + 1 as next_seq FROM products WHERE barcode LIKE '20%' AND LENGTH(barcode) = 13"
  );
  return parseInt(result.rows[0].next_seq) || 1;
}
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
    currency: 'EUR' | 'PLN',
    format: 'standard' | 'polflor' = 'standard'
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

      // --- Parsuj datę dostawy z wiersza 1 (komórka A1, scalona A1:G1) ---
      let deliveryDateStr: string | null = null;

      const cellA1 = worksheet['A1'];
      if (cellA1) {
        // SheetJS cell types: t='d' (date), t='s' (string), t='n' (number)
        if (cellA1.t === 'd' || (cellA1.v && cellA1.v.toString().match(/^\d{4}-\d{2}-\d{2}/))) {
          // Date type or ISO string — parse directly
          const d = new Date(cellA1.v);
          if (!isNaN(d.getTime())) {
            deliveryDateStr = d.toISOString().split('T')[0];
          }
        }
        
        if (!deliveryDateStr) {
          // Try formatted value (cell.w) or raw value as string
          const strVal = (cellA1.w || cellA1.v || '').toString().trim();
          
          // Skip if it's just a header label
          if (!strVal.toLowerCase().includes('data dostawy') || strVal.length > 20) {
            // Try DD.MM.YYYY or DD/MM/YYYY
            const match = strVal.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
            if (match) {
              const [, day, month, yearStr] = match;
              const year = yearStr.length === 2 ? '20' + yearStr : yearStr;
              deliveryDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else {
              // Try M/D/YY format (SheetJS default: "2/25/26")
              const usMatch = strVal.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
              if (usMatch) {
                const [, month, day, yearStr] = usMatch;
                const year = yearStr.length === 2 ? '20' + yearStr : yearStr;
                deliveryDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              } else {
                // Try ISO format
                const isoMatch = strVal.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) {
                  deliveryDateStr = isoMatch[0];
                }
              }
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

      let barcodeSeq = await getNextBarcodeSequence();

      // Load grower lookup maps from DB (polflor format)
      let floricodeMap = new Map<string, string>(); // floricode -> grower_name
      let growerNameMap = new Map<string, string>(); // lowercase name -> exact name
      if (format === 'polflor') {
        const growerResult = await query('SELECT floricode, grower_name FROM grower_passports WHERE grower_name IS NOT NULL');
        for (const row of growerResult.rows) {
          const code = (row.floricode || '').trim(); // no underscore, stays same
          const name = (row.growerName || '').trim(); // DB auto-converts snake_case to camelCase
          if (code && name) {
            floricodeMap.set(code, name);
          }
          if (name) {
            growerNameMap.set(name.toLowerCase(), name);
          }
        }
        console.log(`Polflor import: załadowano ${floricodeMap.size} florikodów i ${growerNameMap.size} nazw ogrodników`);
      }

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

          // Kolumna H (indeks 7): Ogrodnik — match by floricode or name against grower_passports
          let grower: string | null = null;
          if (format === 'polflor') {
            const rawValue = (row[7] || '').toString().trim();
            if (rawValue) {
              // Try floricode match (strip leading zeros for comparison)
              const stripped = rawValue.replace(/^0+/, '') || rawValue;
              const byFloricode = floricodeMap.get(stripped) || floricodeMap.get(rawValue);
              if (byFloricode) {
                grower = byFloricode;
              } else {
                // Try name match (case-insensitive)
                const byName = growerNameMap.get(rawValue.toLowerCase());
                if (byName) {
                  grower = byName;
                } else {
                  console.log(`[Row ${rowNumber}] Ogrodnik "${rawValue}" nie znaleziony w bazie — pomijam`);
                }
              }
            }
          }

          // Kolumna I (indeks 8): Kod kreskowy (barcode) — only in polflor format
          let barcode: string | null = null;
          if (format === 'polflor') {
            const barcodeStr = (row[8] || '').toString().trim();
            if (barcodeStr) {
              barcode = barcodeStr;
            }
          }

          const productData: any = {
            plantName,
            potSize,
            plantHeightCm,
            barcode: barcode || generateEAN13(barcodeSeq++),
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
            grower: grower,
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
