import 'reflect-metadata';
import { container } from 'tsyringe';
import { Request, Response, Router } from 'express';
import verifyMiddleware from '../../middlewares/auth.middleware';
import * as activityUseCases from './use-cases/index';

const router = Router();

// GET /api/activity
router.get('/activity', async (req: Request, res: Response) => {
  // Public feed, no auth required
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const result = await container.resolve(activityUseCases.GetFeedUseCase).execute(limit);
  res.status(200).json(result);
});

// POST /api/activity
router.post('/activity', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.userId);
  const result = await container.resolve(activityUseCases.AddActivityUseCase).execute(userId, req.body);
  res.status(201).json(result);
});

export default router;
