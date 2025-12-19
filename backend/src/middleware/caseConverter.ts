import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to convert request body from snake_case to camelCase
 * This ensures compatibility with frontend that sends snake_case
 */
export function snakeToCamelMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = convertKeysToCamel(req.body);
  }
  next();
}

function convertKeysToCamel(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToCamel);

  const camelObj: any = {};
  for (const key in obj) {
    // Convert snake_case to camelCase
    const camelKey = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
    camelObj[camelKey] = convertKeysToCamel(obj[key]);
  }
  return camelObj;
}
