import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { CustomerModel } from '../models/Customer';
import { LoginHistoryModel } from '../models/LoginHistory';
import { SessionModel } from '../models/Session';
import { generateToken, AuthRequest } from '../middleware/auth';
import { LoginRequest, RegisterRequest, UserRole } from '../types';
import { PermissionProfileModel } from '../models/PermissionProfile';

// Helper to extract IP address from request
const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
};

const MAX_SESSIONS_PER_USER = 2;

export class AuthController {
  static async login(req: Request, res: Response) {
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;
    // Source can be passed from frontend, defaults to 'panel'
    const validSources = ['shop', 'scanner', 'panel'] as const;
    type Source = typeof validSources[number];
    const source: Source = validSources.includes(req.body.source) ? req.body.source : 'panel';

    try {
      const { email, password }: LoginRequest = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email/login i hasło są wymagane' });
      }

      // Support login by email or login field
      const user = await UserModel.getByEmailOrLogin(email);

      if (!user) {
        // Log failed login - user not found
        await LoginHistoryModel.log({
          ipAddress,
          userAgent: userAgent || undefined,
          source,
          success: false,
          errorMessage: 'Nieprawidłowy email/login'
        });
        return res.status(401).json({ error: 'Nieprawidłowy email/login lub hasło' });
      }

      if (!user.isActive) {
        // Log failed login - account inactive
        await LoginHistoryModel.log({
          userId: user.id,
          ipAddress,
          userAgent: userAgent || undefined,
          source,
          success: false,
          errorMessage: 'Konto nieaktywne'
        });
        return res.status(403).json({ error: 'Konto jest nieaktywne' });
      }

      const isPasswordValid = await UserModel.verifyPassword(user, password);

      if (!isPasswordValid) {
        // Log failed login - wrong password
        await LoginHistoryModel.log({
          userId: user.id,
          ipAddress,
          userAgent: userAgent || undefined,
          source,
          success: false,
          errorMessage: 'Nieprawidłowe hasło'
        });
        return res.status(401).json({ error: 'Nieprawidłowy email/login lub hasło' });
      }

      // === Session limit enforcement ===
      const activeCount = await SessionModel.getActiveCount(user.id);
      if (activeCount >= MAX_SESSIONS_PER_USER) {
        const kickedSessionId = await SessionModel.invalidateOldest(user.id);
        if (kickedSessionId) {
          console.log(`[Session] Invalidated oldest session ${kickedSessionId} for user ${user.id} (limit: ${MAX_SESSIONS_PER_USER})`);
        }
      }

      // Kontrahenci mają krótszą sesję (5h), pozostali 7 dni
      const tokenExpiration = user.role === UserRole.CUSTOMER ? '5h' : '7d';
      const expiresAt = new Date();
      if (user.role === UserRole.CUSTOMER) {
        expiresAt.setHours(expiresAt.getHours() + 5);
      } else {
        expiresAt.setDate(expiresAt.getDate() + 7);
      }

      // Create session record
      const sessionId = await SessionModel.create({
        userId: user.id,
        ipAddress: ipAddress,
        userAgent: userAgent || undefined,
        source,
        expiresAt,
      });

      // Log successful login
      await LoginHistoryModel.log({
        userId: user.id,
        ipAddress,
        userAgent: userAgent || undefined,
        source,
        success: true
      });

      // Pobierz uprawnienia użytkownika z profilu
      const permissions = await PermissionProfileModel.getUserPermissions(user.id);

      const token = generateToken({
        firstName: user.firstName,
        login: user.login,
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: permissions,
        sessionId: sessionId,
      }, tokenExpiration);

      const userWithoutPassword = UserModel.stripPassword(user);

      return res.json({
        token,
        user: userWithoutPassword,
        permissions: permissions,
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async logout(req: AuthRequest, res: Response) {
    try {
      const sessionId = req.user?.sessionId;
      if (sessionId) {
        await SessionModel.invalidate(sessionId);
        console.log(`[Session] User ${req.user?.email} logged out, session ${sessionId} invalidated`);
      }
      return res.json({ message: 'Wylogowano pomyślnie' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
  }

  static async getActiveSessions(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
      }
      const sessions = await SessionModel.getActiveSessions(userId);
      return res.json({ sessions });
    } catch (error) {
      console.error('Get sessions error:', error);
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
