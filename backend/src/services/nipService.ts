import axios from 'axios';

// Biała Lista Podatników VAT - Ministerstwo Finansów
const VAT_API_URL = 'https://wl-api.mf.gov.pl';

export interface NipLookupResult {
  nip: string;
  name: string;
  regon?: string;
  street?: string;
  houseNumber?: string;
  apartmentNumber?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  accountNumbers?: string[];
  statusVat: string;
  hasVirtualAccounts: boolean;
}

export class NipService {
  /**
   * Wyszukuje dane firmy po numerze NIP w Białej Liście Podatników VAT
   * @param nip - Numer NIP (10 cyfr, może zawierać myślniki)
   * @returns Dane firmy lub null jeśli nie znaleziono
   */
  static async lookupByNip(nip: string): Promise<NipLookupResult | null> {
    try {
      // Usuń myślniki i spacje z NIP
      const cleanNip = nip.replace(/[-\s]/g, '');

      // Walidacja NIP (10 cyfr)
      if (!/^\d{10}$/.test(cleanNip)) {
        throw new Error('Nieprawidłowy format NIP. Wymagane 10 cyfr.');
      }

      // Data dzisiejsza w formacie YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];

      // Wywołanie API białej listy VAT
      const response = await axios.get(`${VAT_API_URL}/api/search/nip/${cleanNip}`, {
        params: {
          date: today,
        },
        timeout: 10000,
      });

      if (response.status === 200 && response.data?.result?.subject) {
        const subject = response.data.result.subject;

        // Parsowanie adresu w formacie: "ULICA NUMER, KOD-POCZTOWY MIASTO"
        const fullAddress = subject.residenceAddress || subject.workingAddress || '';
        let street = '';
        let houseNumber = '';
        let apartmentNumber = '';
        let postalCode = '';
        let city = '';

        if (fullAddress) {
          // Dzielimy na część przed przecinkiem (ulica + numer) i po przecinku (kod + miasto)
          const parts = fullAddress.split(',').map((p: string) => p.trim());

          if (parts.length >= 1) {
            // Parsowanie ulicy i numeru: "ULICA NUMER" lub "ULICA NUMER/LOKAL"
            const streetPart = parts[0];
            const streetMatch = streetPart.match(/^(.+?)\s+(\d+[a-zA-Z]*)(\/(\d+[a-zA-Z]*))?$/);
            if (streetMatch) {
              street = streetMatch[1].trim();
              houseNumber = streetMatch[2];
              apartmentNumber = streetMatch[4] || '';
            } else {
              street = streetPart;
            }
          }

          if (parts.length >= 2) {
            // Parsowanie kodu pocztowego i miasta: "KOD-POCZTOWY MIASTO"
            const cityPart = parts[1];
            const cityMatch = cityPart.match(/^(\d{2}-\d{3})\s+(.+)$/);
            if (cityMatch) {
              postalCode = cityMatch[1];
              city = cityMatch[2].trim();
            } else {
              city = cityPart;
            }
          }
        }

        return {
          nip: cleanNip,
          name: subject.name || '',
          regon: subject.regon || undefined,
          street,
          houseNumber,
          apartmentNumber,
          city,
          postalCode,
          country: 'Polska',
          accountNumbers: subject.accountNumbers || [],
          statusVat: subject.statusVat || 'Unknown',
          hasVirtualAccounts: subject.hasVirtualAccounts || false,
        };
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // NIP nie znaleziony w bazie
      }

      console.error('NIP lookup error:', error.message);
      throw new Error(`Błąd podczas wyszukiwania NIP: ${error.message}`);
    }
  }

  /**
   * Sprawdza czy NIP jest aktywny w VAT
   * @param nip - Numer NIP
   * @returns true jeśli aktywny, false w przeciwnym razie
   */
  static async isActiveVat(nip: string): Promise<boolean> {
    try {
      const result = await this.lookupByNip(nip);
      return result?.statusVat === 'Czynny' || result?.statusVat === 'Active';
    } catch (error) {
      console.error('VAT status check error:', error);
      return false;
    }
  }
}
