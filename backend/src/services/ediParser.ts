/**
 * Parser plików EDI (EDIFACT) z Royal FloraHolland
 * Format: CLOCKT - transakcje aukcyjne
 */

export interface EdiProduct {
  barcode: string;
  plantName: string;
  potSize?: string;
  plantHeightCm?: number;
  palletCount: number;
  unitsPerPallet: number;
  priceEur: number;
  imageUrl?: string;
  growerCode?: string;
  countryCode?: string;
  vbnCode?: string;
  numberOfPlants?: number;    // S03 - ilość pędów/roślin (pp)
  numberOfHeads?: number;     // S07 - ilość głów
  numberOfFlowers?: number;   // S09 - ilość kwiatów (fl)
  numberOfStems?: number;     // S11 - ilość łodyg (st)
}

export interface EdiParseResult {
  success: boolean;
  products: EdiProduct[];
  errors: string[];
  metadata: {
    transactionNumber?: string;
    transactionDate?: string;
    buyer?: string;
    auctionLocation?: string;
    documentDate?: string;
  };
}

export class EdiParser {
  /**
   * Parsuje zawartość pliku EDI i zwraca listę produktów
   */
  static parse(content: string): EdiParseResult {
    const result: EdiParseResult = {
      success: false,
      products: [],
      errors: [],
      metadata: {},
    };

    try {
      // Podziel na segmenty (separator: ')
      const segments = content.split("'").map(s => s.trim()).filter(s => s.length > 0);

      let currentProduct: Partial<EdiProduct> | null = null;

      for (const segment of segments) {
        try {
          this.processSegment(segment, currentProduct, result);

          // Sprawdź czy segment LIN rozpoczyna nowy produkt
          if (segment.startsWith('LIN+')) {
            // Zapisz poprzedni produkt jeśli istnieje i jest kompletny
            if (currentProduct && currentProduct.barcode && currentProduct.plantName) {
              result.products.push(currentProduct as EdiProduct);
            }
            // Rozpocznij nowy produkt
            currentProduct = {
              palletCount: 0,
              unitsPerPallet: 0,
              priceEur: 0,
            };

            // Wyciągnij VBN code z LIN
            const parts = segment.split('+');
            if (parts.length >= 3) {
              const vbnPart = parts[2]; // np. "106802:VBN"
              const vbnCode = vbnPart.split(':')[0];
              if (vbnCode) {
                currentProduct.vbnCode = vbnCode;
              }
            }
          } else if (currentProduct) {
            // Przetwórz segment dla bieżącego produktu
            this.processProductSegment(segment, currentProduct);
          }
        } catch (segmentError: any) {
          result.errors.push(`Błąd parsowania segmentu: ${segment.substring(0, 50)}... - ${segmentError.message}`);
        }
      }

      // Zapisz ostatni produkt
      if (currentProduct && currentProduct.barcode && currentProduct.plantName) {
        result.products.push(currentProduct as EdiProduct);
      }

      result.success = result.products.length > 0;

      console.log(`[EDI PARSER] Parsed ${result.products.length} products from EDI file`);

    } catch (error: any) {
      result.errors.push(`Błąd parsowania EDI: ${error.message}`);
    }

    return result;
  }

  /**
   * Przetwarza segment nagłówkowy (metadata)
   */
  private static processSegment(
    segment: string,
    _currentProduct: Partial<EdiProduct> | null,
    result: EdiParseResult
  ): void {
    // UNB - nagłówek wymiany
    if (segment.startsWith('UNB+')) {
      const parts = segment.split('+');
      if (parts.length >= 5) {
        // Format: UNB+UNOA:1+SENDER+RECEIVER+DATE:TIME+REF
        const dateTimePart = parts[4]; // np. "240320:1215"
        if (dateTimePart) {
          const [date] = dateTimePart.split(':');
          if (date && date.length === 6) {
            // Format YYMMDD -> YYYY-MM-DD
            const year = '20' + date.substring(0, 2);
            const month = date.substring(2, 4);
            const day = date.substring(4, 6);
            result.metadata.transactionDate = `${year}-${month}-${day}`;
          }
        }
        if (parts.length >= 6) {
          const refPart = parts[5]; // np. "338115:707598"
          result.metadata.transactionNumber = refPart.split(':')[0];
        }
      }
    }

    // NAD+BY - kupujący
    if (segment.startsWith('NAD+BY+')) {
      const parts = segment.split('+');
      if (parts.length >= 3) {
        result.metadata.buyer = parts[2];
      }
    }

    // NAD+FLA - lokalizacja aukcji
    if (segment.startsWith('NAD+FLA+')) {
      const parts = segment.split('+');
      if (parts.length >= 3) {
        result.metadata.auctionLocation = parts[2];
      }
    }

    // DTM+97 - data dokumentu (np. DTM+97:20251202:102)
    if (segment.startsWith('DTM+97:')) {
      const parts = segment.split(':');
      if (parts.length >= 2) {
        const dateStr = parts[1]; // np. "20251202"
        if (dateStr && dateStr.length === 8) {
          // Konwersja YYYYMMDD -> YYYY-MM-DD
          const year = dateStr.substring(0, 4);
          const month = dateStr.substring(4, 6);
          const day = dateStr.substring(6, 8);
          result.metadata.documentDate = year + '-' + month + '-' + day;
        }
          console.log("[EDI PARSER] Found DTM+97 documentDate:", result.metadata.documentDate);
      }
    }
  }

  /**
   * Przetwarza segment produktowy
   */
  private static processProductSegment(segment: string, product: Partial<EdiProduct>): void {
    // RFF+BT - kod kreskowy
    if (segment.startsWith('RFF+BT:')) {
      const barcode = segment.substring(7); // po "RFF+BT:"
      if (barcode && barcode.length > 0) {
        product.barcode = barcode;
      }
    }

    // RFF+IRN - URL zdjęcia
    if (segment.startsWith('RFF+IRN:')) {
      let imageUrl = segment.substring(8);
      // Zamień "https?://" na "https://"
      imageUrl = imageUrl.replace('https?://', 'https://');
      // Usuń suffix "::1" jeśli istnieje
      imageUrl = imageUrl.replace(/::1$/, '');
      product.imageUrl = imageUrl;
    }

    // NAD+MF - kod hodowcy/producenta
    if (segment.startsWith('NAD+MF+')) {
      const growerCode = segment.substring(7);
      if (growerCode) {
        product.growerCode = growerCode;
      }
    }

    // QTY+52 - sztuk na paletę
    if (segment.startsWith('QTY+52:')) {
      const qty = parseInt(segment.substring(7));
      if (!isNaN(qty)) {
        product.unitsPerPallet = qty;
      }
    }

    // QTY+66 - ilość palet/wózków
    if (segment.startsWith('QTY+66:')) {
      const qty = parseInt(segment.substring(7));
      if (!isNaN(qty)) {
        product.palletCount = qty;
      }
    }

    // PRI+INV - cena w EUR
    if (segment.startsWith('PRI+INV:')) {
      const price = parseFloat(segment.substring(8));
      if (!isNaN(price)) {
        product.priceEur = price;
      }
    }

    // IMD - charakterystyki produktu
    if (segment.startsWith('IMD++')) {
      this.processIMD(segment, product);
    }
  }

  /**
   * Przetwarza segment IMD (Item Description)
   */
  private static processIMD(segment: string, product: Partial<EdiProduct>): void {
    // Format: IMD++Sxx+value lub IMD++Sxx+:::text
    const parts = segment.split('+');
    if (parts.length < 3) return;

    const qualifier = parts[2]; // np. "S01", "S02", "S99"
    const value = parts[3] || '';

    switch (qualifier) {
      case 'S01': // Rozmiar doniczki (cm)
        // Wartość może być "19", "10,5", "17" itp.
        const potSize = value.replace(',', '.');
        product.potSize = potSize + 'Ø';
        break;

      case 'S02': // Wysokość rośliny (cm)
        // Wartość może być "55", "50-60", "140" itp.
        // Dla zakresów bierzemy pierwszą wartość
        const heightStr = value.split('-')[0];
        const height = parseInt(heightStr);
        if (!isNaN(height)) {
          product.plantHeightCm = height;
        }
        break;

      case 'S03': // Ilość pędów/roślin (pp)
        const plants = parseInt(value);
        if (!isNaN(plants)) {
          product.numberOfPlants = plants;
        }
        break;

      case 'S07': // Ilość głów (Head)
        const heads = parseInt(value);
        if (!isNaN(heads)) {
          product.numberOfHeads = heads;
        }
        break;

      case 'S09': // Ilość kwiatów (fl)
        const flowers = parseInt(value);
        if (!isNaN(flowers)) {
          product.numberOfFlowers = flowers;
        }
        break;

      case 'S11': // Ilość łodyg (st)
        const stems = parseInt(value);
        if (!isNaN(stems)) {
          product.numberOfStems = stems;
        }
        break;

      case 'S62': // Kraj pochodzenia
        product.countryCode = value;
        break;

      case 'S99': // Pełna nazwa produktu
        // Format: ":::Nazwa rośliny 19Ø 55cm"
        const nameMatch = value.match(/^:::(.+)$/);
        if (nameMatch) {
          product.plantName = nameMatch[1].trim();
        } else if (value) {
          product.plantName = value.trim();
        }
        break;
    }
  }

  /**
   * Sprawdza czy zawartość wygląda na plik EDI
   */
  static isEdiContent(content: string): boolean {
    // EDI z FloraHolland zaczyna się od UNB lub UNA
    const trimmed = content.trim();
    return trimmed.startsWith('UNB+') || trimmed.startsWith('UNA+') || trimmed.startsWith("UNA:");
  }
}
