import { Response } from 'express';
import { AuthRequest } from '../types';
import { PermissionProfileModel } from '../models/PermissionProfile';

// All available permissions grouped by category
export const AVAILABLE_PERMISSIONS = {
  inventory: {
    label: 'Magazyn',
    permissions: [
      { key: 'inventory:view', label: 'Przeglądanie magazynu' },
      { key: 'inventory:create', label: 'Dodawanie produktów' },
      { key: 'inventory:edit', label: 'Edycja produktów' },
      { key: 'inventory:delete', label: 'Usuwanie produktów' },
      { key: 'inventory:archive', label: 'Archiwizacja produktów' },
      { key: 'inventory:merge', label: 'Łączenie produktów' },
    ]
  },
  orders: {
    label: 'Zamówienia',
    permissions: [
      { key: 'orders:view', label: 'Przeglądanie zamówień' },
      { key: 'orders:create', label: 'Tworzenie zamówień' },
      { key: 'orders:edit', label: 'Edycja zamówień' },
      { key: 'orders:delete', label: 'Usuwanie zamówień' },
      { key: 'orders:cancel', label: 'Anulowanie zamówień' },
      { key: 'orders:reopen', label: 'Ponowne otwieranie zamówień' },
      { key: 'orders:status_change', label: 'Zmiana statusu zamówień' },
      { key: 'orders:transfer', label: 'Transfer zamówień' },
    ]
  },
  customers: {
    label: 'Kontrahenci',
    permissions: [
      { key: 'customers:view', label: 'Przeglądanie kontrahentów' },
      { key: 'customers:create', label: 'Dodawanie kontrahentów' },
      { key: 'customers:edit', label: 'Edycja kontrahentów' },
      { key: 'customers:delete', label: 'Usuwanie kontrahentów' },
    ]
  },
  invoices: {
    label: 'Faktury',
    permissions: [
      { key: 'invoices:view', label: 'Przeglądanie faktur' },
      { key: 'invoices:create', label: 'Wystawianie faktur' },
      { key: 'invoices:edit', label: 'Edycja faktur' },
      { key: 'invoices:delete', label: 'Usuwanie faktur' },
      { key: 'invoices:payment', label: 'Obsługa płatności' },
    ]
  },
  receipts: {
    label: 'Paragony',
    permissions: [
      { key: 'receipts:view', label: 'Przeglądanie paragonów' },
      { key: 'receipts:create', label: 'Wystawianie paragonów' },
    ]
  },
  reports: {
    label: 'Raporty',
    permissions: [
      { key: 'reports:view', label: 'Przeglądanie raportów' },
      { key: 'reports:export', label: 'Eksport raportów' },
    ]
  },
  users: {
    label: 'Użytkownicy',
    permissions: [
      { key: 'users:view', label: 'Przeglądanie użytkowników' },
      { key: 'users:create', label: 'Dodawanie użytkowników' },
      { key: 'users:edit', label: 'Edycja użytkowników' },
      { key: 'users:delete', label: 'Usuwanie użytkowników' },
    ]
  },
  settings: {
    label: 'Ustawienia',
    permissions: [
      { key: 'settings:view', label: 'Przeglądanie ustawień' },
      { key: 'settings:edit', label: 'Edycja ustawień' },
    ]
  },
  profiles: {
    label: 'Profile uprawnień',
    permissions: [
      { key: 'profiles:view', label: 'Przeglądanie profili' },
      { key: 'profiles:create', label: 'Tworzenie profili' },
      { key: 'profiles:edit', label: 'Edycja profili' },
      { key: 'profiles:delete', label: 'Usuwanie profili' },
    ]
  },
  pos: {
    label: 'Kasa (POS)',
    permissions: [
      { key: 'pos:access', label: 'Dostęp do kasy' },
      { key: 'pos:checkout', label: 'Finalizacja transakcji' },
    ]
  },
  scanner: {
    label: 'Skaner mobilny',
    permissions: [
      { key: 'scanner:access', label: 'Dostęp do skanera' },
      { key: 'scanner:scan', label: 'Skanowanie produktów' },
      { key: 'scanner:create_order', label: 'Tworzenie zamówień' },
    ]
  },
  shop: {
    label: 'Sklep internetowy',
    permissions: [
      { key: 'shop:view', label: 'Przeglądanie sklepu' },
      { key: 'shop:order', label: 'Składanie zamówień' },
    ]
  }
};

export class PermissionProfileController {
  // Get all profiles
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const profiles = await PermissionProfileModel.getAll();

      // Add user count to each profile
      const profilesWithCount = await Promise.all(
        profiles.map(async (profile) => ({
          ...profile,
          userCount: await PermissionProfileModel.getUserCount(profile.id)
        }))
      );

      res.json({ profiles: profilesWithCount });
    } catch (error) {
      console.error('Error fetching profiles:', error);
      res.status(500).json({ error: 'Błąd podczas pobierania profili' });
    }
  }

  // Get single profile by ID
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const profile = await PermissionProfileModel.getById(parseInt(id));

      if (!profile) {
        return res.status(404).json({ error: 'Profil nie został znaleziony' });
      }

      const userCount = await PermissionProfileModel.getUserCount(profile.id);

      res.json({ profile: { ...profile, userCount } });
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Błąd podczas pobierania profilu' });
    }
  }

  // Get available permissions (for UI)
  static async getAvailablePermissions(req: AuthRequest, res: Response) {
    try {
      res.json({ permissions: AVAILABLE_PERMISSIONS });
    } catch (error) {
      console.error('Error fetching permissions:', error);
      res.status(500).json({ error: 'Błąd podczas pobierania uprawnień' });
    }
  }

  // Create new profile
  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, description, color, permissions } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Nazwa profilu jest wymagana' });
      }

      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Lista uprawnień jest wymagana' });
      }

      // Check if name already exists
      const existing = await PermissionProfileModel.getByName(name.trim());
      if (existing) {
        return res.status(400).json({ error: 'Profil o tej nazwie już istnieje' });
      }

      const profile = await PermissionProfileModel.create({
        name: name.trim(),
        description: description?.trim(),
        color: color || 'gray',
        permissions
      });

      res.status(201).json({
        message: 'Profil został utworzony',
        profile
      });
    } catch (error) {
      console.error('Error creating profile:', error);
      res.status(500).json({ error: 'Błąd podczas tworzenia profilu' });
    }
  }

  // Update profile
  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, color, permissions } = req.body;

      const profile = await PermissionProfileModel.update(parseInt(id), {
        name: name?.trim(),
        description: description?.trim(),
        color,
        permissions
      });

      if (!profile) {
        return res.status(404).json({ error: 'Profil nie został znaleziony' });
      }

      res.json({
        message: 'Profil został zaktualizowany',
        profile
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      if (error.message?.includes('Nie można')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Błąd podczas aktualizacji profilu' });
    }
  }

  // Delete profile
  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const deleted = await PermissionProfileModel.delete(parseInt(id));

      if (!deleted) {
        return res.status(404).json({ error: 'Profil nie został znaleziony' });
      }

      res.json({ message: 'Profil został usunięty' });
    } catch (error: any) {
      console.error('Error deleting profile:', error);
      if (error.message?.includes('Nie można')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Błąd podczas usuwania profilu' });
    }
  }
}
