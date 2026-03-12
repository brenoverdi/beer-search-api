import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', issues: err.issues });
    return;
  }

  if (err instanceof AppError) {
    console.error(`[${err.status}] ${req.method} ${req.path}: ${err.message}`);
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof Error) {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

    // Prisma unique constraint
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'A record with that value already exists.' });
      return;
    }
    // Prisma not found
    if ((err as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }
  }

  console.error(`[UNHANDLED] ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Internal server error' });
};
