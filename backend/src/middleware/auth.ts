import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWTPayload, UserRole } from '../types';

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

export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};
