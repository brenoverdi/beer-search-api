import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth/jwt.service';
import { cacheGet } from '../services/cache/cache';
import { AppError } from './error.middleware';

// Extend Express Request
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
      userUsername?: string;
    }
  }
}

export const verifyToken = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Authorization header with Bearer token is required');
  }

  const token = authHeader.split(' ')[1];

  // Check cache first
  const cached = cacheGet<{ sub: number; email: string; username: string }>(`auth:${token}`);
  if (cached) {
    req.userId = cached.sub;
    req.userEmail = cached.email;
    req.userUsername = cached.username;
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userUsername = payload.username;
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired access token');
  }
};

export const optionalToken = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  const cached = cacheGet<{ sub: number; email: string; username: string }>(`auth:${token}`);
  if (cached) {
    req.userId = cached.sub;
    req.userEmail = cached.email;
    req.userUsername = cached.username;
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userUsername = payload.username;
  } catch {
    // ignore — token is optional
  }
  next();
};

export default {
  verifyAuth: [verifyToken],
  optionalAuth: [optionalToken],
};
