import { parse } from 'csv-parse/sync';
import { ProductModel } from '../models/Product';
import { SettingsModel } from '../models/Settings';

export interface CSVImportRow {
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  barcode?: string;
  purchasePricePln?: number;
  palletCount?: number;
  unitsPerPallet?: number;
}

export interface CSVImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string; data?: any }>;
}

export class CSVImportService {
  /**
   * Normalizuje kod kreskowy - dodaje wiodące zera jeśli ich brakuje
   * Standardowa długość kodu EAN-13 to 13 znaków, ale niektóre kody są dłuższe (np. 20 znaków)
   */
  static normalizeBarcode(barcode: string | undefined, expectedLength: number = 20): string | null {
    if (!barcode || barcode.trim() === '') {
      return null;
    }

    // Usuń spacje i znaki specjalne
    let normalized = barcode.trim().replace(/\s/g, '');

    // Jeśli to notacja naukowa (np. 2.39932E+18), konwertuj do normalnej liczby
    if (normalized.toLowerCase().includes('e+') || normalized.toLowerCase().includes('e-')) {
      try {
        // Użyj BigInt dla bardzo dużych liczb
        const num = BigInt(Math.round(parseFloat(normalized)));
        normalized = num.toString();
        console.log('[CSV Import] Converted scientific notation:', barcode, '->', normalized);
      } catch (e) {
        console.error('[CSV Import] Failed to convert scientific notation:', barcode);
        return normalized;
      }
    }

    // Usuń ewentualne znaki niebędące cyframi (oprócz wiodących zer)
    normalized = normalized.replace(/[^0-9]/g, '');

    // Jeśli kod jest krótszy niż oczekiwana długość, dodaj wiodące zera
    if (normalized.length > 0 && normalized.length < expectedLength) {
      const originalLength = normalized.length;
      normalized = normalized.padStart(expectedLength, '0');
      console.log('[CSV Import] Added leading zeros:', barcode, '->', normalized, `(${originalLength} -> ${expectedLength})`);
    }

    return normalized || null;
  }

  /**
   * Importuje produkty z pliku CSV
   * Format CSV (z nagłówkiem):
   * plantName,potSize,plantHeightCm,barcode,purchasePricePln,palletCount,unitsPerPallet
   */
  static async importProducts(csvContent: string): Promise<CSVImportResult> {
    const result: CSVImportResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Pobierz aktualne ustawienia cenowe z bazy danych
      const pricingSettings = await SettingsModel.getPricingSettings();
      const { costPercentage, marginPercentage } = pricingSettings;

      // Parsuj CSV
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      console.log('[CSV Import] Starting import of', records.length, 'records');

      // Przetwarzaj każdy wiersz
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2; // +2 bo pierwszy wiersz to nagłówek (index 0), a CSV startuje od 1

        try {
          // Walidacja wymaganych pól
          if (!row.plantName || row.plantName.trim() === '') {
            result.errors.push({
              row: rowNumber,
              error: 'Brak nazwy rośliny (plantName)',
              data: row,
            });
            result.failed++;
            continue;
          }

          // Konwersja typów
          const purchasePricePln = row.purchasePricePln ? parseFloat(row.purchasePricePln) : 0;
          const palletCount = row.palletCount ? parseInt(row.palletCount) : 0;
          const unitsPerPallet = row.unitsPerPallet ? parseInt(row.unitsPerPallet) : 0;

          // Normalizuj kod kreskowy - dodaj wiodące zera jeśli brakuje
          const originalBarcode = row.barcode;
          const normalizedBarcode = this.normalizeBarcode(row.barcode, 20);

          if (originalBarcode && normalizedBarcode && originalBarcode !== normalizedBarcode) {
            console.log('[CSV Import] Row', rowNumber, '- Barcode normalized:', originalBarcode, '->', normalizedBarcode);
          }

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
            plantName: row.plantName.trim(),
            potSize: row.potSize?.trim() || null,
            plantHeightCm: row.plantHeightCm ? parseInt(row.plantHeightCm) : null,
            barcode: normalizedBarcode,
            purchasePricePln,
            pricePlus: prices.pricePlus,
            basePriceGross: prices.basePriceGross,
            priceDiscount10: prices.priceDiscount10,
            priceDiscount12: prices.priceDiscount12,
            priceDiscount15: prices.priceDiscount15,
            priceDiscount20: prices.priceDiscount20,
            priceDiscount25: prices.priceDiscount25,
            palletCount,
            unitsPerPallet,
          };

          // Walidacja typów numerycznych
          if (isNaN(productData.palletCount) || productData.palletCount < 0) {
            result.errors.push({
              row: rowNumber,
              error: 'Nieprawidłowa wartość palletCount (musi być liczbą >= 0)',
              data: row,
            });
            result.failed++;
            continue;
          }

          if (isNaN(productData.unitsPerPallet) || productData.unitsPerPallet < 0) {
            result.errors.push({
              row: rowNumber,
              error: 'Nieprawidłowa wartość unitsPerPallet (musi być liczbą >= 0)',
              data: row,
            });
            result.failed++;
            continue;
          }

          if (isNaN(productData.purchasePricePln) || productData.purchasePricePln < 0) {
            result.errors.push({
              row: rowNumber,
              error: 'Nieprawidłowa wartość purchasePricePln (musi być liczbą >= 0)',
              data: row,
            });
            result.failed++;
            continue;
          }

          // Sprawdź czy produkt z takim kodem kreskowym już istnieje
          if (productData.barcode) {
            const existing = await ProductModel.getByBarcode(productData.barcode);
            if (existing) {
              result.errors.push({
                row: rowNumber,
                error: `Produkt z kodem kreskowym ${productData.barcode} już istnieje (ID: ${existing.id})`,
                data: row,
              });
              result.failed++;
              continue;
            }
          }

          // Utwórz produkt
          const created = await ProductModel.create(productData);
          console.log('[CSV Import] Row', rowNumber, '- Created product:', created.id, productData.plantName, 'barcode:', productData.barcode);
          result.success++;
        } catch (error: any) {
          console.error('[CSV Import] Row', rowNumber, '- Error:', error.message);
          result.errors.push({
            row: rowNumber,
            error: error.message || 'Nieznany błąd podczas dodawania produktu',
            data: row,
          });
          result.failed++;
        }
      }

      console.log('[CSV Import] Completed. Success:', result.success, 'Failed:', result.failed);
      return result;
    } catch (error: any) {
      console.error('[CSV Import] Parse error:', error.message);
      throw new Error(`Błąd podczas parsowania CSV: ${error.message}`);
    }
  }

  /**
   * Generuje przykładowy plik CSV do pobrania
   */
  static generateSampleCSV(): string {
    const headers = 'plantName,potSize,plantHeightCm,barcode,purchasePricePln,palletCount,unitsPerPallet';
    const example1 = 'Monstera Deliciosa,C15,50,05901234567890123456,25.00,2,50';
    const example2 = 'Ficus Elastica,C12,40,05901234567890123457,20.50,1,50';
    const example3 = 'Sansevieria Trifasciata,C10,30,05901234567890123458,18.00,3,25';

    return [headers, example1, example2, example3].join('\n');
  }
}
