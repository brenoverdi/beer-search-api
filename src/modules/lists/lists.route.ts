import 'reflect-metadata';
import { container } from 'tsyringe';
import { Request, Response, Router } from 'express';
import { AppError } from '../../middlewares/error.middleware';
import verifyMiddleware from '../../middlewares/auth.middleware';
import * as listsUseCases from './use-cases/index';

const router = Router();

const assertSelf = (req: Request, userId: number): void => {
  if (req.userId !== userId) throw new AppError(403, 'Forbidden');
};

// GET /api/users/:userId/lists
router.get('/users/:userId/lists', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  assertSelf(req, userId);
  const result = await container.resolve(listsUseCases.GetListsUseCase).execute(userId);
  res.status(200).json(result);
});

// POST /api/users/:userId/lists
router.post('/users/:userId/lists', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  assertSelf(req, userId);
  const result = await container.resolve(listsUseCases.CreateListUseCase).execute(userId, req.body);
  res.status(201).json(result);
});

// GET /api/users/:userId/lists/:listId
router.get('/users/:userId/lists/:listId', verifyMiddleware.optionalAuth, async (req: Request, res: Response) => {
  const listId = Number(req.params.listId);
  const result = await container.resolve(listsUseCases.GetListByIdUseCase).execute(listId, req.userId);
  res.status(200).json(result);
});

// PUT /api/users/:userId/lists/:listId
router.put('/users/:userId/lists/:listId', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const listId = Number(req.params.listId);
  assertSelf(req, userId);
  const result = await container.resolve(listsUseCases.UpdateListUseCase).execute(listId, userId, req.body);
  res.status(200).json(result);
});

// DELETE /api/users/:userId/lists/:listId
router.delete('/users/:userId/lists/:listId', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const listId = Number(req.params.listId);
  assertSelf(req, userId);
  const result = await container.resolve(listsUseCases.DeleteListUseCase).execute(listId, userId);
  res.status(200).json(result);
});

// POST /api/users/:userId/lists/:listId/items
router.post('/users/:userId/lists/:listId/items', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const listId = Number(req.params.listId);
  assertSelf(req, userId);
  const result = await container.resolve(listsUseCases.AddListItemUseCase).execute(listId, userId, req.body);
  res.status(201).json(result);
});

// DELETE /api/users/:userId/lists/:listId/items/:beerId
router.delete('/users/:userId/lists/:listId/items/:beerId', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const listId = Number(req.params.listId);
  assertSelf(req, userId);
  const result = await container.resolve(listsUseCases.RemoveListItemUseCase).execute(listId, userId, req.params.beerId as string);
  res.status(200).json(result);
});

export default router;
