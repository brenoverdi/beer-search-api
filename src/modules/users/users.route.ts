import 'reflect-metadata';
import { container } from 'tsyringe';
import { Request, Response, Router } from 'express';
import { AppError } from '../../middlewares/error.middleware';
import verifyMiddleware from '../../middlewares/auth.middleware';
import * as usersUseCases from './use-cases/index';

const router = Router();

// Helper — ensure requesting user matches :userId param
const assertSelf = (req: Request, userId: number): void => {
  if (req.userId !== userId) throw new AppError(403, 'Forbidden');
};

// GET /api/users/:userId/profile
router.get('/users/:userId/profile', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  assertSelf(req, userId);
  const result = await container.resolve(usersUseCases.GetProfileUseCase).execute(userId);
  res.status(200).json(result);
});

// GET /api/users/:userId/favorites
router.get('/users/:userId/favorites', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  assertSelf(req, userId);
  const result = await container.resolve(usersUseCases.GetFavoritesUseCase).execute(userId);
  res.status(200).json(result);
});

// POST /api/users/:userId/favorites
router.post('/users/:userId/favorites', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  assertSelf(req, userId);
  const result = await container.resolve(usersUseCases.AddFavoriteUseCase).execute(userId, req.body);
  res.status(201).json(result);
});

// DELETE /api/users/:userId/favorites/:beerId
router.delete('/users/:userId/favorites/:beerId', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  assertSelf(req, userId);
  const result = await container.resolve(usersUseCases.RemoveFavoriteUseCase).execute(userId, req.params.beerId as string);
  res.status(200).json(result);
});

// GET /api/users/:userId/history
router.get('/users/:userId/history', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  assertSelf(req, userId);
  const result = await container.resolve(usersUseCases.GetHistoryUseCase).execute(userId);
  res.status(200).json(result);
});

// POST /api/users/premium
router.post('/users/premium', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.userId);
  const result = await container.resolve(usersUseCases.UpgradePremiumUseCase).execute(userId);
  res.status(200).json(result);
});

export default router;
