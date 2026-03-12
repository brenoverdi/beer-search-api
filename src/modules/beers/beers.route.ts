import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { container } from 'tsyringe';
import { Request, Response, Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import verifyMiddleware from '../../middlewares/auth.middleware';
import * as beersUseCases from './use-cases/index';

const router = Router();

// os.tmpdir() → /tmp on Vercel/Lambda Linux, system temp dir on Windows — always writable
const uploadDir = path.join(os.tmpdir(), 'beer-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const searchLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: 'Too many requests — try again in a minute',
});

// GET /api/beers/popular
router.get('/beers/popular', async (_req: Request, res: Response) => {
  const result = await container.resolve(beersUseCases.GetPopularBeersUseCase).execute();
  res.status(200).json(result);
});

// POST /api/beers/search
router.post(
  '/beers/search',
  searchLimiter,
  verifyMiddleware.optionalAuth,
  upload.single('image'),
  async (req: Request, res: Response) => {
    const result = await container
      .resolve(beersUseCases.SearchBeersUseCase)
      .execute(req.body.beers, req.file, req.userId);
    res.status(200).json(result);
  },
);

export default router;
