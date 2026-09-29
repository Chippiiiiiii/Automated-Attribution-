import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { login } from '../auth/auth.service.js';
import { env } from '../config/env.js';
import { authenticate, currentUser } from '../middleware/auth.js';

const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

/** `loginLimit` = failed+successful login attempts per IP per 15 minutes. */
export function createAuthRouter(loginLimit = env.NODE_ENV === 'test' ? 1000 : 10) {
  const router = Router();
  router.post(
    '/login',
    rateLimit({ windowMs: 15 * 60_000, limit: loginLimit, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts, try again later' } }),
    async (req, res) => {
      const { email, password } = loginSchema.parse(req.body);
      res.json(await login(email, password));
    },
  );
  router.get('/me', authenticate, (req, res) => {
    res.json(currentUser(req));
  });
  return router;
}
