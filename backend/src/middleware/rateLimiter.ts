import { Request, Response, NextFunction } from 'express';

// Temporarily disabled rate limiter - just pass through
export const generalLimiter = (req: Request, res: Response, next: NextFunction) => {
  next();
};

export const authLimiter = (req: Request, res: Response, next: NextFunction) => {
  next();
};
