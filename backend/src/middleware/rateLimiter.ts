import rateLimit from 'express-rate-limit';

// General API rate limiter - 200 requests per minute per IP
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele zapytań, spróbuj ponownie za chwilę' },
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] as string || req.ip || 'unknown';
  },
  skip: (req) => {
    // Skip rate limiting for health checks and session heartbeats
    return req.path === '/health' || req.path === '/sessions/heartbeat';
  },
});

// Auth rate limiter - 10 attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele prób logowania, spróbuj za 15 minut' },
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] as string || req.ip || 'unknown';
  },
});
