import 'reflect-metadata';
import path from 'path';
import { container } from 'tsyringe';
import { Request, Response, Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import verifyMiddleware from '../../middlewares/auth.middleware';
import * as beersUseCases from './use-cases/index';

const router = Router();

const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
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
