import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CustomerModel } from '../models/Customer';
import { UserModel } from '../models/User';
import { LookupNIPRequest, UserRole } from '../types';
import { NipService } from '../services/nipService';
import { emailService } from '../services/emailService';
import crypto from 'crypto';

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

      // Check if customer has a shop account
      let hasShopAccount = false;
      let shopAccountEmail: string | null = null;

      if (customer.userId) {
        const user = await UserModel.getById(customer.userId);
        if (user && user.role === UserRole.CUSTOMER) {
          hasShopAccount = true;
          shopAccountEmail = user.email;
        }
      }

      return res.json({
        customer,
        hasShopAccount,
        shopAccountEmail,
      });
    } catch (error) {
      console.error('Get customer error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const data = req.body;

      if (!data.street || !data.postalCode || !data.city) {
        return res.status(400).json({ error: 'Brak wymaganych pól' });
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

  static async lookupNIP(_req: AuthRequest, res: Response) {
    try {
      const { nip }: LookupNIPRequest = _req.body;

      if (!nip) {
        return res.status(400).json({ error: 'NIP jest wymagany' });
      }

      // Wyszukaj dane w API Białej Listy Podatników VAT
      const result = await NipService.lookupByNip(nip);

      if (!result) {
        return res.status(404).json({ error: 'Nie znaleziono firmy o podanym numerze NIP' });
      }

      // Mapuj dane z NipService do formatu oczekiwanego przez frontend
      const responseData = {
        companyName: result.name,
        nip: result.nip,
        regon: result.regon || '',
        street: result.street ? `${result.street}${result.houseNumber ? ' ' + result.houseNumber : ''}${result.apartmentNumber ? '/' + result.apartmentNumber : ''}` : '',
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

  /**
   * Create shop account for existing customer
   * POST /customers/:id/shop-account
   */
  static async createShopAccount(req: AuthRequest, res: Response) {
    try {
      const customerId = parseInt(req.params.id);
      const { password, sendEmail } = req.body;

      // Get customer
      const customer = await CustomerModel.getById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      // Check if customer already has a shop account
      if (customer.userId) {
        const existingUser = await UserModel.getById(customer.userId);
        if (existingUser) {
          return res.status(409).json({ error: 'Kontrahent ma już konto w sklepie' });
        }
      }
      // Check if customer has email
      if (!customer.email) {
        return res.status(400).json({ error: 'Kontrahent nie ma adresu email. Aby utworzyć konto w sklepie, najpierw dodaj adres email.' });
      }


      // Check if email is already used by another user
      const existingUserByEmail = await UserModel.getByEmail(customer.email);
      if (existingUserByEmail) {
        return res.status(409).json({ error: 'Użytkownik z tym emailem już istnieje' });
      }

      // Generate password if not provided
      const finalPassword = password || crypto.randomBytes(8).toString('hex');

      // Create user account with CUSTOMER role
      const user = await UserModel.create(customer.email, finalPassword, UserRole.CUSTOMER);

      // Link user to customer
      await CustomerModel.update(customerId, { userId: user.id });

      // Send email with credentials if requested
      let emailSent = false;
      if (sendEmail) {
        const customerName = customer.companyName ||
          (customer.firstName && customer.lastName ? `${customer.firstName} ${customer.lastName}` : undefined);
        emailSent = await emailService.sendShopCredentials(customer.email, finalPassword, customerName);
      }

      return res.status(201).json({
        message: 'Konto w sklepie utworzone',
        email: customer.email,
        password: finalPassword,
        userId: user.id,
        emailSent,
      });
    } catch (error) {
      console.error('Create shop account error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Remove shop account from customer
   * DELETE /customers/:id/shop-account
   */
  static async removeShopAccount(req: AuthRequest, res: Response) {
    try {
      const customerId = parseInt(req.params.id);

      // Get customer
      const customer = await CustomerModel.getById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      if (!customer.userId) {
        return res.status(400).json({ error: 'Kontrahent nie ma konta w sklepie' });
      }

      // Deactivate user account (don't delete to preserve history)
      await UserModel.setActive(customer.userId, false);

      // Unlink user from customer
      await CustomerModel.update(customerId, { userId: undefined });

      return res.json({ message: 'Konto w sklepie usunięte' });
    } catch (error) {
      console.error('Remove shop account error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Reset shop account password
   * POST /customers/:id/shop-account/reset-password
   */
  static async resetShopPassword(req: AuthRequest, res: Response) {
    try {
      const customerId = parseInt(req.params.id);
      const { password, sendEmail } = req.body;

      // Get customer
      const customer = await CustomerModel.getById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      if (!customer.userId) {
        return res.status(400).json({ error: 'Kontrahent nie ma konta w sklepie' });
      }

      // Generate new password if not provided
      const newPassword = password || crypto.randomBytes(8).toString('hex');

      // Update password
      await UserModel.updatePassword(customer.userId, newPassword);

      // Send email with new password if requested
      let emailSent = false;
      if (sendEmail) {
        const customerName = customer.companyName ||
          (customer.firstName && customer.lastName ? `${customer.firstName} ${customer.lastName}` : undefined);
        emailSent = await emailService.sendPasswordReset(customer.email, newPassword, customerName);
      }

      return res.json({
        message: 'Hasło zmienione',
        password: newPassword,
        emailSent,
      });
    } catch (error) {
      console.error('Reset shop password error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Send shop account credentials via email
   * POST /customers/:id/shop-account/send-credentials
   */
  static async sendCredentialsEmail(req: AuthRequest, res: Response) {
    try {
      const customerId = parseInt(req.params.id);
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: 'Hasło jest wymagane' });
      }

      // Get customer
      const customer = await CustomerModel.getById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      if (!customer.userId) {
        return res.status(400).json({ error: 'Kontrahent nie ma konta w sklepie' });
      }

      // Check if email service is configured
      if (!emailService.isConfigured()) {
        return res.status(503).json({ error: 'Usługa email nie jest skonfigurowana. Skontaktuj się z administratorem.' });
      }

      const customerName = customer.companyName ||
        (customer.firstName && customer.lastName ? `${customer.firstName} ${customer.lastName}` : undefined);

      const sent = await emailService.sendShopCredentials(customer.email, password, customerName);

      if (sent) {
        return res.json({ message: 'Email wysłany', email: customer.email });
      } else {
        return res.status(500).json({ error: 'Nie udało się wysłać emaila' });
      }
    } catch (error) {
      console.error('Send credentials email error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  /**
   * Get related data statistics for customer
   * GET /customers/:id/related-data
   */
  static async getRelatedData(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID kontrahenta' });
      }

      const customer = await CustomerModel.getById(id);
      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      const relatedData = await CustomerModel.getRelatedData(id);

      return res.json({
        customerId: id,
        customerName: customer.companyName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        ...relatedData,
      });
    } catch (error) {
      console.error('Get related data error:', error);
      return res.status(500).json({ error: 'Błąd pobierania danych powiązanych' });
    }
  }

  /**
   * Permanently delete customer with associated user account
   * DELETE /customers/:id/permanent
   */
  static async permanentDelete(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID kontrahenta' });
      }

      // Sprawdź czy kontrahent istnieje
      const customer = await CustomerModel.getById(id);
      if (!customer) {
        return res.status(404).json({ error: 'Kontrahent nie znaleziony' });
      }

      // Pobierz statystyki przed usunięciem
      const relatedData = await CustomerModel.getRelatedData(id);

      // Trwale usuń kontrahenta wraz z kontem użytkownika
      const result = await CustomerModel.hardDelete(id);

      if (!result.success) {
        return res.status(500).json({ error: 'Błąd trwałego usuwania kontrahenta' });
      }

      return res.json({
        message: 'Kontrahent został trwale usunięty',
        deletedCustomerName: customer.companyName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        deletedUserAccount: result.deletedUser,
        affectedData: {
          ordersUnlinked: relatedData.orderCount,
          invoicesUnlinked: relatedData.invoiceCount,
        },
      });
    } catch (error) {
      console.error('Permanent delete customer error:', error);
      return res.status(500).json({ error: 'Błąd trwałego usuwania kontrahenta' });
    }
  }
}
