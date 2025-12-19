import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { NipService } from '../services/nipService';

export class NipController {
  /**
   * Wyszukuje dane firmy po numerze NIP
   * GET /nip/lookup/:nip
   */
  static async lookup(req: AuthRequest, res: Response) {
    try {
      const { nip } = req.params;

      if (!nip) {
        return res.status(400).json({ error: 'Brak numeru NIP' });
      }

      const result = await NipService.lookupByNip(nip);

      if (!result) {
        return res.status(404).json({ error: 'Nie znaleziono firmy o podanym numerze NIP' });
      }

      return res.json(result);
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
