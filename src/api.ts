import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import 'express-async-errors';

// ── Middlewares ───────────────────────────────────────────────────────────────
import { errorMiddleware } from './middlewares/error.middleware';

// ── Routes ────────────────────────────────────────────────────────────────────
import healthRouter from './modules/health/health.route';
import authRouter from './modules/auth/auth.route';
import beersRouter from './modules/beers/beers.route';
import usersRouter from './modules/users/users.route';
import listsRouter from './modules/lists/lists.route';

const api = express();

// ── Security & utility ────────────────────────────────────────────────────────
api.use(helmet());
api.use(compression());
api.use(morgan('dev'));

// ── CORS ──────────────────────────────────────────────────────────────────────
api.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────
api.use(express.json({ limit: '10mb' }));
api.use(express.urlencoded({ extended: true }));

// ── API routes ────────────────────────────────────────────────────────────────
const base = '/api';
api.use(base, healthRouter);
api.use(base, authRouter);
api.use(base, beersRouter);
api.use(base, usersRouter);
api.use(base, listsRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
api.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
api.use((err: unknown, req: Request, res: Response, next: NextFunction) =>
  errorMiddleware(err, req, res, next),
);

export default api;
