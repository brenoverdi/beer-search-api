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
import festivalsRouter from './modules/festivals/festivals.route';
import beerOfTheDayRouter from './modules/beer-of-the-day/beer-of-the-day.route';
import breweriesRouter from './modules/breweries/breweries.route';

const api = express();

// Required for express-rate-limit to correctly read X-Forwarded-For behind Vercel's proxy
api.set('trust proxy', 1);

// ── Security & utility ────────────────────────────────────────────────────────
api.use(helmet());
api.use(compression());
api.use(morgan('dev'));

// ── CORS ──────────────────────────────────────────────────────────────────────
// FRONTEND_URL can be comma-separated for multiple origins:
//   https://beer-search-application.vercel.app,http://localhost:5173
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

api.use(
  cors({
    origin: (origin, callback) => {
      // allow server-to-server requests (no origin) and whitelisted origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
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
api.use(`${base}/festivals`, festivalsRouter);
api.use(`${base}/beer-of-the-day`, beerOfTheDayRouter);
api.use(`${base}/breweries`, breweriesRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
api.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
api.use((err: unknown, req: Request, res: Response, next: NextFunction) =>
  errorMiddleware(err, req, res, next),
);

export default api;
