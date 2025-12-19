import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { CustomerModel } from '../models/Customer';
import { generateToken } from '../middleware/auth';
import { LoginRequest, RegisterRequest, UserRole } from '../types';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password }: LoginRequest = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email i hasło są wymagane' });
      }

      const user = await UserModel.getByEmail(email);

      if (!user) {
        return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Konto jest nieaktywne' });
      }

      const isPasswordValid = await UserModel.verifyPassword(user, password);

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const userWithoutPassword = UserModel.stripPassword(user);

      return res.json({
        token,
        user: userWithoutPassword,
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const data: RegisterRequest = req.body;

      const {
        email,
        password,
        companyName,
        firstName,
        lastName,
        nip,
        street,
        postalCode,
        city,
        phone,
      } = data;

      if (!email || !password || !street || !postalCode || !city || !phone) {
        return res.status(400).json({ error: 'Wszystkie wymagane pola muszą być wypełnione' });
      }

      // Check if email already exists
      const existingUser = await UserModel.getByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'Użytkownik z tym emailem już istnieje' });
      }

      // Check if NIP already exists (if provided)
      if (nip) {
        const existingCustomer = await CustomerModel.getByNIP(nip);
        if (existingCustomer) {
          return res.status(409).json({ error: 'Kontrahent z tym NIP już istnieje' });
        }
      }

      // Create user account
      const user = await UserModel.create(email, password, UserRole.CUSTOMER);

      // Create customer record
      const customer = await CustomerModel.create({
        userId: user.id,
        companyName,
        firstName,
        lastName,
        nip,
        street,
        postalCode,
        city,
        country: 'Polska',
        phone,
        email,
        priceGroupId: 1, // Default price group
      });

      return res.status(201).json({
        message: 'Konto utworzone pomyślnie',
        userId: user.id,
        customerId: customer.id,
      });
    } catch (error) {
      console.error('Register error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async me(req: any, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Nie zalogowano' });
      }

      const user = await UserModel.getById(userId);

      if (!user) {
        return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      }

      const userWithoutPassword = UserModel.stripPassword(user);

      // If customer, include customer data
      if (user.role === UserRole.CUSTOMER) {
        const customer = await CustomerModel.getByUserId(userId);
        return res.json({
          user: userWithoutPassword,
          customer,
        });
      }

      return res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error('Me error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }
}
