/* eslint-disable @typescript-eslint/no-unused-vars */
import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { authMiddleware, optionalAuthMiddleware } from '../../middlewares/auth.middleware';
import { ListFestivalsUseCase } from './use-cases/_list-festivals';
import { GetFestivalUseCase } from './use-cases/_get-festival';
import { CreateItineraryUseCase } from './use-cases/_create-itinerary';

const router = Router();

// ── List festivals ────────────────────────────────────────────────────────────
// GET /festivals?continent=Europe
router.get('/', async (req: Request, res: Response) => {
  const useCase = container.resolve(ListFestivalsUseCase);
  const result = await useCase.execute(req.query);
  res.json(result);
});

// ── Get single festival ───────────────────────────────────────────────────────
// GET /festivals/:id
router.get('/:id', async (req: Request, res: Response) => {
  const useCase = container.resolve(GetFestivalUseCase);
  const result = await useCase.execute(Number(req.params.id));
  res.json(result);
});

// ── Create itinerary (requires auth) ──────────────────────────────────────────
// POST /festivals/itinerary
interface AuthenticatedRequest extends Request {
  userId: number;
}

router.post('/itinerary', authMiddleware, async (req: Request, res: Response) => {
  const useCase = container.resolve(CreateItineraryUseCase);
  const result = await useCase.execute((req as AuthenticatedRequest).userId, req.body);
  res.status(201).json(result);
});

export default router;
