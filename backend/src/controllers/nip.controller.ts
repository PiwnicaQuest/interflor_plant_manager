import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { NipService } from '../services/nipService';
import { AresService } from '../services/aresService';

export class NipController {
  /**
   * Wyszukuje dane firmy po numerze NIP
   * GET /nip/lookup/:nip
   */
  static async lookup(req: AuthRequest, res: Response) {
    try {
      const { nip } = req.params;

      if (!nip) {
        return res.status(400).json({ error: 'Brak numeru NIP/ICO' });
      }

      const clean = nip.replace(/[-\s]/g, '').toUpperCase();

      // Detect Czech IDs: CZxxxxxxxx (DIC) or 8-digit ICO
      const isCzechDic = /^CZ\d{8,10}$/.test(clean);
      const isCzechIco = /^\d{8}$/.test(clean);
      const isPolishNip = /^\d{10}$/.test(clean);

      if (isCzechDic || isCzechIco) {
        // Czech lookup via ARES
        let result;
        if (isCzechDic) {
          result = await AresService.lookupByDic(clean);
        } else {
          result = await AresService.lookupByIco(clean);
        }

        if (!result) {
          return res.status(404).json({ error: 'Nie znaleziono firmy w czeskim rejestrze ARES' });
        }

        const fullStreet = [result.street, result.houseNumber, result.apartmentNumber ? '/' + result.apartmentNumber : ''].filter(Boolean).join(' ').trim();

        const mapped = {
          companyName: result.name,
          nip: result.dic || result.ico,
          regon: result.ico,
          street: fullStreet,
          postalCode: result.postalCode,
          city: result.city,
          country: 'Czechy',
          statusVat: result.dic ? 'Platce DPH' : 'Neplatce DPH',
          accountNumbers: [],
          source: 'ARES',
        };

        return res.json({ ...mapped, results: [mapped] });
      }

      if (!isPolishNip) {
        return res.status(400).json({ error: 'Nieprawidlowy format. Podaj: polski NIP (10 cyfr), czeski ICO (8 cyfr) lub DIC (CZxxxxxxxx)' });
      }

      // Polish NIP lookup
      const results = await NipService.lookupAllByNip(clean);

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Nie znaleziono firmy o podanym numerze NIP' });
      }

      const mapped = results.map(r => ({
        companyName: r.name,
        nip: r.nip,
        regon: r.regon || '',
        street: r.street ? `${r.street}${r.houseNumber ? ' ' + r.houseNumber : ''}${r.apartmentNumber ? '/' + r.apartmentNumber : ''}` : '',
        postalCode: r.postalCode || '',
        city: r.city || '',
        country: r.country || 'Polska',
        statusVat: r.statusVat,
        accountNumbers: r.accountNumbers || [],
        source: r.source,
      }));

      return res.json({
        ...mapped[0],
        results: mapped,
      });
    } catch (error: any) {
      console.error('NIP lookup error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas wyszukiwania NIP' });
    }
  }

  /**
   * Sprawdza czy NIP jest aktywny VAT
   * GET /nip/vat-status/:nip
   */
  static async checkVatStatus(req: AuthRequest, res: Response) {
    try {
      const { nip } = req.params;

      if (!nip) {
        return res.status(400).json({ error: 'Brak numeru NIP' });
      }

      const isActive = await NipService.isActiveVat(nip);

      return res.json({
        nip,
        isActiveVat: isActive,
      });
    } catch (error: any) {
      console.error('VAT status check error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas sprawdzania statusu VAT' });
    }
  }
}
