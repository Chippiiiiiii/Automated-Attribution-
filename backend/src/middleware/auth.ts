import type { RequestHandler } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { userFromToken, type AuthUser } from '../auth/auth.service.js';
import { HttpError } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? await userFromToken(token) : null;
  if (!user) throw new HttpError(401, 'Authentication required');
  req.user = user;
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw new HttpError(403, 'Insufficient permissions');
    next();
  };
}

export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  return req.user;
}
