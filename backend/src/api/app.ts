import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { adminRouter } from './admin.routes.js';
import { rateLimit } from 'express-rate-limit';
import { createAuthRouter } from './auth.routes.js';
import { authenticate } from '../middleware/auth.js';
import { walletsRouter } from './wallets.routes.js';
import { graphRouter } from './graph.routes.js';
import { intelRouter } from './intel.routes.js';
import { casesRouter } from './cases.routes.js';
import { errorHandler } from '../middleware/errors.js';
import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';

export interface AppOptions {
  /** Requests per minute per IP across the API (default 600; 100000 in tests). */
  apiLimit?: number;
  /** Expensive analysis/report endpoints per minute per IP (default 30). */
  heavyLimit?: number;
  loginLimit?: number;
}

export function createApp(opts: AppOptions = {}) {
  const test = env.NODE_ENV === 'test';
  const apiLimit = opts.apiLimit ?? (test ? 100_000 : 600);
  const heavyLimit = opts.heavyLimit ?? (test ? 100_000 : 30);
  const limiter = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false, message: { error: 'Rate limit exceeded' } });
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected', providerMode: env.BLOCKCHAIN_PROVIDER, sahyogMode: env.SAHYOG_MODE });
    } catch (err) {
      logger.error({ err }, 'health check: database unreachable');
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  app.use('/api', limiter(apiLimit));
  const heavy = limiter(heavyLimit);
  app.post(['/api/cases/:id/analyze', '/api/cases/:id/risk', '/api/cases/:id/reports'], heavy);
  app.use('/api/graph', heavy);

  app.use('/api/auth', createAuthRouter(opts.loginLimit));
  app.use('/api/admin', adminRouter);
  app.use('/api/cases', authenticate, casesRouter);
  app.use('/api/wallets', authenticate, walletsRouter);
  app.use('/api/graph', authenticate, graphRouter);
  app.use('/api/intel', authenticate, intelRouter);
  app.use(errorHandler);

  return app;
}
