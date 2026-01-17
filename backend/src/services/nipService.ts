import axios from 'axios';
import { GusService, GusLookupResult } from './gusService';

// Biała Lista Podatników VAT - Ministerstwo Finansów (fallback)
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
  // Dodatkowe pola z GUS
  voivodeship?: string;
  county?: string;
  commune?: string;
  companyType?: string;
  isActive?: boolean;
  source?: 'GUS' | 'MF'; // Źródło danych
}

export class NipService {
  /**
   * Wyszukuje dane firmy po numerze NIP
   * Próbuje najpierw GUS BIR API, potem fallback do Białej Listy VAT
   */
  static async lookupByNip(nip: string): Promise<NipLookupResult | null> {
    // Usuń myślniki i spacje z NIP
    const cleanNip = nip.replace(/[-\s]/g, '');

    // Walidacja NIP (10 cyfr)
    if (!/^\d{10}$/.test(cleanNip)) {
      throw new Error('Nieprawidłowy format NIP. Wymagane 10 cyfr.');
    }

    // Próbuj GUS API najpierw
    try {
      console.log('[NIP] Trying GUS API for NIP:', cleanNip);
      const gusResult = await GusService.lookupByNip(cleanNip);

      if (gusResult) {
        console.log('[NIP] Found in GUS:', gusResult.name);

        // Konwertuj wynik GUS do formatu NipLookupResult
        // Teraz musimy sprawdzić status VAT w Białej Liście
        let vatStatus = 'Nieznany';
        let accountNumbers: string[] = [];
        let hasVirtualAccounts = false;

        try {
          const vatResult = await this.checkVatStatusOnly(cleanNip);
          if (vatResult) {
            vatStatus = vatResult.statusVat;
            accountNumbers = vatResult.accountNumbers || [];
            hasVirtualAccounts = vatResult.hasVirtualAccounts || false;
          }
        } catch (vatError) {
          console.log('[NIP] Could not get VAT status, using GUS data only');
        }

        return {
          nip: gusResult.nip,
          name: gusResult.name,
          regon: gusResult.regon,
          street: gusResult.street,
          houseNumber: gusResult.houseNumber,
          apartmentNumber: gusResult.apartmentNumber,
          city: gusResult.city,
          postalCode: gusResult.postalCode,
          country: 'Polska',
          accountNumbers: accountNumbers,
          statusVat: vatStatus,
          hasVirtualAccounts: hasVirtualAccounts,
          voivodeship: gusResult.voivodeship,
          county: gusResult.county,
          commune: gusResult.commune,
          companyType: gusResult.type,
          isActive: gusResult.isActive,
          source: 'GUS',
        };
      }
    } catch (gusError: any) {
      console.error('[NIP] GUS API error:', gusError.message);
    }

    // Fallback do Białej Listy VAT
    console.log('[NIP] Falling back to Ministry of Finance API');
    return this.lookupByNipFromMF(cleanNip);
  }

  /**
   * Sprawdza tylko status VAT bez pełnych danych adresowych
   */
  private static async checkVatStatusOnly(nip: string): Promise<{
    statusVat: string;
    accountNumbers: string[];
    hasVirtualAccounts: boolean;
  } | null> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(`${VAT_API_URL}/api/search/nip/${nip}`, {
        params: { date: today },
        timeout: 10000,
      });

      if (response.status === 200 && response.data?.result?.subject) {
        const subject = response.data.result.subject;
        return {
          statusVat: subject.statusVat || 'Unknown',
          accountNumbers: subject.accountNumbers || [],
          hasVirtualAccounts: subject.hasVirtualAccounts || false,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Wyszukuje dane firmy po numerze NIP w Białej Liście Podatników VAT (Ministerstwo Finansów)
   */
  private static async lookupByNipFromMF(nip: string): Promise<NipLookupResult | null> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const response = await axios.get(`${VAT_API_URL}/api/search/nip/${nip}`, {
        params: { date: today },
        timeout: 10000,
      });

      if (response.status === 200 && response.data?.result?.subject) {
        const subject = response.data.result.subject;

        // Parsowanie adresu
        const fullAddress = subject.residenceAddress || subject.workingAddress || '';
        let street = '';
        let houseNumber = '';
        let apartmentNumber = '';
        let postalCode = '';
        let city = '';

        if (fullAddress) {
          const parts = fullAddress.split(',').map((p: string) => p.trim());

          if (parts.length >= 1) {
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
          nip: nip,
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
          source: 'MF',
        };
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }

      console.error('MF NIP lookup error:', error.message);
      throw new Error(`Błąd podczas wyszukiwania NIP: ${error.message}`);
    }
  }

  /**
   * Sprawdza czy NIP jest aktywny w VAT
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
