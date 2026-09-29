import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { HttpError } from '../middleware/errors.js';
import { recordAudit } from '../services/audit.service.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

// Compared against when the email is unknown so response time doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !ok) {
    await recordAudit({ action: 'LOGIN_FAILED', metadata: { email } });
    throw new HttpError(401, 'Invalid credentials');
  }
  await recordAudit({ action: 'LOGIN', userId: user.id });
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
  return { token, user: toAuthUser(user) };
}

export async function userFromToken(token: string): Promise<AuthUser | null> {
  try {
    const { sub } = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const user = sub ? await prisma.user.findUnique({ where: { id: sub } }) : null;
    return user?.active ? toAuthUser(user) : null;
  } catch {
    return null;
  }
}

function toAuthUser(u: AuthUser): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
