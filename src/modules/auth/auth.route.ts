import 'reflect-metadata';
import { container } from 'tsyringe';
import { Request, Response, Router } from 'express';
import verifyMiddleware from '../../middlewares/auth.middleware';
import * as authUseCases from './use-cases/index';

const router = Router();

// POST /api/auth/register
router.post('/auth/register', async (req: Request, res: Response) => {
  const result = await container.resolve(authUseCases.RegisterUseCase).execute(req.body);
  res.status(201).json(result);
});

// POST /api/auth/verify-email
router.post('/auth/verify-email', async (req: Request, res: Response) => {
  const result = await container.resolve(authUseCases.VerifyEmailUseCase).execute(req.body);
  res.status(200).json(result);
});

// POST /api/auth/login
router.post('/auth/login', async (req: Request, res: Response) => {
  const result = await container.resolve(authUseCases.LoginUseCase).execute(req.body);
  res.status(200).json(result);
});

// POST /api/auth/refresh
router.post('/auth/refresh', async (req: Request, res: Response) => {
  const result = await container.resolve(authUseCases.RefreshUseCase).execute(req.body);
  res.status(200).json(result);
});

// POST /api/auth/logout
router.post('/auth/logout', async (req: Request, res: Response) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  const result = await container
    .resolve(authUseCases.LogoutUseCase)
    .execute(req.body, accessToken);
  res.status(200).json(result);
});

// POST /api/auth/google
router.post('/auth/google', async (req: Request, res: Response) => {
  const result = await container.resolve(authUseCases.GoogleAuthUseCase).execute(req.body);
  res.status(200).json(result);
});

// GET /api/auth/me
router.get('/auth/me', verifyMiddleware.verifyAuth, async (req: Request, res: Response) => {
  const result = await container.resolve(authUseCases.MeUseCase).execute(req.userId!);
  res.status(200).json(result);
});

export default router;
