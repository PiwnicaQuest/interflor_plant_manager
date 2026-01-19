import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWTPayload, UserRole } from '../types';
import { PermissionProfileModel } from '../models/PermissionProfile';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

console.log('[AUTH] JWT_SECRET loaded:', JWT_SECRET ? `${JWT_SECRET.substring(0, 10)}...` : 'NOT SET');

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token autoryzacji nie został podany' });
    }

    const token = authHeader.substring(7);
    console.log('[AUTH] Verifying token:', token.substring(0, 20) + '...');
    console.log('[AUTH] Using JWT_SECRET:', JWT_SECRET.substring(0, 10) + '...');

    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    console.log('[AUTH] Token verified successfully for user:', decoded.email);

    req.user = decoded;
    return next();
  } catch (error) {
    console.log('[AUTH] Token verification failed:', error);
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token wygasł' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Nieprawidłowy token' });
    }
    return res.status(500).json({ error: 'Błąd autoryzacji' });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Brak autoryzacji' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Brak uprawnień do tej operacji' });
    }

    return next();
  };
};

/**
 * Middleware sprawdzający czy użytkownik ma określone uprawnienie
 * Działa na podstawie profilu uprawnień przypisanego do użytkownika
 * Admini mają automatycznie wszystkie uprawnienia
 */
export const requirePermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Brak autoryzacji' });
    }

    // Admin ma wszystkie uprawnienia
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }

    try {
      const hasPermission = await PermissionProfileModel.userHasPermission(req.user.userId, permission);
      
      if (!hasPermission) {
        console.log(`[AUTH] User ${req.user.email} does not have permission: ${permission}`);
        return res.status(403).json({ error: 'Brak uprawnień do tej operacji' });
      }

      return next();
    } catch (error) {
      console.error('[AUTH] Error checking permission:', error);
      return res.status(500).json({ error: 'Błąd sprawdzania uprawnień' });
    }
  };
};

/**
 * Middleware sprawdzający czy użytkownik ma jedno z określonych uprawnień (OR)
 */
export const requireAnyPermission = (permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Brak autoryzacji' });
    }

    // Admin ma wszystkie uprawnienia
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }

    try {
      const userPermissions = await PermissionProfileModel.getUserPermissions(req.user.userId);
      const hasAny = permissions.some(p => userPermissions.includes(p));
      
      if (!hasAny) {
        console.log(`[AUTH] User ${req.user.email} does not have any of permissions: ${permissions.join(', ')}`);
        return res.status(403).json({ error: 'Brak uprawnień do tej operacji' });
      }

      return next();
    } catch (error) {
      console.error('[AUTH] Error checking permissions:', error);
      return res.status(500).json({ error: 'Błąd sprawdzania uprawnień' });
    }
  };
};

/**
 * Middleware dopuszczający użytkowników z określoną rolą LUB określonym uprawnieniem
 * Admini mają automatycznie wszystkie uprawnienia
 */
export const requireRoleOrPermission = (allowedRoles: UserRole[], permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Brak autoryzacji' });
    }

    // Admin ma wszystkie uprawnienia
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }

    // Sprawdź rolę
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    // Sprawdź uprawnienie
    try {
      const hasPermission = await PermissionProfileModel.userHasPermission(req.user.userId, permission);
      
      if (hasPermission) {
        return next();
      }

      console.log(`[AUTH] User ${req.user.email} does not have role or permission for this action`);
      return res.status(403).json({ error: 'Brak uprawnień do tej operacji' });
    } catch (error) {
      console.error('[AUTH] Error checking permission:', error);
      return res.status(500).json({ error: 'Błąd sprawdzania uprawnień' });
    }
  };
};

export const optionalAuth = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      req.user = decoded;
    }

    next();
  } catch (error) {
    // Ignore token errors in optional auth
    next();
  }
};

export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>, expiresIn: string = '7d'): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
};
