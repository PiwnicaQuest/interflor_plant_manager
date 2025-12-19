import { Response } from 'express';
import { UserModel } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { CreateUserRequest, UpdateUserRequest, ChangePasswordRequest, UserRole } from '../types';

export class UserController {
  /**
   * GET /users - Lista wszystkich użytkowników (bez hashy haseł)
   * Tylko dla ADMIN
   */
  static async getAll(_req: AuthRequest, res: Response) {
    try {
      const users = await UserModel.getAll();
      return res.json({ users });
    } catch (error) {
      console.error('Get all users error:', error);
      return res.status(500).json({ error: 'Błąd pobierania użytkowników' });
    }
  }

  /**
   * GET /users/:id - Szczegóły użytkownika
   * Tylko dla ADMIN
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
      }

      const user = await UserModel.getById(id);

      if (!user) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      const userWithoutPassword = UserModel.stripPassword(user);
      return res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error('Get user by id error:', error);
      return res.status(500).json({ error: 'Błąd pobierania użytkownika' });
    }
  }

  /**
   * POST /users - Tworzenie nowego użytkownika przez admina
   * Tylko dla ADMIN
   */
  static async create(req: AuthRequest, res: Response) {
    try {
      const { email, password, role }: CreateUserRequest = req.body;

      // Walidacja wymaganych pól
      if (!email || !password || !role) {
        return res.status(400).json({ error: 'Email, hasło i rola są wymagane' });
      }

      // Walidacja formatu email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Nieprawidłowy format email' });
      }

      // Walidacja hasła
      if (password.length < 6) {
        return res.status(400).json({ error: 'Hasło musi mieć minimum 6 znaków' });
      }

      // Walidacja roli
      const validRoles = Object.values(UserRole);
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Nieprawidłowa rola użytkownika' });
      }

      // Sprawdź czy email już istnieje
      const existingUser = await UserModel.getByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'Użytkownik z tym emailem już istnieje' });
      }

      // Utwórz użytkownika
      const user = await UserModel.create(email, password, role);

      return res.status(201).json({
        message: 'Użytkownik utworzony pomyślnie',
        user,
      });
    } catch (error) {
      console.error('Create user error:', error);
      return res.status(500).json({ error: 'Błąd tworzenia użytkownika' });
    }
  }

  /**
   * PUT /users/:id - Aktualizacja użytkownika (email, role, isActive)
   * Tylko dla ADMIN
   */
  static async update(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const currentUserId = req.user?.userId;

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
      }

      const { email, role, isActive }: UpdateUserRequest = req.body;

      // Walidacja - przynajmniej jedno pole musi być podane
      if (email === undefined && role === undefined && isActive === undefined) {
        return res.status(400).json({ error: 'Brak danych do aktualizacji' });
      }

      // Sprawdź czy użytkownik istnieje
      const existingUser = await UserModel.getById(id);
      if (!existingUser) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      // Zabezpieczenie: admin nie może zmienić swojej roli
      if (role !== undefined && currentUserId === id) {
        return res.status(403).json({ error: 'Nie możesz zmienić swojej własnej roli' });
      }

      // Walidacja email jeśli podany
      if (email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: 'Nieprawidłowy format email' });
        }

        // Sprawdź czy email nie jest już zajęty przez innego użytkownika
        const emailExists = await UserModel.getByEmail(email);
        if (emailExists && emailExists.id !== id) {
          return res.status(409).json({ error: 'Email jest już używany przez innego użytkownika' });
        }
      }

      // Walidacja roli jeśli podana
      if (role !== undefined) {
        const validRoles = Object.values(UserRole);
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: 'Nieprawidłowa rola użytkownika' });
        }
      }

      // Aktualizuj użytkownika
      const updatedUser = await UserModel.update(id, { email, role, isActive });

      if (!updatedUser) {
        return res.status(500).json({ error: 'Błąd aktualizacji użytkownika' });
      }

      return res.json({
        message: 'Użytkownik zaktualizowany pomyślnie',
        user: updatedUser,
      });
    } catch (error) {
      console.error('Update user error:', error);
      return res.status(500).json({ error: 'Błąd aktualizacji użytkownika' });
    }
  }

  /**
   * DELETE /users/:id - Usunięcie użytkownika (soft delete - ustaw isActive=false)
   * Tylko dla ADMIN
   */
  static async delete(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const currentUserId = req.user?.userId;

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
      }

      // Zabezpieczenie: admin nie może usunąć samego siebie
      if (currentUserId === id) {
        return res.status(403).json({ error: 'Nie możesz usunąć swojego własnego konta' });
      }

      // Sprawdź czy użytkownik istnieje
      const existingUser = await UserModel.getById(id);
      if (!existingUser) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      // Soft delete - ustaw isActive na false
      const success = await UserModel.softDelete(id);

      if (!success) {
        return res.status(500).json({ error: 'Błąd usuwania użytkownika' });
      }

      return res.json({ message: 'Użytkownik został dezaktywowany' });
    } catch (error) {
      console.error('Delete user error:', error);
      return res.status(500).json({ error: 'Błąd usuwania użytkownika' });
    }
  }

  /**
   * PATCH /users/:id/toggle-active - Toggle stanu isActive
   * Tylko dla ADMIN
   */
  static async toggleActive(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const currentUserId = req.user?.userId;

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
      }

      // Zabezpieczenie: admin nie może zmienić swojego statusu aktywności
      if (currentUserId === id) {
        return res.status(403).json({ error: 'Nie możesz zmienić statusu aktywności swojego własnego konta' });
      }

      // Sprawdź czy użytkownik istnieje
      const existingUser = await UserModel.getById(id);
      if (!existingUser) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      // Toggle isActive
      const updatedUser = await UserModel.toggleActive(id);

      if (!updatedUser) {
        return res.status(500).json({ error: 'Błąd zmiany statusu użytkownika' });
      }

      return res.json({
        message: `Użytkownik został ${updatedUser.isActive ? 'aktywowany' : 'dezaktywowany'}`,
        user: updatedUser,
      });
    } catch (error) {
      console.error('Toggle active user error:', error);
      return res.status(500).json({ error: 'Błąd zmiany statusu użytkownika' });
    }
  }

  /**
   * PATCH /users/:id/change-password - Zmiana hasła użytkownika przez admina
   * Tylko dla ADMIN
   */
  static async changePassword(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
      }

      const { newPassword }: ChangePasswordRequest = req.body;

      if (!newPassword) {
        return res.status(400).json({ error: 'Nowe hasło jest wymagane' });
      }

      // Walidacja hasła
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Hasło musi mieć minimum 6 znaków' });
      }

      // Sprawdź czy użytkownik istnieje
      const existingUser = await UserModel.getById(id);
      if (!existingUser) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      // Zmień hasło
      const success = await UserModel.changePassword(id, newPassword);

      if (!success) {
        return res.status(500).json({ error: 'Błąd zmiany hasła' });
      }

      return res.json({ message: 'Hasło zostało zmienione pomyślnie' });
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(500).json({ error: 'Błąd zmiany hasła' });
    }
  }
}
