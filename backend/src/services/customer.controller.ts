import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CustomerModel } from '../models/Customer';
import { LookupNIPRequest } from '../types';
import { NipService } from '../services/nipService';

export class CustomerController {
  static async getAll(_req: AuthRequest, res: Response) {
    try {
      const customers = await CustomerModel.getAll();
      return res.json({ customers });
    } catch (error) {
      console.error('Get customers error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const customer = await CustomerModel.getById(id);

      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      return res.json({ customer });
    } catch (error) {
      console.error('Get customer error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const data = req.body;

      if (!data.street || !data.postalCode || !data.city || !data.phone || !data.email) {
        return res.status(400).json({ error: 'Brak wymaganych pól' });
      }

      // Check if NIP already exists
      if (data.nip) {
        const existing = await CustomerModel.getByNIP(data.nip);
        if (existing) {
          return res.status(409).json({ error: 'Kontrahent z tym NIP już istnieje' });
        }
      }

      const customer = await CustomerModel.create(data);

      return res.status(201).json({
        message: 'Kontrahent dodany',
        customerId: customer.id,
      });
    } catch (error) {
      console.error('Create customer error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const data = req.body;

      const customer = await CustomerModel.update(id, data);

      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      return res.json({
        message: 'Kontrahent zaktualizowany',
        customer,
      });
    } catch (error) {
      console.error('Update customer error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      const success = await CustomerModel.delete(id);

      if (!success) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      return res.json({ message: 'Kontrahent usunięty' });
    } catch (error) {
      console.error('Delete customer error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async lookupNIP(req: AuthRequest, res: Response) {
    try {
      const { nip }: LookupNIPRequest = req.body;

      if (!nip) {
        return res.status(400).json({ error: 'NIP jest wymagany' });
      }

      // Wyszukaj dane w API Białej Listy Podatników VAT
      const result = await NipService.lookupByNip(nip);

      if (!result) {
        return res.status(404).json({ error: 'Nie znaleziono firmy o podanym numerze NIP' });
      }

      // Mapuj dane z NipService do formatu oczekiwanego przez frontend
      const houseNumberStr = result.houseNumber ? ' ' + result.houseNumber : '';
      const apartmentNumberStr = result.apartmentNumber ? '/' + result.apartmentNumber : '';
      const streetAddress = result.street ? `${result.street}${houseNumberStr}${apartmentNumberStr}` : '';

      const responseData = {
        companyName: result.name,
        nip: result.nip,
        regon: result.regon || '',
        street: streetAddress,
        postalCode: result.postalCode || '',
        city: result.city || '',
        country: result.country || 'Polska',
        statusVat: result.statusVat,
        accountNumbers: result.accountNumbers || [],
      };

      return res.json(responseData);
    } catch (error: any) {
      console.error('Lookup NIP error:', error);
      return res.status(500).json({ error: error.message || 'Błąd podczas wyszukiwania NIP' });
    }
  }
}
